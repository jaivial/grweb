package ticketing

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// MiEntrada is the ticket page (Figma 38 · /entradas/confirmacion and /mi-entrada).
type MiEntrada struct {
	Codigo       string      `json:"codigo"`
	QR           string      `json:"qr" doc:"Contenido del código QR"`
	Nombre       string      `json:"nombre"`
	Apellidos    string      `json:"apellidos"`
	Email        string      `json:"email" doc:"Enmascarado"`
	Personas     int         `json:"personas"`
	Dentro       int         `json:"dentro"`
	Estado       string      `json:"estado" enum:"reservada,usada,anulada"`
	ValidadaAt   *time.Time  `json:"validadaAt,omitempty" doc:"Primer escaneo válido en la puerta (entradas usadas)"`
	Sesiones     []SesionPub `json:"sesiones" doc:"Días de la entrada, en orden (una entrada puede cubrir varios con un solo QR)"`
	Lugar        string      `json:"lugar"`
	PuedeCambiar bool        `json:"puedeCambiar"`
	MaxPersonas  int         `json:"maxPersonas" doc:"Máximo al que puede subir (plazas libres y límite por reserva)"`
	Compartir    string      `json:"compartir" doc:"Enlace para invitar a otras personas"`
	Novedades    string      `json:"novedades" enum:"si,no," doc:"Respuesta a las novedades: si, no o vacío (sin responder)"`
}

type tokIn struct {
	T string `query:"t" minLength:"20" maxLength:"80"`
}

type tokBody struct {
	Body struct {
		Token    string `json:"token" minLength:"20" maxLength:"80"`
		Personas int    `json:"personas,omitempty" minimum:"1" maximum:"20"`
	}
}

func maskEmail(e string) string {
	at := strings.LastIndex(e, "@")
	if at <= 0 {
		return ""
	}
	return string([]rune(e[:at])[0]) + "***" + e[at:]
}

// porToken loads a ticket by its «Mi entrada» token (404 «Enlace caducado» otherwise).
func (s *Svc) porToken(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tok string, lock bool) (uuid.UUID, uuid.UUID, compref.Comp, error) {
	var id, cid uuid.UUID
	sql := `SELECT id, competition_id FROM entradas WHERE token_hash = $1`
	if lock {
		sql += ` FOR UPDATE`
	}
	if err := q.QueryRow(ctx, sql, hashToken(tok)).Scan(&id, &cid); err != nil {
		return id, cid, compref.Comp{}, problem.NotFound("Este enlace ya no vale. Pide uno nuevo con tu email.")
	}
	c, err := s.comps.ByID(ctx, cid)
	return id, cid, c, err
}

func (s *Svc) miEntrada(ctx context.Context, c compref.Comp, id uuid.UUID) (MiEntrada, error) {
	var m MiEntrada
	var mail *string
	if err := s.a.DB.QueryRow(ctx, `SELECT codigo, nombre, apellidos, email::text, personas, (SELECT COALESCE(sum(dentro), 0) FROM entrada_sesiones WHERE entrada_id = entradas.id),
		estado, CASE WHEN consentimientos->>'novedades' = 'true' THEN 'si' WHEN consentimientos->>'novedadesNo' = 'true' THEN 'no' ELSE '' END FROM entradas WHERE id = $1`, id).
		Scan(&m.Codigo, &m.Nombre, &m.Apellidos, &mail, &m.Personas, &m.Dentro, &m.Estado, &m.Novedades); err != nil {
		return m, err
	}
	if mail != nil {
		m.Email = maskEmail(*mail)
	}
	if m.Estado == "usada" {
		if err := s.a.DB.QueryRow(ctx, `SELECT min(escaneado_at) FROM escaneos WHERE entrada_id = $1 AND resultado IN ('valida', 'manual')`, id).Scan(&m.ValidadaAt); err != nil {
			return m, err
		}
	}
	xs, err := sesionesDeEntrada(ctx, s.a.DB, id)
	if err != nil {
		return m, err
	}
	if len(xs) == 0 {
		return m, problem.NotFound("Esta entrada no tiene ningún día.")
	}
	now := time.Now()
	libres, maxPor := xs[0].Aforo, xs[0].MaxPorReserva
	for _, x := range xs {
		p := x.pub(now)
		m.Sesiones = append(m.Sesiones, p)
		libres, maxPor = min(libres, p.Libres), min(maxPor, x.MaxPorReserva)
	}
	if m.Estado != "anulada" {
		m.QR = s.qr(c.ID, m.Codigo)
	}
	m.Lugar = lugar(c)
	if c.Sede.Ciudad != "" && strings.Contains(c.Sede.Nombre, c.Sede.Ciudad) {
		m.Lugar = c.Sede.Nombre // BIZ-170: «Pabellón Municipal de Almussafes», no «…, Almussafes»
	}
	m.PuedeCambiar = m.Estado == "reservada" && now.Before(xs[0].Inicio)
	m.MaxPersonas = min(maxPor, m.Personas+libres)
	m.Compartir = s.webURL + "/entradas?ref=" + m.Codigo
	return m, nil
}

