package ticketing

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Entradas"}

const base = "/api/admin/competiciones/{cid}/entradas"
const perm = "entradas.gestionar"

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

// SesionAdmin is a session card of «Entradas y aforo».
type SesionAdmin struct {
	SesionPub
	Publicada  bool       `json:"publicada"`
	CierreAt   *time.Time `json:"cierreAt,omitempty"`
	Reservas   int        `json:"reservas" doc:"Entradas (no anuladas)"`
	Dentro     int        `json:"dentro"`
	Sobreventa int        `json:"sobreventa" doc:"Personas por encima del aforo"`
	Version    int        `json:"version"`
}

// Resumen is the header of «Entradas y aforo».
type Resumen struct {
	Reservas  int            `json:"reservas"`
	Nuevas7d  int            `json:"nuevas7d"`
	Personas  int            `json:"personas"`
	Media     float64        `json:"media" doc:"Personas por reserva"`
	Ocupacion float64        `json:"ocupacion" doc:"% medio sobre las sesiones publicadas"`
	Plazas    int            `json:"plazas"`
	Espera    int            `json:"espera"`
	EsperaTop string         `json:"esperaTop" doc:"Sesión con más lista de espera"`
	Serie     []int          `json:"serie" doc:"Reservas por día (14 días)"`
	Sesiones  []SesionAdmin  `json:"sesiones"`
	Ajustes   Ajustes        `json:"ajustes"`
	Pestanas  map[string]int `json:"pestanas"`
}

// Ajustes of the waiting list.
type Ajustes struct {
	AutoPromocion   bool `json:"autoPromocion"`
	PlazoHoras      int  `json:"plazoHoras" minimum:"1" maximum:"168"`
	PermitirParcial bool `json:"permitirParcial" doc:"Ofrecer menos plazas de las pedidas si no caben todas"`
}

func (s *Svc) ajustes(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, cid uuid.UUID) Ajustes {
	a := Ajustes{AutoPromocion: true, PlazoHoras: 24}
	_ = q.QueryRow(ctx, `SELECT auto_promocion, plazo_horas, permitir_parcial FROM ajustes WHERE competition_id = $1`, cid).Scan(&a.AutoPromocion, &a.PlazoHoras, &a.PermitirParcial)
	return a
}

func admin(x sesionRow, now time.Time) SesionAdmin {
	return SesionAdmin{SesionPub: x.pub(now), Publicada: x.Publicada, CierreAt: x.CierreAt, Reservas: x.Reservas, Dentro: x.Dentro, Sobreventa: max(0, x.Usadas-x.Aforo), Version: x.Version}
}

// Entrada is a row of «Reservas».
type Entrada struct {
	ID        uuid.UUID      `json:"id"`
	Codigo    string         `json:"codigo"`
	Nombre    string         `json:"nombre"`
	Apellidos string         `json:"apellidos"`
	Email     string         `json:"email"`
	Telefono  string         `json:"telefono"`
	SesionID  uuid.UUID      `json:"sesionId"`
	Sesion    string         `json:"sesion"`
	Personas  int            `json:"personas"`
	Dentro    int            `json:"dentro"`
	Estado    string         `json:"estado"`
	Origen    string         `json:"origen"`
	Manual    bool           `json:"manual"`
	Nota      string         `json:"nota"`
	Novedades bool           `json:"novedades"`
	Cons      map[string]any `json:"consentimientos"`
	Motivo    string         `json:"motivo,omitempty"`
	CreatedAt time.Time      `json:"createdAt"`
}

const selEntrada = `SELECT e.id, e.codigo, e.nombre, e.apellidos, COALESCE(e.email::text, ''), e.telefono, e.sesion_id, s.nombre, e.personas, e.dentro, e.estado, e.origen, e.manual, e.nota,
	e.consentimientos, e.motivo, e.created_at FROM entradas e JOIN sesiones s ON s.id = e.sesion_id`

func scanEntrada(r pgx.CollectableRow) (Entrada, error) {
	var e Entrada
	err := r.Scan(&e.ID, &e.Codigo, &e.Nombre, &e.Apellidos, &e.Email, &e.Telefono, &e.SesionID, &e.Sesion, &e.Personas, &e.Dentro, &e.Estado, &e.Origen, &e.Manual, &e.Nota, &e.Cons, &e.Motivo, &e.CreatedAt)
	e.Novedades, _ = e.Cons["novedades"].(bool)
	return e, err
}

