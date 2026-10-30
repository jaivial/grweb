package ticketing

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagPub = []string{"Web pública"}

var errYaTiene = errors.New("ya tiene entrada")

const pub = "/api/competiciones/{slug}/entradas"

// SesionPub is a session as /entradas shows it.
type SesionPub struct {
	ID            uuid.UUID  `json:"id"`
	Nombre        string     `json:"nombre"`
	Detalle       string     `json:"detalle"`
	Inicio        time.Time  `json:"inicio"`
	Fin           time.Time  `json:"fin"`
	Puertas       time.Time  `json:"puertas"`
	Aforo         int        `json:"aforo"`
	Ocupadas      int        `json:"ocupadas" doc:"Personas con entrada + ofertas de la lista de espera pendientes"`
	Libres        int        `json:"libres"`
	Estado        string     `json:"estado" enum:"disponible,ultimas,agotada,cerrada,proximamente"`
	ListaEspera   bool       `json:"listaEspera"`
	EnEspera      int        `json:"enEspera"`
	MaxPorReserva int        `json:"maxPorReserva"`
	AperturaAt    *time.Time `json:"aperturaAt,omitempty"`
}

type sesionRow struct {
	ID                                uuid.UUID
	Nombre, Detalle                   string
	Inicio, Fin, Puertas              time.Time
	Aforo, MaxPorReserva, Orden       int
	AperturaAt, CierreAt              *time.Time
	Publicada, ListaEspera            bool
	Usadas, Ofertas, EnEspera, Dentro int
	Reservas, Version                 int
}

const selSesion = `SELECT s.id, s.nombre, s.detalle, s.inicio, s.fin, s.puertas, s.aforo, s.max_por_reserva, s.orden, s.apertura_at, s.cierre_at, s.publicada, s.lista_espera,
	(SELECT COALESCE(sum(personas), 0) FROM entradas e WHERE e.sesion_id = s.id AND e.estado <> 'anulada')::int,
	(SELECT COALESCE(sum(personas), 0) FROM lista_espera l WHERE l.sesion_id = s.id AND l.estado = 'oferta' AND l.oferta_expira_at > now())::int,
	(SELECT count(*) FROM lista_espera l WHERE l.sesion_id = s.id AND l.estado IN ('en_espera', 'oferta'))::int,
	(SELECT COALESCE(sum(dentro), 0) FROM entradas e WHERE e.sesion_id = s.id AND e.estado <> 'anulada')::int,
	(SELECT count(*) FROM entradas e WHERE e.sesion_id = s.id AND e.estado <> 'anulada')::int,
	s.version FROM sesiones s`

func scanSesion(r pgx.CollectableRow) (sesionRow, error) {
	var x sesionRow
	err := r.Scan(&x.ID, &x.Nombre, &x.Detalle, &x.Inicio, &x.Fin, &x.Puertas, &x.Aforo, &x.MaxPorReserva, &x.Orden, &x.AperturaAt, &x.CierreAt, &x.Publicada, &x.ListaEspera,
		&x.Usadas, &x.Ofertas, &x.EnEspera, &x.Dentro, &x.Reservas, &x.Version)
	return x, err
}

func sesiones(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, cid uuid.UUID, soloPublicadas bool) ([]sesionRow, error) {
	w := ` WHERE s.competition_id = $1`
	if soloPublicadas {
		w += ` AND s.publicada`
	}
	rows, err := q.Query(ctx, selSesion+w+` ORDER BY s.inicio, s.orden`, cid)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanSesion)
}

// estado of a session for the public: window, capacity left (with pending offers) and «últimas» under 10 %.
func (x sesionRow) estado(now time.Time) string {
	libres := x.Aforo - x.Usadas - x.Ofertas
	switch {
	case x.AperturaAt != nil && now.Before(*x.AperturaAt):
		return "proximamente"
	case (x.CierreAt != nil && now.After(*x.CierreAt)) || now.After(x.Fin):
		return "cerrada"
	case libres <= 0:
		return "agotada"
	case libres*10 <= x.Aforo:
		return "ultimas"
	}
	return "disponible"
}

func (x sesionRow) pub(now time.Time) SesionPub {
	l := max(0, x.Aforo-x.Usadas-x.Ofertas)
	return SesionPub{ID: x.ID, Nombre: x.Nombre, Detalle: x.Detalle, Inicio: x.Inicio, Fin: x.Fin, Puertas: x.Puertas, Aforo: x.Aforo, Ocupadas: x.Usadas + x.Ofertas, Libres: l,
		Estado: x.estado(now), ListaEspera: x.ListaEspera, EnEspera: x.EnEspera, MaxPorReserva: x.MaxPorReserva, AperturaAt: x.AperturaAt}
}