func (s *Svc) registerMiEntrada() {
	api := s.a.API
	tags := []string{"Mi entrada"}
	huma.Register(api, huma.Operation{OperationID: "mi-entrada", Method: http.MethodGet, Path: "/api/mi-entrada", Summary: "Mi entrada (enlace del email)", Tags: tags},
		func(ctx context.Context, in *tokIn) (*struct{ Body MiEntrada }, error) {
			id, _, c, err := s.porToken(ctx, s.a.DB, in.T, false)
			if err != nil {
				return nil, err
			}
			m, err := s.miEntrada(ctx, c, id)
			return &struct{ Body MiEntrada }{m}, err
		})

	huma.Register(api, huma.Operation{OperationID: "mi-entrada-personas", Method: http.MethodPut, Path: "/api/mi-entrada", Summary: "Cambiar cuántas personas venís", Tags: tags},
		func(ctx context.Context, in *tokBody) (*struct{ Body MiEntrada }, error) {
			var c compref.Comp
			var id uuid.UUID
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var cid uuid.UUID
				var err error
				if id, cid, c, err = s.porToken(ctx, tx, in.Body.Token, true); err != nil {
					return err
				}
				var antes int
				var estado string
				if err := tx.QueryRow(ctx, `SELECT personas, estado FROM entradas WHERE id = $1`, id).Scan(&antes, &estado); err != nil {
					return err
				}
				xs, err := sesionesDeEntrada(ctx, tx, id)
				if err != nil {
					return err
				}
				ids := idsDe(xs)
				slices.SortFunc(ids, func(a, b uuid.UUID) int { return strings.Compare(a.String(), b.String()) })
				n := in.Body.Personas
				for _, k := range ids {
					x, err := s.bloquearSesion(ctx, tx, cid, k)
					if err != nil {
						return err
					}
					if estado != "reservada" || !time.Now().Before(x.Inicio) {
						return problem.Conflict("NO_MODIFICABLE", "Esta entrada ya no se puede cambiar.")
					}
					if n > x.MaxPorReserva {
						return problem.Unprocessable("DEMASIADAS_PERSONAS", fmt.Sprintf("Como mucho %d personas por reserva.", x.MaxPorReserva))
					}
					if n > antes && n-antes > x.Aforo-x.Usadas-x.Ofertas {
						return problem.Conflict("AGOTADA", "No quedan plazas suficientes en esta sesión.")
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE entradas SET personas = $2, updated_at = now() WHERE id = $1`, id, n); err != nil {
					return err
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "entrada.cambiada", map[string]any{"sesionId": ids[0], "antes": antes, "personas": n}, events.Competition(cid.String()), events.ForPermission("entradas.gestionar"))); err != nil {
					return err
				}
				for _, k := range ids {
					if err := s.aforoEvento(ctx, tx, cid, k); err != nil {
						return err
					}
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, c.ID)
			m, err := s.miEntrada(ctx, c, id)
			return &struct{ Body MiEntrada }{m}, err
		})

	huma.Register(api, huma.Operation{OperationID: "mi-entrada-reenviar", Method: http.MethodPost, Path: "/api/mi-entrada/reenviar", Summary: "Reenviar la entrada por email", Tags: tags, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *tokBody) (*struct{}, error) {
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "reenviar", hashToken(in.Body.Token)), 3, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Ya te la hemos reenviado varias veces. Mira en spam.")
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				id, _, c, err := s.porToken(ctx, tx, in.Body.Token, true)
				if err != nil {
					return err
				}
				return s.reenviar(ctx, tx, c, id, in.Body.Token)
			})
		})

	huma.Register(api, huma.Operation{OperationID: "mi-entrada-anular", Method: http.MethodPost, Path: "/api/mi-entrada/anular", Summary: "Anular la entrada y liberar las plazas", Tags: tags},
		func(ctx context.Context, in *tokBody) (*struct{ Body MiEntrada }, error) {
			var c compref.Comp
			var id uuid.UUID
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var cid uuid.UUID
				var err error
				if id, cid, c, err = s.porToken(ctx, tx, in.Body.Token, true); err != nil {
					return err
				}
				return s.anular(ctx, tx, cid, id, "Anulada por su titular", true)
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, c.ID)
			m, err := s.miEntrada(ctx, c, id)
			return &struct{ Body MiEntrada }{m}, err
		})

	type avisameIn struct {
		Body struct {
			Token  string `json:"token" minLength:"20" maxLength:"80"`
			Acepta bool   `json:"acepta" doc:"true: empieza el doble opt-in al email de la entrada; false: no volver a preguntar"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "mi-entrada-avisame", Method: http.MethodPost, Path: "/api/mi-entrada/avisame", Summary: "Responder a las novedades con el email de la entrada", Tags: tags},
		func(ctx context.Context, in *avisameIn) (*struct{ Body MiEntrada }, error) {
			var c compref.Comp
			var id uuid.UUID
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var cid uuid.UUID
				var err error
				if id, cid, c, err = s.porToken(ctx, tx, in.Body.Token, true); err != nil {
					return err
				}
				var mail *string
				var nombre, ape, cod string
				var resp bool
				if err := tx.QueryRow(ctx, `SELECT email::text, nombre, apellidos, codigo, COALESCE(consentimientos->>'novedades' = 'true' OR consentimientos->>'novedadesNo' = 'true', false) FROM entradas WHERE id = $1`, id).
					Scan(&mail, &nombre, &ape, &cod, &resp); err != nil {
					return err
				}
				if resp {
					return nil // already answered: never a second opt-in email
				}
				if !in.Body.Acepta {
					_, err := tx.Exec(ctx, `UPDATE entradas SET consentimientos = consentimientos || '{"novedadesNo": true}', updated_at = now() WHERE id = $1`, id)
					return err
				}
				if mail == nil {
					return problem.Conflict("SIN_EMAIL", "Esta entrada no tiene email.")
				}
				ip := httpx.ClientIPFrom(ctx)
				if _, err := tx.Exec(ctx, `UPDATE entradas SET consentimientos = consentimientos || jsonb_build_object('novedades', true, 'novedadesAt', now()), updated_at = now() WHERE id = $1`, id); err != nil {
					return err
				}
				return contacto(ctx, tx, cid, map[string]any{"email": *mail, "nombre": strings.TrimSpace(nombre + " " + ape), "origen": "entradas", "novedades": true, "ip": ip,
					"actividad": map[string]any{"tipo": "novedades", "titulo": "Pidió las novedades", "detalle": "/entradas/confirmacion · " + cod}})
			})
			if err != nil {
				return nil, err
			}
			m, err := s.miEntrada(ctx, c, id)
			return &struct{ Body MiEntrada }{m}, err
		})

	type icsOut struct {
		ContentType string `header:"Content-Type"`
		Disposition string `header:"Content-Disposition"`
		Body        []byte
	}
	huma.Register(api, huma.Operation{OperationID: "mi-entrada-ics", Method: http.MethodGet, Path: "/api/mi-entrada/calendario.ics", Summary: "Añadir al calendario", Tags: tags},
		func(ctx context.Context, in *tokIn) (*icsOut, error) {
			id, _, c, err := s.porToken(ctx, s.a.DB, in.T, false)
			if err != nil {
				return nil, err
			}
			m, err := s.miEntrada(ctx, c, id)
			if err != nil {
				return nil, err
			}
			if m.Estado == "anulada" {
				return nil, problem.New(http.StatusGone, "ENTRADA_ANULADA", "Esta entrada está anulada.")
			}
			xs, err := sesionesDeEntrada(ctx, s.a.DB, id)
			if err != nil || len(xs) == 0 {
				return nil, err
			}
			ts := func(t time.Time) string { return t.UTC().Format("20060102T150405Z") }
			esc := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`)
			lines := []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GR Strength Cup//Entradas//ES", "METHOD:PUBLISH", "BEGIN:VEVENT",
				"UID:" + m.Codigo + "@grcup", "DTSTAMP:" + ts(time.Now()), "DTSTART:" + ts(xs[0].Puertas), "DTEND:" + ts(xs[len(xs)-1].Fin),
				"SUMMARY:" + esc.Replace(c.Nombre+" · "+variosDias(xs).Nombre), "LOCATION:" + esc.Replace(m.Lugar),
				"DESCRIPTION:" + esc.Replace(fmt.Sprintf("Entrada %s · %d persona(s). Enseña el QR en la puerta: %s/mi-entrada", m.Codigo, m.Personas, s.webURL)),
				"BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Mañana es el día", "TRIGGER:-P1D", "END:VALARM", "END:VEVENT", "END:VCALENDAR"}
			return &icsOut{ContentType: "text/calendar; charset=utf-8", Disposition: `attachment; filename="entrada-` + m.Codigo + `.ics"`, Body: []byte(strings.Join(lines, "\r\n") + "\r\n")}, nil
		})
}

// reenviar queues the confirmation again with the current link.
func (s *Svc) reenviar(ctx context.Context, tx pgx.Tx, c compref.Comp, id uuid.UUID, tok string) error {
	var cod, nombre, ape string
	var mail *string
	var personas int
	if err := tx.QueryRow(ctx, `SELECT codigo, nombre, apellidos, email::text, personas FROM entradas WHERE id = $1 AND estado <> 'anulada'`, id).Scan(&cod, &nombre, &ape, &mail, &personas); err != nil {
		return problem.Conflict("ENTRADA_ANULADA", "Esta entrada está anulada.")
	}
	if mail == nil {
		return problem.Conflict("SIN_EMAIL", "Esta entrada no tiene email.")
	}
	if tok == "" {
		// From the backoffice: the ticket's link (the same as in its other emails).
		var err error
		if tok, err = s.enlaceEntrada(ctx, tx, id); err != nil {
			return err
		}
	}
	xs, err := sesionesDeEntrada(ctx, tx, id)
	if err != nil {
		return err
	}
	return email(ctx, tx, c.ID, *mail, "entrada-confirmada", s.varsEntrada(c, xs, cod, tok, nombre, ape, personas))
}

// anular cancels a ticket (its QR stops working), announces the freed places and, if asked, emails the holder.
func (s *Svc) anular(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, motivo string, avisar bool) error {
	var estado, cod, nombre string
	var mail *string
	if err := tx.QueryRow(ctx, `SELECT estado, codigo, nombre, email::text FROM entradas WHERE id = $1 FOR UPDATE`, id).Scan(&estado, &cod, &nombre, &mail); err != nil {
		return err
	}
	if estado == "anulada" {
		return problem.Conflict("YA_ANULADA", "Esta entrada ya estaba anulada.")
	}
	if estado == "usada" {
		return problem.Conflict("ENTRADA_USADA", "Esta entrada ya se ha usado en la puerta.")
	}
	if _, err := tx.Exec(ctx, `UPDATE entradas SET estado = 'anulada', anulada_at = now(), motivo = $2, updated_at = now() WHERE id = $1`, id, motivo); err != nil {
		return err
	}
	xs, err := sesionesDeEntrada(ctx, tx, id)
	if err != nil {
		return err
	}
	if avisar && mail != nil {
		var sesion string
		_ = tx.QueryRow(ctx, `SELECT string_agg(s.nombre, ' + ' ORDER BY s.inicio) FROM entrada_sesiones es JOIN sesiones s ON s.id = es.sesion_id WHERE es.entrada_id = $1`, id).Scan(&sesion)
		if err := email(ctx, tx, cid, *mail, "entrada-anulada", map[string]string{"nombre": nombre, "codigo": cod, "sesion": sesion, "entradas": s.webURL + "/entradas"}); err != nil {
			return err
		}
	}
	if err := events.Enqueue(ctx, tx, events.New(ctx, "entrada.anulada", map[string]any{"codigo": cod, "sesionId": xs[0].ID, "motivo": motivo}, events.Competition(cid.String()), events.ForPermission("entradas.gestionar"))); err != nil {
		return err
	}
	for _, x := range xs {
		if err := s.aforoEvento(ctx, tx, cid, x.ID); err != nil {
			return err
		}
	}
	return nil
}