type listaIn struct {
	CID    uuid.UUID `path:"cid"`
	Sesion string    `query:"sesion" maxLength:"36"`
	Estado string    `query:"estado" enum:",reservada,usada,anulada"`
	Origen string    `query:"origen" maxLength:"60"`
	Q      string    `query:"q" maxLength:"100"`
	Pagina int       `query:"pagina" minimum:"1" default:"1"`
}

func filtro(in listaIn) (string, []any) {
	w := []string{"e.competition_id = $1"}
	args := []any{in.CID}
	add := func(c string, v any) {
		args = append(args, v)
		w = append(w, strings.ReplaceAll(c, "?", fmt.Sprintf("$%d", len(args))))
	}
	if id, err := uuid.Parse(in.Sesion); err == nil {
		add("e.sesion_id = ?", id)
	}
	if in.Estado != "" {
		add("e.estado = ?", in.Estado)
	}
	if in.Origen != "" {
		add("e.origen = ?", in.Origen)
	}
	if q := strings.TrimSpace(in.Q); q != "" {
		add("(lower(unaccent_es(e.nombre || ' ' || e.apellidos)) LIKE ? OR e.email::text LIKE ? OR e.codigo ILIKE ? OR e.telefono LIKE ?)", "%"+strings.ToLower(sinTildes(q))+"%")
	}
	return strings.Join(w, " AND "), args
}