// Entradas is /entradas.
type Entradas struct {
	Sesiones []SesionPub `json:"sesiones"`
	Personas int         `json:"personas" doc:"Personas que ya tienen entrada"`
	Plazas   int         `json:"plazas"`
}

// ReservaIn is the public form.
type ReservaIn struct {
	SesionID         uuid.UUID         `json:"sesionId"`
	Nombre           string            `json:"nombre" minLength:"1" maxLength:"80"`
	Apellidos        string            `json:"apellidos" minLength:"1" maxLength:"120"`
	Email            string            `json:"email" maxLength:"254"`
	Telefono         string            `json:"telefono,omitempty" maxLength:"30"`
	Personas         int               `json:"personas" minimum:"1" maximum:"20"`
	Origen           string            `json:"origen,omitempty" maxLength:"60" doc:"¿Cómo nos conociste?"`
	Utm              map[string]string `json:"utm,omitempty" maxProperties:"6"`
	AceptaPrivacidad bool              `json:"aceptaPrivacidad"`
	Novedades        bool              `json:"novedades,omitempty"`
}

// Reservada is the answer of a reservation: the ticket token opens «Mi entrada» and the confirmation page.
type Reservada struct {
	Codigo string `json:"codigo"`
	Token  string `json:"token"`
}

func (s *Svc) registerPublic() {
	api := s.a.API
	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-publicas", Method: http.MethodGet, Path: pub, Summary: "Sesiones con aforo para /entradas", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*struct {
			CacheControl string `header:"Cache-Control"`
			Body         Entradas
		}, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			l, err := sesiones(ctx, s.a.DB, c.ID, true)
			if err != nil {
				return nil, err
			}
			o := Entradas{Sesiones: []SesionPub{}}
			now := time.Now()
			for _, x := range l {
				o.Sesiones = append(o.Sesiones, x.pub(now))
				o.Personas += x.Usadas
				o.Plazas += x.Aforo
			}
			return &struct {
				CacheControl string `header:"Cache-Control"`
				Body         Entradas
			}{"no-store", o}, nil
		})

	type reservaIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body ReservaIn
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-reservar", Method: http.MethodPost, Path: pub, Summary: "Reservar entradas gratuitas (409 AGOTADA → lista de espera)", Tags: tagPub, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *reservaIn) (*struct{ Body Reservada }, error) {
			b := in.Body
			if !b.AceptaPrivacidad {
				return nil, problem.Unprocessable("CONSENTIMIENTO_REQUERIDO", "Para reservar tienes que aceptar la política de privacidad.")
			}
			e := strings.ToLower(strings.TrimSpace(b.Email))
			if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
				return nil, problem.Unprocessable("EMAIL_INVALIDO", "Revisa el email: ahí te enviamos la entrada.")
			}
			ip := httpx.ClientIPFrom(ctx)
			// Many people book from the pavilion Wi-Fi or a carrier NAT (one IP): the per-address limit stops abuse.
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "entradas", ip), 30, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Se han hecho muchas reservas desde esta conexión. Inténtalo en un rato.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "entradas-email", hashToken(e)), 5, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has hecho varias reservas seguidas con este email. Inténtalo más tarde.")
			}
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out := Reservada{}
			var antes uuid.UUID
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				x, err := s.bloquearSesion(ctx, tx, c.ID, b.SesionID)
				if err != nil {
					return err
				}
				if !x.Publicada {
					return problem.NotFound("Esa sesión no existe.")
				}
				switch x.estado(time.Now()) {
				case "proximamente":
					return problem.Conflict("RESERVAS_CERRADAS", "Las reservas de esta sesión aún no han abierto.")
				case "cerrada":
					return problem.Conflict("RESERVAS_CERRADAS", "Las reservas de esta sesión están cerradas.")
				}
				if b.Personas > x.MaxPorReserva {
					return problem.Unprocessable("DEMASIADAS_PERSONAS", fmt.Sprintf("Como mucho %d personas por reserva.", x.MaxPorReserva))
				}
				// One ticket per address and session: a repeated reservation re-sends the link instead (after this
				// transaction, so the email is not rolled back with it).
				if err := tx.QueryRow(ctx, `SELECT id FROM entradas WHERE sesion_id = $1 AND email = $2 AND estado <> 'anulada'`, x.ID, e).Scan(&antes); err == nil {
					return errYaTiene
				}
				if libres := x.Aforo - x.Usadas - x.Ofertas; b.Personas > libres {
					if libres <= 0 {
						return problem.Conflict("AGOTADA", "Esta sesión está completa. Apúntate a la lista de espera.")
					}
					return problem.Conflict("AGOTADA", fmt.Sprintf("Solo quedan %d plazas en esta sesión.", libres))
				}
				id, cod, tok, err := s.crearEntrada(ctx, tx, c, x, nuevaEntrada{nombre: b.Nombre, apellidos: b.Apellidos, email: e, telefono: b.Telefono, personas: b.Personas,
					origen: b.Origen, utm: b.Utm, cons: map[string]any{"privacidad": s.legalVersion(ctx, c.ID), "novedades": b.Novedades, "ip": anonIP(ip), "at": time.Now()}})
				if err != nil {
					return err
				}
				out.Codigo, out.Token = cod, tok
				v, h := s.legalVigente(ctx, c.ID, "privacidad")
				cs := []map[string]any{{"finalidad": "privacidad", "estado": "confirmado", "version": v, "hash": h, "origen": "/entradas · formulario de reserva", "ip": ip}}
				// The optional news box starts crm's double opt-in (never confirmed here).
				ev := map[string]any{"email": e, "telefono": b.Telefono, "nombre": strings.TrimSpace(b.Nombre + " " + b.Apellidos), "origen": origenCRM(b.Origen, b.Utm),
					"novedades": b.Novedades, "ip": ip,
					"relacion": map[string]any{"entradas": b.Personas}, "consentimientos": cs,
					"actividad": map[string]any{"tipo": "entrada", "titulo": fmt.Sprintf("Reservó %d entrada%s", b.Personas, map[bool]string{true: "s"}[b.Personas > 1]), "detalle": x.Nombre + " · " + cod}}
				if err := contacto(ctx, tx, c.ID, ev); err != nil {
					return err
				}
				_ = id
				return s.aforoEvento(ctx, tx, c.ID, x.ID)
			})
			if errors.Is(err, errYaTiene) {
				if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "entrada-reenvio", hashToken(e)), 3, time.Hour); r.Allowed {
					if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return s.enviarEnlace(ctx, tx, c, antes, e) }); err != nil {
						return nil, err
					}
				}
				return nil, problem.Conflict("YA_TIENES_ENTRADA", "Ya tienes entrada para esta sesión con ese email: te hemos reenviado el enlace para gestionarla.")
			}
			if err != nil {
				return nil, err
			}
			s.bump(ctx, c.ID)
			return &struct{ Body Reservada }{out}, nil
		})

	type esperaIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			SesionID         uuid.UUID `json:"sesionId"`
			Email            string    `json:"email" maxLength:"254"`
			Nombre           string    `json:"nombre,omitempty" maxLength:"120"`
			Personas         int       `json:"personas" minimum:"1" maximum:"20"`
			AceptaPrivacidad bool      `json:"aceptaPrivacidad"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-espera", Method: http.MethodPost, Path: pub + "/espera", Summary: "Apuntarse a la lista de espera de una sesión", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *esperaIn) (*struct{}, error) {
			b := in.Body
			if !b.AceptaPrivacidad {
				return nil, problem.Unprocessable("CONSENTIMIENTO_REQUERIDO", "Acepta la política de privacidad para apuntarte.")
			}
			e := strings.ToLower(strings.TrimSpace(b.Email))
			if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
				return nil, problem.Unprocessable("EMAIL_INVALIDO", "Escribe un email válido.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "espera", httpx.ClientIPFrom(ctx)), 8, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has hecho varias solicitudes seguidas. Inténtalo más tarde.")
			}
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var nombre string
				var lista bool
				if err := tx.QueryRow(ctx, `SELECT nombre, lista_espera FROM sesiones WHERE competition_id = $1 AND id = $2 AND publicada`, c.ID, b.SesionID).Scan(&nombre, &lista); err != nil {
					return problem.NotFound("Esa sesión no existe.")
				}
				if !lista {
					return problem.Conflict("SIN_LISTA_ESPERA", "Esta sesión no tiene lista de espera.")
				}
				tag, err := tx.Exec(ctx, `INSERT INTO lista_espera (id, competition_id, sesion_id, nombre, email, personas) VALUES ($1,$2,$3,$4,$5,$6)
					ON CONFLICT (sesion_id, email) DO UPDATE SET personas = EXCLUDED.personas, estado = 'en_espera' WHERE lista_espera.estado IN ('retirada', 'caducada')`,
					newID(), c.ID, b.SesionID, strings.TrimSpace(b.Nombre), e, b.Personas)
				if err != nil || tag.RowsAffected() == 0 {
					return err // already waiting: same answer
				}
				if err := email(ctx, tx, c.ID, e, "entrada-espera", map[string]string{"sesion": nombre, "personas": fmt.Sprint(b.Personas)}); err != nil {
					return err
				}
				return contacto(ctx, tx, c.ID, map[string]any{"email": e, "nombre": strings.TrimSpace(b.Nombre), "origen": "lista_espera", "relacion": map[string]any{"reserva": true},
					"consentimientos": []map[string]any{{"finalidad": "privacidad", "estado": "confirmado", "version": s.legalVersion(ctx, c.ID), "origen": "/entradas · lista de espera", "ip": httpx.ClientIPFrom(ctx)}},
					"actividad":       map[string]any{"tipo": "entrada", "titulo": "Se apuntó a la lista de espera", "detalle": nombre}})
			})
		})

	type ofertaIn struct {
		Slug  string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Token string `query:"t" maxLength:"80"`
	}
	type ofertaOut struct {
		Body struct {
			Sesion   SesionPub `json:"sesion"`
			Personas int       `json:"personas"`
			Expira   time.Time `json:"expira"`
			Estado   string    `json:"estado"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-oferta", Method: http.MethodGet, Path: pub + "/oferta", Summary: "Oferta de plaza de la lista de espera", Tags: tagPub},
		func(ctx context.Context, in *ofertaIn) (*ofertaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			o := &ofertaOut{}
			var sid uuid.UUID
			var exp *time.Time
			if err := s.a.DB.QueryRow(ctx, `SELECT sesion_id, personas, estado, oferta_expira_at FROM lista_espera WHERE competition_id = $1 AND token_hash = $2`, c.ID, hashToken(in.Token)).
				Scan(&sid, &o.Body.Personas, &o.Body.Estado, &exp); err != nil {
				return nil, problem.NotFound("Esta oferta no existe o ya no es válida.")
			}
			if exp != nil {
				o.Body.Expira = *exp
			}
			l, err := sesiones(ctx, s.a.DB, c.ID, false)
			if err != nil {
				return nil, err
			}
			for _, x := range l {
				if x.ID == sid {
					o.Body.Sesion = x.pub(time.Now())
				}
			}
			return o, nil
		})
	type aceptarIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Token string `json:"token" maxLength:"80"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-oferta-aceptar", Method: http.MethodPost, Path: pub + "/oferta", Summary: "Aceptar la plaza ofrecida", Tags: tagPub, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *aceptarIn) (*struct{ Body Reservada }, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out := Reservada{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var lid, sid uuid.UUID
				var nombre, mailx, estado string
				var personas int
				var exp *time.Time
				if err := tx.QueryRow(ctx, `SELECT id, sesion_id, nombre, email::text, personas, estado, oferta_expira_at FROM lista_espera WHERE competition_id = $1 AND token_hash = $2 FOR UPDATE`,
					c.ID, hashToken(in.Body.Token)).Scan(&lid, &sid, &nombre, &mailx, &personas, &estado, &exp); err != nil {
					return problem.NotFound("Esta oferta no existe o ya no es válida.")
				}
				if estado != "oferta" || exp == nil || time.Now().After(*exp) {
					return problem.Conflict("OFERTA_CADUCADA", "La oferta ha caducado y la plaza ha pasado a la siguiente persona.")
				}
				x, err := s.bloquearSesion(ctx, tx, c.ID, sid)
				if err != nil {
					return err
				}
				// The offer held these places: they are free for this person by construction.
				_ = x
				nom, ape, _ := strings.Cut(nombre, " ")
				if nom == "" {
					nom = strings.Split(mailx, "@")[0]
				}
				id, cod, tok, err := s.crearEntrada(ctx, tx, c, x, nuevaEntrada{nombre: nom, apellidos: ape, email: mailx, personas: personas, origen: "lista_espera",
					cons: map[string]any{"privacidad": s.legalVersion(ctx, c.ID), "ip": anonIP(httpx.ClientIPFrom(ctx)), "at": time.Now()}})
				if err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE lista_espera SET estado = 'aceptada', entrada_id = $2, token_hash = '' WHERE id = $1`, lid, id); err != nil {
					return err
				}
				out.Codigo, out.Token = cod, tok
				return s.aforoEvento(ctx, tx, c.ID, sid)
			})
			if err == nil {
				s.bump(ctx, c.ID)
			}
			return &struct{ Body Reservada }{out}, err
		})

	type qrIn struct {
		Slug   string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Codigo string `path:"codigo" pattern:"^GRC-[0-9A-Z]{4}$"`
		S      string `query:"s" maxLength:"20"`
	}
	type pngOut struct {
		ContentType  string `header:"Content-Type"`
		CacheControl string `header:"Cache-Control"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-qr", Method: http.MethodGet, Path: pub + "/{codigo}/qr.png", Summary: "Imagen del QR de una entrada (enlace firmado de su email)", Tags: tagPub},
		func(ctx context.Context, in *qrIn) (*pngOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if in.S != s.firma(c.ID, in.Codigo) {
				return nil, problem.NotFound("QR no encontrado.")
			}
			png, err := qrcode.Encode(s.qr(c.ID, in.Codigo), qrcode.Medium, 480)
			if err != nil {
				return nil, err
			}
			return &pngOut{ContentType: "image/png", CacheControl: "private, max-age=86400", Body: png}, nil
		})

	type enlaceIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Email string `json:"email" maxLength:"254"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-enlace", Method: http.MethodPost, Path: pub + "/enlace", Summary: "Pedir de nuevo el enlace de «Mi entrada» (respuesta igual exista o no)", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *enlaceIn) (*struct{}, error) {
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "entrada-enlace", httpx.ClientIPFrom(ctx)), 6, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has pedido varios enlaces seguidos. Inténtalo más tarde.")
			}
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			start := time.Now()
			_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				rows, err := tx.Query(ctx, `SELECT id FROM entradas WHERE competition_id = $1 AND email = $2 AND estado <> 'anulada'`, c.ID, e)
				if err != nil {
					return err
				}
				ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
				if err != nil {
					return err
				}
				for _, id := range ids {
					if err := s.enviarEnlace(ctx, tx, c, id, e); err != nil {
						return err
					}
				}
				return nil
			})
			// Constant time: the answer never tells whether the address has tickets.
			time.Sleep(time.Until(start.Add(400 * time.Millisecond)))
			return nil, nil
		})
}

