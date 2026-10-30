package ticketing

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// MiEntrada is the ticket page (Figma 38 · /entradas/confirmacion and /mi-entrada).
type MiEntrada struct {
	Codigo       string    `json:"codigo"`
	QR           string    `json:"qr" doc:"Contenido del código QR"`
	Nombre       string    `json:"nombre"`
	Apellidos    string    `json:"apellidos"`
	Email        string    `json:"email" doc:"Enmascarado"`
	Personas     int       `json:"personas"`
	Dentro       int       `json:"dentro"`
	Estado       string    `json:"estado" enum:"reservada,usada,anulada"`
	Sesion       SesionPub `json:"sesion"`
	Lugar        string    `json:"lugar"`
	PuedeCambiar bool      `json:"puedeCambiar"`
	MaxPersonas  int       `json:"maxPersonas" doc:"Máximo al que puede subir (plazas libres y límite por reserva)"`
	Compartir    string    `json:"compartir" doc:"Enlace para invitar a otras personas"`
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
	var sid uuid.UUID
	var mail *string
	if err := s.a.DB.QueryRow(ctx, `SELECT codigo, nombre, apellidos, email::text, personas, dentro, estado, sesion_id FROM entradas WHERE id = $1`, id).
		Scan(&m.Codigo, &m.Nombre, &m.Apellidos, &mail, &m.Personas, &m.Dentro, &m.Estado, &sid); err != nil {
		return m, err
	}
	if mail != nil {
		m.Email = maskEmail(*mail)
	}
	rows, err := s.a.DB.Query(ctx, selSesion+` WHERE s.id = $1`, sid)
	if err != nil {
		return m, err
	}
	x, err := pgx.CollectExactlyOneRow(rows, scanSesion)
	if err != nil {
		return m, err
	}
	now := time.Now()
	m.Sesion = x.pub(now)
	m.QR = s.qr(c.ID, m.Codigo)
	m.Lugar = strings.Join(nonEmpty(c.Sede.Nombre, c.Sede.Ciudad), ", ")
	m.PuedeCambiar = m.Estado == "reservada" && now.Before(x.Inicio)
	m.MaxPersonas = min(x.MaxPorReserva, m.Personas+m.Sesion.Libres)
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
				var sid uuid.UUID
				var antes int
				var estado string
				if err := tx.QueryRow(ctx, `SELECT sesion_id, personas, estado FROM entradas WHERE id = $1`, id).Scan(&sid, &antes, &estado); err != nil {
					return err
				}
				x, err := s.bloquearSesion(ctx, tx, cid, sid)
				if err != nil {
					return err
				}
				n := in.Body.Personas
				if estado != "reservada" || !time.Now().Before(x.Inicio) {
					return problem.Conflict("NO_MODIFICABLE", "Esta entrada ya no se puede cambiar.")
				}
				if n > x.MaxPorReserva {
					return problem.Unprocessable("DEMASIADAS_PERSONAS", fmt.Sprintf("Como mucho %d personas por reserva.", x.MaxPorReserva))
				}
				if n > antes && n-antes > x.Aforo-x.Usadas-x.Ofertas {
					return problem.Conflict("AGOTADA", "No quedan plazas suficientes en esta sesión.")
				}
				if _, err := tx.Exec(ctx, `UPDATE entradas SET personas = $2, updated_at = now() WHERE id = $1`, id, n); err != nil {
					return err
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "entrada.cambiada", map[string]any{"sesionId": sid, "antes": antes, "personas": n}, events.Competition(cid.String()), events.ForPermission("entradas.gestionar"))); err != nil {
					return err
				}
				return s.aforoEvento(ctx, tx, cid, sid)
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
			ts := func(t time.Time) string { return t.UTC().Format("20060102T150405Z") }
			esc := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`)
			lines := []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GR Strength Cup//Entradas//ES", "METHOD:PUBLISH", "BEGIN:VEVENT",
				"UID:" + m.Codigo + "@grcup", "DTSTAMP:" + ts(time.Now()), "DTSTART:" + ts(m.Sesion.Puertas), "DTEND:" + ts(m.Sesion.Fin),
				"SUMMARY:" + esc.Replace(c.Nombre+" · "+m.Sesion.Nombre), "LOCATION:" + esc.Replace(m.Lugar),
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
	var sid uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT codigo, nombre, apellidos, email::text, personas, sesion_id FROM entradas WHERE id = $1 AND estado <> 'anulada'`, id).Scan(&cod, &nombre, &ape, &mail, &personas, &sid); err != nil {
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
	rows, err := tx.Query(ctx, selSesion+` WHERE s.id = $1`, sid)
	if err != nil {
		return err
	}
	x, err := pgx.CollectExactlyOneRow(rows, scanSesion)
	if err != nil {
		return err
	}
	return email(ctx, tx, c.ID, *mail, "entrada-confirmada", s.varsEntrada(c, x, cod, tok, nombre, ape, personas))
}

// anular cancels a ticket (its QR stops working), announces the freed places and, if asked, emails the holder.
func (s *Svc) anular(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, motivo string, avisar bool) error {
	var sid uuid.UUID
	var estado, cod, nombre string
	var mail *string
	if err := tx.QueryRow(ctx, `SELECT sesion_id, estado, codigo, nombre, email::text FROM entradas WHERE id = $1 FOR UPDATE`, id).Scan(&sid, &estado, &cod, &nombre, &mail); err != nil {
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
	if avisar && mail != nil {
		var sesion string
		_ = tx.QueryRow(ctx, `SELECT nombre FROM sesiones WHERE id = $1`, sid).Scan(&sesion)
		if err := email(ctx, tx, cid, *mail, "entrada-anulada", map[string]string{"nombre": nombre, "codigo": cod, "sesion": sesion, "entradas": s.webURL + "/entradas"}); err != nil {
			return err
		}
	}
	if err := events.Enqueue(ctx, tx, events.New(ctx, "entrada.anulada", map[string]any{"codigo": cod, "sesionId": sid, "motivo": motivo}, events.Competition(cid.String()), events.ForPermission("entradas.gestionar"))); err != nil {
		return err
	}
	return s.aforoEvento(ctx, tx, cid, sid)
}