func (s *Svc) resumen(ctx context.Context, cid uuid.UUID) (Resumen, error) {
	r := Resumen{Serie: make([]int, 14), Sesiones: []SesionAdmin{}}
	l, err := sesiones(ctx, s.a.DB, cid, false)
	if err != nil {
		return r, err
	}
	now := time.Now()
	var pubs, occ int
	var top int
	for _, x := range l {
		r.Sesiones = append(r.Sesiones, admin(x, now))
		r.Espera += x.EnEspera
		if x.EnEspera > top {
			top, r.EsperaTop = x.EnEspera, x.Nombre
		}
		if x.Publicada {
			pubs++
			occ += x.Usadas * 100 / x.Aforo
			r.Plazas += x.Aforo
		}
	}
	if pubs > 0 {
		r.Ocupacion = float64(occ / pubs)
	}
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*), COALESCE(sum(personas), 0), count(*) FILTER (WHERE created_at > now() - interval '7 days') FROM entradas WHERE competition_id = $1 AND estado <> 'anulada'`, cid).
		Scan(&r.Reservas, &r.Personas, &r.Nuevas7d); err != nil {
		return r, err
	}
	if r.Reservas > 0 {
		r.Media = float64(r.Personas*10/r.Reservas) / 10
	}
	rows, err := s.a.DB.Query(ctx, `SELECT (now()::date - created_at::date), count(*) FROM entradas WHERE competition_id = $1 AND created_at > now() - interval '14 days' GROUP BY 1`, cid)
	if err == nil {
		for rows.Next() {
			var d, n int
			if rows.Scan(&d, &n) == nil && d >= 0 && d < 14 {
				r.Serie[13-d] = n
			}
		}
		rows.Close()
	}
	r.Ajustes = s.ajustes(ctx, s.a.DB, cid)
	r.Pestanas = map[string]int{"sesiones": len(l), "reservas": r.Reservas, "espera": r.Espera}
	return r, nil
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	huma.Register(api, huma.Operation{OperationID: "entradas-resumen", Method: http.MethodGet, Path: base + "/resumen", Summary: "KPIs y sesiones con su aforo", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body Resumen }, error) {
			if _, err := requireAny(ctx, in.CID, perm, "checkin.escanear"); err != nil {
				return nil, err
			}
			r, err := s.resumen(ctx, in.CID)
			return &struct{ Body Resumen }{r}, err
		})

	type sesionBody struct {
		Nombre        string     `json:"nombre" minLength:"1" maxLength:"80"`
		Detalle       string     `json:"detalle,omitempty" maxLength:"160"`
		Inicio        time.Time  `json:"inicio"`
		Fin           time.Time  `json:"fin"`
		Puertas       time.Time  `json:"puertas"`
		Aforo         int        `json:"aforo" minimum:"1" maximum:"20000"`
		MaxPorReserva int        `json:"maxPorReserva" minimum:"1" maximum:"20"`
		AperturaAt    *time.Time `json:"aperturaAt,omitempty"`
		CierreAt      *time.Time `json:"cierreAt,omitempty"`
		Publicada     bool       `json:"publicada"`
		ListaEspera   bool       `json:"listaEspera"`
	}
	valida := func(b sesionBody) error {
		if !b.Fin.After(b.Inicio) || b.Puertas.After(b.Inicio) {
			return problem.Unprocessable("HORAS_INVALIDAS", "Las puertas abren antes del inicio y la sesión termina después de empezar.")
		}
		if b.AperturaAt != nil && b.CierreAt != nil && !b.CierreAt.After(*b.AperturaAt) {
			return problem.Unprocessable("HORAS_INVALIDAS", "Las reservas cierran después de abrir.")
		}
		return nil
	}
	type crearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body sesionBody
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-sesion-crear", Method: http.MethodPost, Path: base + "/sesiones", Summary: "Nueva sesión", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *crearIn) (*struct{ Body Resumen }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			b := in.Body
			if err := valida(b); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO sesiones (id, competition_id, nombre, detalle, inicio, fin, puertas, aforo, max_por_reserva, apertura_at, cierre_at, publicada, lista_espera)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, newID(), in.CID, b.Nombre, b.Detalle, b.Inicio, b.Fin, b.Puertas, b.Aforo, b.MaxPorReserva, b.AperturaAt, b.CierreAt, b.Publicada, b.ListaEspera); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "entradas.sesion_guardada", map[string]any{"nombre": b.Nombre}, events.Competition(in.CID.String()), events.ForPermission(perm)))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			r, err := s.resumen(ctx, in.CID)
			return &struct{ Body Resumen }{r}, err
		})
	type editarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Forzar  bool      `query:"forzar" doc:"Mantener la sobreventa al bajar el aforo"`
		Body    sesionBody
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-sesion-editar", Method: http.MethodPut, Path: base + "/sesiones/{id}", Summary: "Editar una sesión (If-Match; 409 SOBREVENTA si el aforo queda por debajo de lo reservado)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *editarIn) (*struct{ Body Resumen }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			b := in.Body
			if err := valida(b); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				x, err := s.bloquearSesion(ctx, tx, in.CID, in.ID)
				if err != nil {
					return err
				}
				if in.IfMatch != "" && in.IfMatch != fmt.Sprintf(`W/"%d"`, x.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado esta sesión. Recarga para ver sus cambios.")
				}
				if b.Aforo < x.Usadas && !in.Forzar {
					return problem.Conflict("SOBREVENTA", fmt.Sprintf("Hay %d personas con entrada y el nuevo aforo es %d. Sube el aforo, mueve reservas a otra sesión o confirma que mantienes la sobreventa.", x.Usadas, b.Aforo))
				}
				if _, err := tx.Exec(ctx, `UPDATE sesiones SET nombre = $3, detalle = $4, inicio = $5, fin = $6, puertas = $7, aforo = $8, max_por_reserva = $9, apertura_at = $10, cierre_at = $11,
					publicada = $12, lista_espera = $13, version = version + 1 WHERE competition_id = $1 AND id = $2`,
					in.CID, in.ID, b.Nombre, b.Detalle, b.Inicio, b.Fin, b.Puertas, b.Aforo, b.MaxPorReserva, b.AperturaAt, b.CierreAt, b.Publicada, b.ListaEspera); err != nil {
					return err
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "entradas.sesion_guardada", map[string]any{"nombre": b.Nombre, "aforo": b.Aforo}, events.Competition(in.CID.String()), events.ForPermission(perm))); err != nil {
					return err
				}
				return s.aforoEvento(ctx, tx, in.CID, in.ID)
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			r, err := s.resumen(ctx, in.CID)
			return &struct{ Body Resumen }{r}, err
		})
	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-sesion-borrar", Method: http.MethodDelete, Path: base + "/sesiones/{id}", Summary: "Borrar una sesión sin reservas", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*struct{ Body Resumen }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			var n int
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM entradas WHERE sesion_id = $1`, in.ID).Scan(&n)
			if n > 0 {
				return nil, problem.Conflict("SESION_CON_RESERVAS", fmt.Sprintf("Tiene %d reservas: anúlalas o muévelas antes, o despublícala.", n))
			}
			if _, err := s.a.DB.Exec(ctx, `DELETE FROM sesiones WHERE competition_id = $1 AND id = $2`, in.CID, in.ID); err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			r, err := s.resumen(ctx, in.CID)
			return &struct{ Body Resumen }{r}, err
		})

	// ---- reservations ----
	type listaOut struct {
		Body struct {
			Items    []Entrada `json:"items"`
			Total    int       `json:"total"`
			Pagina   int       `json:"pagina"`
			Por      int       `json:"por"`
			Origenes []string  `json:"origenes"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-list", Method: http.MethodGet, Path: base, Summary: "Reservas con filtros", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			if _, err := requireAny(ctx, in.CID, perm, "checkin.escanear"); err != nil {
				return nil, err
			}
			where, args := filtro(*in)
			o := &listaOut{}
			o.Body.Pagina, o.Body.Por = in.Pagina, 25
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM entradas e WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE `+where+fmt.Sprintf(` ORDER BY e.created_at DESC LIMIT 25 OFFSET %d`, (in.Pagina-1)*25), args...)
			if err != nil {
				return nil, err
			}
			if o.Body.Items, err = pgx.CollectRows(rows, scanEntrada); err != nil {
				return nil, err
			}
			rows, err = s.a.DB.Query(ctx, `SELECT DISTINCT origen FROM entradas WHERE competition_id = $1 ORDER BY 1`, in.CID)
			if err != nil {
				return nil, err
			}
			o.Body.Origenes, err = pgx.CollectRows(rows, pgx.RowTo[string])
			return o, err
		})

	type detalleOut struct {
		Body struct {
			Entrada
			Escaneos []Escaneo `json:"escaneos"`
			QR       string    `json:"qr"`
		}
	}
	detalle := func(ctx context.Context, cid, id uuid.UUID) (*detalleOut, error) {
		rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE e.competition_id = $1 AND e.id = $2`, cid, id)
		if err != nil {
			return nil, err
		}
		e, err := pgx.CollectExactlyOneRow(rows, scanEntrada)
		if db.IsNoRows(err) {
			return nil, problem.NotFound("Esa entrada no existe.")
		}
		if err != nil {
			return nil, err
		}
		o := &detalleOut{}
		o.Body.Entrada, o.Body.QR = e, s.qr(cid, e.Codigo)
		o.Body.Escaneos, err = s.escaneos(ctx, cid, "e.entrada_id = $2", 20, id)
		return o, err
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-detalle", Method: http.MethodGet, Path: base + "/{id}", Summary: "Detalle de una reserva", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*detalleOut, error) {
			if _, err := requireAny(ctx, in.CID, perm, "checkin.escanear"); err != nil {
				return nil, err
			}
			return detalle(ctx, in.CID, in.ID)
		})

	type manualIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			SesionID  uuid.UUID `json:"sesionId"`
			Nombre    string    `json:"nombre" minLength:"1" maxLength:"80"`
			Apellidos string    `json:"apellidos,omitempty" maxLength:"120"`
			Email     string    `json:"email,omitempty" maxLength:"254"`
			Telefono  string    `json:"telefono,omitempty" maxLength:"30"`
			Personas  int       `json:"personas" minimum:"1" maximum:"20"`
			Nota      string    `json:"nota,omitempty" maxLength:"300"`
			Enviar    bool      `json:"enviar,omitempty" doc:"Enviar la entrada por email"`
			Forzar    bool      `json:"forzar,omitempty" doc:"Reservar aunque supere el aforo (invitados, prensa)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-manual", Method: http.MethodPost, Path: base, Summary: "Reserva manual (taquilla, invitados)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *manualIn) (*detalleOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			b := in.Body
			c, err := s.comps.ByID(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			var id uuid.UUID
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				x, err := s.bloquearSesion(ctx, tx, in.CID, b.SesionID)
				if err != nil {
					return err
				}
				if b.Personas > x.Aforo-x.Usadas-x.Ofertas && !b.Forzar {
					return problem.Conflict("AGOTADA", fmt.Sprintf("Quedan %d plazas. Marca «Superar el aforo» si son invitados.", max(0, x.Aforo-x.Usadas-x.Ofertas)))
				}
				e := strings.ToLower(strings.TrimSpace(b.Email))
				if id, _, _, err = s.crearEntrada(ctx, tx, c, x, nuevaEntrada{nombre: b.Nombre, apellidos: b.Apellidos, email: e, telefono: b.Telefono, personas: b.Personas, origen: "taquilla",
					nota: b.Nota, manual: true, sinEmail: !b.Enviar, cons: map[string]any{"manual": actor(ctx)}}); err != nil {
					return err
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "entrada.creada", map[string]any{"sesionId": x.ID, "personas": b.Personas, "origen": "taquilla", "manual": true},
					events.Competition(in.CID.String()), events.ForPermission(perm))); err != nil {
					return err
				}
				return s.aforoEvento(ctx, tx, in.CID, x.ID)
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return detalle(ctx, in.CID, id)
		})

	type bulkIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs      []uuid.UUID `json:"ids" minItems:"1" maxItems:"500"`
			Accion   string      `json:"accion" enum:"anular,reenviar,mover"`
			SesionID *uuid.UUID  `json:"sesionId,omitempty"`
			Motivo   string      `json:"motivo,omitempty" maxLength:"200"`
			Avisar   bool        `json:"avisar,omitempty"`
		}
	}
	type bulkOut struct {
		Body struct {
			Afectadas int `json:"afectadas"`
			Personas  int `json:"personas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-bulk", Method: http.MethodPost, Path: base + "/bulk", Summary: "Anular, reenviar o mover varias reservas", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *bulkIn) (*bulkOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			b := in.Body
			if b.Accion == "anular" && strings.TrimSpace(b.Motivo) == "" {
				return nil, problem.Unprocessable("MOTIVO_REQUERIDO", "Indica el motivo: queda en el registro y se lo contamos al titular.")
			}
			if b.Accion == "mover" && b.SesionID == nil {
				return nil, problem.Unprocessable("SESION_REQUERIDA", "Elige la sesión de destino.")
			}
			c, err := s.comps.ByID(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			o := &bulkOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				switch b.Accion {
				case "anular":
					for _, id := range b.IDs {
						var p int
						if err := tx.QueryRow(ctx, `SELECT personas FROM entradas WHERE competition_id = $1 AND id = $2 AND estado = 'reservada'`, in.CID, id).Scan(&p); err != nil {
							continue
						}
						if err := s.anular(ctx, tx, in.CID, id, b.Motivo, b.Avisar); err != nil {
							return err
						}
						o.Body.Afectadas++
						o.Body.Personas += p
					}
				case "reenviar":
					for _, id := range b.IDs {
						if err := s.reenviar(ctx, tx, c, id, ""); err == nil {
							o.Body.Afectadas++
						}
					}
				case "mover":
					x, err := s.bloquearSesion(ctx, tx, in.CID, *b.SesionID)
					if err != nil {
						return err
					}
					var total int
					if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(personas), 0) FROM entradas WHERE competition_id = $1 AND id = ANY($2) AND estado = 'reservada' AND sesion_id <> $3`, in.CID, b.IDs, x.ID).Scan(&total); err != nil {
						return err
					}
					if total > x.Aforo-x.Usadas-x.Ofertas {
						return problem.Conflict("AGOTADA", fmt.Sprintf("En «%s» quedan %d plazas y estas reservas suman %d personas.", x.Nombre, max(0, x.Aforo-x.Usadas-x.Ofertas), total))
					}
					rows, err := tx.Query(ctx, `UPDATE entradas SET sesion_id = $3, updated_at = now() WHERE competition_id = $1 AND id = ANY($2) AND estado = 'reservada' AND sesion_id <> $3
						RETURNING id`, in.CID, b.IDs, x.ID)
					if err != nil {
						return err
					}
					ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
					if err != nil {
						return err
					}
					o.Body.Afectadas, o.Body.Personas = len(ids), total
					if b.Avisar {
						for _, id := range ids {
							if err := s.reenviar(ctx, tx, c, id, ""); err != nil && !strings.Contains(err.Error(), "email") {
								return err
							}
						}
					}
					if err := s.aforoEvento(ctx, tx, in.CID, x.ID); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "entradas.bulk", map[string]any{"accion": b.Accion, "afectadas": o.Body.Afectadas, "motivo": b.Motivo},
					events.Competition(in.CID.String()), events.ForPermission(perm)))
			})
			if err == nil {
				s.bump(ctx, in.CID)
			}
			return o, err
		})

	// ---- waiting list ----
	type esperaItem struct {
		ID        uuid.UUID  `json:"id"`
		SesionID  uuid.UUID  `json:"sesionId"`
		Sesion    string     `json:"sesion"`
		Nombre    string     `json:"nombre"`
		Email     string     `json:"email"`
		Personas  int        `json:"personas"`
		Estado    string     `json:"estado"`
		Expira    *time.Time `json:"expira,omitempty"`
		Orden     int        `json:"orden"`
		CreatedAt time.Time  `json:"createdAt"`
	}
	type esperaOut struct {
		Body struct {
			Items   []esperaItem `json:"items"`
			Ajustes Ajustes      `json:"ajustes"`
		}
	}
	listaEspera := func(ctx context.Context, cid uuid.UUID) (*esperaOut, error) {
		rows, err := s.a.DB.Query(ctx, `SELECT l.id, l.sesion_id, s.nombre, l.nombre, l.email::text, l.personas, l.estado, l.oferta_expira_at,
			(row_number() OVER (PARTITION BY l.sesion_id, l.estado = 'en_espera' ORDER BY l.created_at))::int, l.created_at
			FROM lista_espera l JOIN sesiones s ON s.id = l.sesion_id WHERE l.competition_id = $1 AND l.estado IN ('en_espera', 'oferta', 'caducada')
			ORDER BY s.inicio, CASE l.estado WHEN 'oferta' THEN 0 WHEN 'en_espera' THEN 1 ELSE 2 END, l.created_at LIMIT 300`, cid)
		if err != nil {
			return nil, err
		}
		o := &esperaOut{}
		if o.Body.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[esperaItem]); err != nil {
			return nil, err
		}
		if o.Body.Items == nil {
			o.Body.Items = []esperaItem{}
		}
		o.Body.Ajustes = s.ajustes(ctx, s.a.DB, cid)
		return o, nil
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-espera-list", Method: http.MethodGet, Path: base + "/espera", Summary: "Lista de espera y promoción automática", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*esperaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			return listaEspera(ctx, in.CID)
		})
	huma.Register(api, huma.Operation{OperationID: "entradas-espera-ofrecer", Method: http.MethodPost, Path: base + "/espera/{id}/ofrecer", Summary: "Ofrecer plaza a mano (aunque no toque por orden)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*esperaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var sid uuid.UUID
				var personas int
				if err := tx.QueryRow(ctx, `SELECT sesion_id, personas FROM lista_espera WHERE competition_id = $1 AND id = $2 AND estado IN ('en_espera', 'caducada') FOR UPDATE`, in.CID, in.ID).Scan(&sid, &personas); err != nil {
					return problem.Conflict("NO_EN_ESPERA", "Esta persona ya no está esperando.")
				}
				x, err := s.bloquearSesion(ctx, tx, in.CID, sid)
				if err != nil {
					return err
				}
				if personas > x.Aforo-x.Usadas-x.Ofertas {
					return problem.Conflict("AGOTADA", fmt.Sprintf("Pide %d plazas y quedan %d. Sube el aforo o libera plazas.", personas, max(0, x.Aforo-x.Usadas-x.Ofertas)))
				}
				return s.ofrecer(ctx, tx, in.CID, in.ID, x, personas, s.ajustes(ctx, tx, in.CID).PlazoHoras)
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return listaEspera(ctx, in.CID)
		})
	huma.Register(api, huma.Operation{OperationID: "entradas-espera-retirar", Method: http.MethodDelete, Path: base + "/espera/{id}", Summary: "Quitar de la lista de espera", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*esperaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `UPDATE lista_espera SET estado = 'retirada', token_hash = '' WHERE competition_id = $1 AND id = $2`, in.CID, in.ID); err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return listaEspera(ctx, in.CID)
		})
	type ajIn struct {
		CID  uuid.UUID `path:"cid"`
		Body Ajustes
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-ajustes", Method: http.MethodPut, Path: base + "/ajustes", Summary: "Promoción automática de la lista de espera", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *ajIn) (*esperaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			a := in.Body
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO ajustes (competition_id, auto_promocion, plazo_horas, permitir_parcial) VALUES ($1,$2,$3,$4)
				ON CONFLICT (competition_id) DO UPDATE SET auto_promocion = $2, plazo_horas = $3, permitir_parcial = $4`, in.CID, a.AutoPromocion, a.PlazoHoras, a.PermitirParcial); err != nil {
				return nil, err
			}
			return listaEspera(ctx, in.CID)
		})

	type csvOut struct {
		ContentType string `header:"Content-Type"`
		Disposition string `header:"Content-Disposition"`
		Body        []byte
	}
	huma.Register(api, huma.Operation{OperationID: "entradas-export", Method: http.MethodGet, Path: base + "/export.csv", Summary: "Exportar reservas (CSV)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*csvOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			where, args := filtro(*in)
			rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE `+where+` ORDER BY s.inicio, e.created_at LIMIT 20000`, args...)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, scanEntrada)
			if err != nil {
				return nil, err
			}
			var b bytes.Buffer
			b.WriteString("\ufeff")
			w := csv.NewWriter(&b)
			w.Comma = ';'
			_ = w.Write([]string{"codigo", "sesion", "nombre", "apellidos", "email", "telefono", "personas", "dentro", "estado", "origen", "reservada"})
			safe := func(v string) string {
				if v != "" && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
					return "'" + v
				}
				return v
			}
			for _, e := range list {
				_ = w.Write([]string{e.Codigo, safe(e.Sesion), safe(e.Nombre), safe(e.Apellidos), safe(e.Email), safe(e.Telefono), fmt.Sprint(e.Personas), fmt.Sprint(e.Dentro), e.Estado, safe(e.Origen),
					e.CreatedAt.In(madrid).Format("2006-01-02 15:04")})
			}
			w.Flush()
			_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				return events.Enqueue(ctx, tx, events.New(ctx, "entradas.exportadas", map[string]any{"filas": len(list)}, events.Competition(in.CID.String()), events.ForPermission(perm)))
			})
			return &csvOut{ContentType: "text/csv; charset=utf-8", Disposition: `attachment; filename="entradas.csv"`, Body: b.Bytes()}, nil
		})
}