func (s *Svc) bloquearSesion(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID) (sesionRow, error) {
	if _, err := tx.Exec(ctx, `SELECT 1 FROM sesiones WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id); err != nil {
		return sesionRow{}, err
	}
	rows, err := tx.Query(ctx, selSesion+` WHERE s.competition_id = $1 AND s.id = $2`, cid, id)
	if err != nil {
		return sesionRow{}, err
	}
	x, err := pgx.CollectExactlyOneRow(rows, scanSesion)
	if db.IsNoRows(err) {
		return x, problem.NotFound("Esa sesión no existe.")
	}
	return x, err
}

type nuevaEntrada struct {
	nombre, apellidos, email, telefono, origen, nota string
	personas                                         int
	utm                                              map[string]string
	cons                                             map[string]any
	manual                                           bool
	sinEmail                                         bool
}

// crearEntrada stores a ticket with a unique code and a «Mi entrada» token and queues its confirmation email.
func (s *Svc) crearEntrada(ctx context.Context, tx pgx.Tx, c compref.Comp, x sesionRow, n nuevaEntrada) (uuid.UUID, string, string, error) {
	id := newID()
	tok := s.tokenEntrada(id)
	if n.utm == nil {
		n.utm = map[string]string{}
	}
	if n.cons == nil {
		n.cons = map[string]any{}
	}
	var cod string
	for range 8 {
		cod = nuevoCodigo()
		_, err := tx.Exec(ctx, `SAVEPOINT cod`)
		if err != nil {
			return id, "", "", err
		}
		_, err = tx.Exec(ctx, `INSERT INTO entradas (id, competition_id, sesion_id, codigo, nombre, apellidos, email, telefono, personas, origen, utm, consentimientos, manual, nota, token_hash)
			VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9,$10,$11,$12,$13,$14,$15)`,
			id, c.ID, x.ID, cod, strings.TrimSpace(n.nombre), strings.TrimSpace(n.apellidos), n.email, strings.TrimSpace(n.telefono), n.personas, orDefault(n.origen, "web"), n.utm, n.cons, n.manual, n.nota, hashToken(tok))
		if err == nil {
			break
		}
		if !db.IsUniqueViolation(err, "") {
			return id, "", "", err
		}
		if _, err := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT cod`); err != nil {
			return id, "", "", err
		}
	}
	if n.email == "" || n.sinEmail {
		return id, cod, tok, nil
	}
	return id, cod, tok, email(ctx, tx, c.ID, n.email, "entrada-confirmada", s.varsEntrada(c, x, cod, tok, n.nombre, n.apellidos, n.personas))
}

func (s *Svc) varsEntrada(c compref.Comp, x sesionRow, cod, tok, nombre, apellidos string, personas int) map[string]string {
	acomp := ""
	if personas > 1 {
		acomp = fmt.Sprintf(" + %d acompañante%s", personas-1, map[bool]string{true: "s"}[personas > 2])
	}
	return map[string]string{"nombre": strings.TrimSpace(nombre), "titular": strings.TrimSpace(nombre+" "+apellidos) + acomp, "sesion": x.Nombre, "dia": diaTxt(x.Inicio),
		"puertas": hm(x.Puertas), "hasta": hm(x.Fin), "personas": fmt.Sprint(personas), "codigo": cod, "qr": s.qrURL(c.Slug, c.ID, cod),
		"enlace": s.webURL + "/mi-entrada?t=" + tok, "lugar": strings.TrimSpace(strings.Join(nonEmpty(c.Sede.Nombre, c.Sede.Ciudad), ", "))}
}

// enviarEnlace emails the «Mi entrada» link of a ticket (the same link as its other emails).
func (s *Svc) enviarEnlace(ctx context.Context, tx pgx.Tx, c compref.Comp, id uuid.UUID, para string) error {
	tok, err := s.enlaceEntrada(ctx, tx, id)
	if err != nil {
		return err
	}
	var cod, nombre, sesion string
	if err := tx.QueryRow(ctx, `SELECT e.codigo, e.nombre, s.nombre FROM entradas e JOIN sesiones s ON s.id = e.sesion_id WHERE e.id = $1`, id).Scan(&cod, &nombre, &sesion); err != nil {
		return err
	}
	return email(ctx, tx, c.ID, para, "entrada-enlace", map[string]string{"nombre": nombre, "codigo": cod, "sesion": sesion, "enlace": s.webURL + "/mi-entrada?t=" + tok})
}