// ofrecer sends a waiting-list offer: the places are held until it expires.
func (s *Svc) ofrecer(ctx context.Context, tx pgx.Tx, cid, lid uuid.UUID, x sesionRow, personas, horas int) error {
	tok := randomToken()
	exp := time.Now().Add(time.Duration(horas) * time.Hour)
	var mail, nombre string
	if err := tx.QueryRow(ctx, `UPDATE lista_espera SET estado = 'oferta', personas = $2, oferta_expira_at = $3, token_hash = $4 WHERE id = $1 RETURNING email::text, nombre`,
		lid, personas, exp, hashToken(tok)).Scan(&mail, &nombre); err != nil {
		return err
	}
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return err
	}
	if err := email(ctx, tx, cid, mail, "entrada-oferta", map[string]string{"nombre": nombre, "sesion": x.Nombre, "dia": diaTxt(x.Inicio), "personas": fmt.Sprint(personas),
		"caduca": diaTxt(exp) + " a las " + hm(exp), "enlace": s.webURL + "/entradas/oferta?t=" + tok}); err != nil {
		return err
	}
	_ = c
	if err := events.Enqueue(ctx, tx, events.New(ctx, "espera.oferta", map[string]any{"sesionId": x.ID, "personas": personas}, events.Competition(cid.String()), events.ForPermission(perm))); err != nil {
		return err
	}
	return s.aforoEvento(ctx, tx, cid, x.ID)
}

var tildes = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n", "Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u", "Ñ", "n")

func sinTildes(s string) string { return tildes.Replace(s) }