// legalVersion of the privacy text accepted (cms keeps the versioned texts; cached 5 min). Part of the proof.
func (s *Svc) legalVersion(ctx context.Context, cid uuid.UUID) string {
	v, _ := s.legalVigente(ctx, cid, "privacidad")
	return v
}

func (s *Svc) legalVigente(ctx context.Context, cid uuid.UUID, tipo string) (string, string) {
	var l struct {
		Version string `json:"version"`
		Hash    string `json:"hash"`
	}
	key := "legal:" + cid.String() + ":" + tipo
	if s.cache.Get(ctx, key, &l) {
		return l.Version, l.Hash
	}
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return "", ""
	}
	if err := s.cms.Do(ctx, http.MethodGet, "/api/competiciones/"+c.Slug+"/legal/"+tipo, nil, &l); err != nil {
		return "", ""
	}
	s.cache.Set(ctx, key, l, 5*time.Minute)
	return l.Version, l.Hash
}

func origenCRM(origen string, utm map[string]string) string {
	if v := utm["utm_source"]; v != "" {
		return strings.ToLower(v)
	}
	if origen != "" {
		return strings.ToLower(strings.ReplaceAll(origen, " ", "_"))
	}
	return "entradas"
}

func orDefault(v, d string) string {
	if strings.TrimSpace(v) == "" {
		return d
	}
	return v
}

func nonEmpty(xs ...string) []string {
	var out []string
	for _, x := range xs {
		if strings.TrimSpace(x) != "" {
			out = append(out, x)
		}
	}
	return out
}

func anonIP(ip string) string {
	if p := strings.Split(ip, "."); len(p) == 4 {
		return p[0] + "." + p[1] + "." + p[2] + ".x"
	}
	if p := strings.Split(ip, ":"); len(p) > 3 {
		return strings.Join(p[:3], ":") + "::x"
	}
	return ip
}
