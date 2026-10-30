package messaging

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagAdmin = []string{"Emails y avisos"}

const base = "/api/admin/competiciones/{cid}/emails"

const perm = "campanas.enviar"

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

// Resumen is the header of «Emails y avisos» (KPIs of the last 7 days and the SMTP state).
type Resumen struct {
	Enviados7d   int        `json:"enviados7d"`
	EnviadosPrev int        `json:"enviadosPrev" doc:"Semana anterior"`
	Entregados   float64    `json:"entregados" doc:"% enviados sobre enviados + rebotados + fallidos (7 días)"`
	Rebotes7d    int        `json:"rebotes7d"`
	EnCola       int        `json:"enCola"`
	Ritmo        int        `json:"ritmo" doc:"Emails por minuto"`
	SMTP         SMTPEstado `json:"smtp"`
	Serie        []int      `json:"serie" doc:"Enviados por día (7 días)"`
}

// SMTPEstado is the server state shown in the outbox banner.
type SMTPEstado struct {
	Conocido    bool       `json:"conocido"`
	OK          bool       `json:"ok"`
	Servidor    string     `json:"servidor"`
	Error       string     `json:"error,omitempty"`
	UltimoEnvio *time.Time `json:"ultimoEnvio,omitempty"`
	Desde       *time.Time `json:"desde,omitempty"`
	Propio      bool       `json:"propio" doc:"La competición tiene su SMTP configurado"`
}

// PlantillaItem is a card of the «Plantillas» tab.
type PlantillaItem struct {
	Clave         string     `json:"clave"`
	Nombre        string     `json:"nombre"`
	Disparador    string     `json:"disparador"`
	Asunto        string     `json:"asunto"`
	Esencial      bool       `json:"esencial"`
	Estado        string     `json:"estado" enum:"activa,pausada,error"`
	Error         string     `json:"error,omitempty"`
	Personalizada bool       `json:"personalizada"`
	Enviados      int        `json:"enviados"`
	Fallos        int        `json:"fallos"`
	UltimoEnvio   *time.Time `json:"ultimoEnvio,omitempty"`
}

// PlantillaDetalle is the editor.
type PlantillaDetalle struct {
	Info PlantillaItem `json:"info"`
	Contenido
	Variables  []string          `json:"variables"`
	Ejemplo    map[string]string `json:"ejemplo"`
	Original   Contenido         `json:"original"`
	Version    int               `json:"version"`
	UpdatedPor string            `json:"updatedPor,omitempty"`
	UpdatedAt  *time.Time        `json:"updatedAt,omitempty"`
}

// Mensaje is a row of the outbox.
type Mensaje struct {
	ID          uuid.UUID  `json:"id"`
	Destino     string     `json:"destino"`
	Canal       string     `json:"canal"`
	Plantilla   string     `json:"plantilla"`
	Nombre      string     `json:"nombre" doc:"Nombre de la plantilla"`
	Asunto      string     `json:"asunto"`
	Estado      string     `json:"estado"`
	Intentos    int        `json:"intentos"`
	Detalle     string     `json:"detalle"`
	Prueba      bool       `json:"prueba"`
	CreatedAt   time.Time  `json:"createdAt"`
	EnviadoAt   *time.Time `json:"enviadoAt,omitempty"`
	ProximoAt   *time.Time `json:"proximoAt,omitempty"`
	ProveedorID string     `json:"proveedorId,omitempty"`
}

// AutoItem is a row of «Automatizaciones».
type AutoItem struct {
	Automatizacion
	Activa     bool       `json:"activa"`
	Estado     string     `json:"estado" enum:"activa,pausada,error"`
	Plantillas []string   `json:"plantillas"`
	Enviados7d int        `json:"enviados7d"`
	Ultimo     *time.Time `json:"ultimo,omitempty"`
}

func editable(t Plantilla) bool { return t.Servicio != "identity" }

func (s *Svc) item(ctx context.Context, cid uuid.UUID, t Plantilla) (PlantillaItem, error) {
	e, err := s.plantilla(ctx, cid, t.Clave)
	if err != nil {
		return PlantillaItem{}, err
	}
	it := PlantillaItem{Clave: t.Clave, Nombre: t.Nombre, Disparador: t.Disparador, Asunto: e.Asunto, Esencial: t.Esencial, Estado: e.Estado, Error: e.Error, Personalizada: e.Personalizada}
	err = s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE estado = 'enviado' AND NOT prueba), count(*) FILTER (WHERE estado IN ('fallido', 'rebotado') AND NOT prueba), max(enviado_at)
		FROM mensajes WHERE competition_id = $1 AND plantilla = $2`, cid, t.Clave).Scan(&it.Enviados, &it.Fallos, &it.UltimoEnvio)
	return it, err
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	huma.Register(api, huma.Operation{OperationID: "emails-resumen", Method: http.MethodGet, Path: base + "/resumen", Summary: "KPIs de envío y estado del SMTP", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body Resumen }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			var r Resumen
			err := s.a.DB.QueryRow(ctx, `SELECT
				count(*) FILTER (WHERE estado = 'enviado' AND enviado_at > now() - interval '7 days'),
				count(*) FILTER (WHERE estado = 'enviado' AND enviado_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'),
				count(*) FILTER (WHERE estado = 'rebotado' AND updated_at > now() - interval '7 days'),
				count(*) FILTER (WHERE estado IN ('fallido', 'rebotado') AND updated_at > now() - interval '7 days'),
				count(*) FILTER (WHERE estado IN ('en_cola', 'reintentando', 'enviando'))
				FROM mensajes WHERE competition_id = $1 AND NOT prueba`, in.CID).Scan(&r.Enviados7d, &r.EnviadosPrev, &r.Rebotes7d, new(int), &r.EnCola)
			if err != nil {
				return nil, err
			}
			var malos int
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM mensajes WHERE competition_id = $1 AND NOT prueba AND estado IN ('fallido', 'rebotado') AND updated_at > now() - interval '7 days'`, in.CID).Scan(&malos)
			if t := r.Enviados7d + malos; t > 0 {
				r.Entregados = float64(int(float64(r.Enviados7d)/float64(t)*1000)) / 10
			}
			r.Serie = make([]int, 7)
			rows, err := s.a.DB.Query(ctx, `SELECT (now()::date - enviado_at::date) AS d, count(*) FROM mensajes WHERE competition_id = $1 AND estado = 'enviado' AND NOT prueba AND enviado_at > now() - interval '7 days' GROUP BY 1`, in.CID)
			if err == nil {
				for rows.Next() {
					var d, n int
					if rows.Scan(&d, &n) == nil && d >= 0 && d < 7 {
						r.Serie[6-d] = n
					}
				}
				rows.Close()
			}
			r.Ritmo = 120
			_ = s.a.DB.QueryRow(ctx, `SELECT ritmo_minuto FROM ajustes WHERE competition_id = $1`, in.CID).Scan(&r.Ritmo)
			cfg := s.smtpDe(ctx, in.CID)
			r.SMTP.Servidor, r.SMTP.Propio = cfg.servidor(), cfg.Propio
			var desde time.Time
			if err := s.a.DB.QueryRow(ctx, `SELECT ok, error, ultimo_envio, cambiado_at FROM smtp_estado WHERE competition_id = $1`, in.CID).Scan(&r.SMTP.OK, &r.SMTP.Error, &r.SMTP.UltimoEnvio, &desde); err == nil {
				r.SMTP.Conocido, r.SMTP.Desde = true, &desde
			}
			return &struct{ Body Resumen }{r}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "emails-plantillas", Method: http.MethodGet, Path: base + "/plantillas", Summary: "Plantillas de email de la competición", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body []PlantillaItem }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			out := []PlantillaItem{}
			for _, t := range catalogo {
				if !editable(t) {
					continue
				}
				it, err := s.item(ctx, in.CID, t)
				if err != nil {
					return nil, err
				}
				out = append(out, it)
			}
			return &struct{ Body []PlantillaItem }{out}, nil
		})

	type claveIn struct {
		CID   uuid.UUID `path:"cid"`
		Clave string    `path:"clave" pattern:"^[a-z0-9-]{3,40}$"`
	}
	type detOut struct {
		ETag string `header:"ETag"`
		Body PlantillaDetalle
	}
	detalle := func(ctx context.Context, cid uuid.UUID, clave string) (*detOut, error) {
		t, ok := porClave[clave]
		if !ok || !editable(t) {
			return nil, problem.NotFound("Esa plantilla no existe.")
		}
		e, err := s.plantilla(ctx, cid, clave)
		if err != nil {
			return nil, err
		}
		it, err := s.item(ctx, cid, t)
		if err != nil {
			return nil, err
		}
		d := PlantillaDetalle{Info: it, Contenido: e.Contenido, Variables: variablesOrdenadas(t.Variables), Ejemplo: t.Ejemplo, Original: t.Contenido, Version: e.Version, UpdatedPor: e.UpdatedPor, UpdatedAt: e.UpdatedAt}
		return &detOut{ETag: `W/"` + strconv.Itoa(e.Version) + `"`, Body: d}, nil
	}
	huma.Register(api, huma.Operation{OperationID: "emails-plantilla", Method: http.MethodGet, Path: base + "/plantillas/{clave}", Summary: "Plantilla para el editor", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *claveIn) (*detOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			return detalle(ctx, in.CID, in.Clave)
		})

	type putIn struct {
		CID     uuid.UUID `path:"cid"`
		Clave   string    `path:"clave" pattern:"^[a-z0-9-]{3,40}$"`
		IfMatch string    `header:"If-Match"`
		Body    Contenido
	}
	huma.Register(api, huma.Operation{OperationID: "emails-plantilla-guardar", Method: http.MethodPut, Path: base + "/plantillas/{clave}", Summary: "Guardar y activar una plantilla (If-Match; 422 VARIABLE_INEXISTENTE)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *putIn) (*detOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			t, ok := porClave[in.Clave]
			if !ok || !editable(t) {
				return nil, problem.NotFound("Esa plantilla no existe.")
			}
			if err := validar(in.Body, t.Variables); err != nil {
				return nil, err
			}
			c := in.Body
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var ver int
				err := tx.QueryRow(ctx, `SELECT version FROM plantillas WHERE competition_id = $1 AND clave = $2 FOR UPDATE`, in.CID, in.Clave).Scan(&ver)
				if err != nil && !db.IsNoRows(err) {
					return err
				}
				if in.IfMatch != "" && strings.Trim(strings.TrimPrefix(in.IfMatch, "W/"), `"`) != strconv.Itoa(ver) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha guardado esta plantilla mientras la editabas. Recarga para ver sus cambios.")
				}
				if _, err := tx.Exec(ctx, `INSERT INTO plantillas (competition_id, clave, asunto, preheader, titulo, cuerpo, boton_texto, boton_url, pie, version, updated_por)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)
					ON CONFLICT (competition_id, clave) DO UPDATE SET asunto = $3, preheader = $4, titulo = $5, cuerpo = $6, boton_texto = $7, boton_url = $8, pie = $9,
					version = plantillas.version + 1, updated_por = $10, updated_at = now()`,
					in.CID, in.Clave, c.Asunto, c.Preheader, c.Titulo, c.Cuerpo, c.BotonTexto, c.BotonURL, c.Pie, actor(ctx)); err != nil {
					return err
				}
				// Saving a valid design re-activates a template paused by a render error.
				if _, err := tx.Exec(ctx, `DELETE FROM plantilla_estado WHERE competition_id = $1 AND clave = $2 AND estado = 'error'`, in.CID, in.Clave); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "messaging.plantilla_guardada", map[string]any{"clave": in.Clave, "nombre": t.Nombre},
					events.Competition(in.CID.String()), events.ForPermission(perm)))
			})
			if err != nil {
				return nil, err
			}
			// Messages held by the error go out now.
			_, _ = s.a.DB.Exec(ctx, `UPDATE mensajes SET proximo_at = now() WHERE competition_id = $1 AND plantilla = $2 AND estado = 'reintentando' AND detalle LIKE 'Plantilla con error%'`, in.CID, in.Clave)
			return detalle(ctx, in.CID, in.Clave)
		})

	huma.Register(api, huma.Operation{OperationID: "emails-plantilla-restaurar", Method: http.MethodDelete, Path: base + "/plantillas/{clave}", Summary: "Volver al diseño original", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *claveIn) (*detOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `DELETE FROM plantillas WHERE competition_id = $1 AND clave = $2`, in.CID, in.Clave); err != nil {
				return nil, err
			}
			_, _ = s.a.DB.Exec(ctx, `DELETE FROM plantilla_estado WHERE competition_id = $1 AND clave = $2 AND estado = 'error'`, in.CID, in.Clave)
			return detalle(ctx, in.CID, in.Clave)
		})

	type estadoIn struct {
		CID   uuid.UUID `path:"cid"`
		Clave string    `path:"clave" pattern:"^[a-z0-9-]{3,40}$"`
		Body  struct {
			Estado string `json:"estado" enum:"activa,pausada"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-plantilla-estado", Method: http.MethodPut, Path: base + "/plantillas/{clave}/estado", Summary: "Activar o pausar una plantilla", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *estadoIn) (*detOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			t, ok := porClave[in.Clave]
			if !ok || !editable(t) {
				return nil, problem.NotFound("Esa plantilla no existe.")
			}
			if in.Body.Estado == "pausada" && t.Esencial {
				return nil, problem.Conflict("PLANTILLA_ESENCIAL", "Es un email operativo (accesos, pagos, horarios): no se puede pausar.")
			}
			if in.Body.Estado == "activa" {
				_, err := s.a.DB.Exec(ctx, `DELETE FROM plantilla_estado WHERE competition_id = $1 AND clave = $2 AND estado = 'pausada'`, in.CID, in.Clave)
				if err != nil {
					return nil, err
				}
			} else if _, err := s.a.DB.Exec(ctx, `INSERT INTO plantilla_estado (competition_id, clave, estado) VALUES ($1,$2,'pausada')
				ON CONFLICT (competition_id, clave) DO UPDATE SET estado = 'pausada', error = '', updated_at = now()`, in.CID, in.Clave); err != nil {
				return nil, err
			}
			return detalle(ctx, in.CID, in.Clave)
		})

	type prevIn struct {
		CID   uuid.UUID `path:"cid"`
		Clave string    `path:"clave" pattern:"^[a-z0-9-]{3,40}$"`
		Body  struct {
			Contenido *Contenido        `json:"contenido,omitempty" doc:"Diseño sin guardar (si no, el guardado)"`
			Datos     map[string]string `json:"datos,omitempty" doc:"Datos de prueba (si no, los de ejemplo)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-plantilla-previsualizar", Method: http.MethodPost, Path: base + "/plantillas/{clave}/previsualizar", Summary: "Vista previa con datos de prueba", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *prevIn) (*struct{ Body Render }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			e, err := s.plantilla(ctx, in.CID, in.Clave)
			if err != nil {
				return nil, err
			}
			c := e.Contenido
			if in.Body.Contenido != nil {
				c = *in.Body.Contenido
			}
			datos := e.Ejemplo
			if in.Body.Datos != nil {
				datos = in.Body.Datos
			}
			r, err := renderizar(c, datos, e.Variables, s.marca(ctx, in.CID), e.Esencial)
			if err != nil {
				return nil, problem.Unprocessable("VARIABLE_INEXISTENTE", err.Error())
			}
			return &struct{ Body Render }{r}, nil
		})

	type pruebaIn struct {
		CID   uuid.UUID `path:"cid"`
		Clave string    `path:"clave" pattern:"^[a-z0-9-]{3,40}$"`
		Body  struct {
			Destino string `json:"destino" format:"email" maxLength:"254"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-plantilla-prueba", Method: http.MethodPost, Path: base + "/plantillas/{clave}/prueba", Summary: "Enviar una prueba con los datos de ejemplo", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *pruebaIn) (*struct{ Body Mensaje }, error) {
			p, err := auth.Require(ctx, in.CID.String(), perm)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "prueba-email", p.UserID.String()), 20, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has enviado muchas pruebas. Espera un rato.")
			}
			t, ok := porClave[in.Clave]
			if !ok || !editable(t) {
				return nil, problem.NotFound("Esa plantilla no existe.")
			}
			dest := strings.ToLower(strings.TrimSpace(in.Body.Destino))
			if a, err := mail.ParseAddress(dest); err != nil || a.Address != dest {
				return nil, problem.Unprocessable("EMAIL_INVALIDO", "Escribe un email válido.")
			}
			id := uuid.Must(uuid.NewV7())
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO mensajes (id, competition_id, plantilla, destino, vars, prueba) VALUES ($1,$2,$3,$4,$5,true)`, id, in.CID, in.Clave, dest, t.Ejemplo); err != nil {
				return nil, err
			}
			m, err := s.mensaje(ctx, in.CID, id)
			return &struct{ Body Mensaje }{m}, err
		})

	// ---- outbox ----
	type salidaIn struct {
		CID    uuid.UUID `path:"cid"`
		Estado string    `query:"estado" enum:",en_cola,enviado,reintentando,rebotado,fallido,omitido,cancelado,problemas"`
		Q      string    `query:"q" maxLength:"100"`
		Pagina int       `query:"pagina" minimum:"1" default:"1"`
	}
	type salidaOut struct {
		Body struct {
			Items   []Mensaje      `json:"items"`
			Total   int            `json:"total"`
			Pagina  int            `json:"pagina"`
			Por     int            `json:"por"`
			Estados map[string]int `json:"estados"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-salida", Method: http.MethodGet, Path: base + "/salida", Summary: "Bandeja de salida", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *salidaIn) (*salidaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			where := `competition_id = $1`
			args := []any{in.CID}
			switch in.Estado {
			case "":
			case "problemas":
				where += ` AND estado IN ('reintentando', 'rebotado', 'fallido')`
			case "en_cola":
				where += ` AND estado IN ('en_cola', 'enviando')`
			default:
				args = append(args, in.Estado)
				where += fmt.Sprintf(` AND estado = $%d`, len(args))
			}
			if q := strings.TrimSpace(in.Q); q != "" {
				args = append(args, "%"+strings.ToLower(q)+"%")
				where += fmt.Sprintf(` AND (destino::text LIKE $%d OR plantilla LIKE $%d)`, len(args), len(args))
			}
			o := &salidaOut{}
			o.Body.Pagina, o.Body.Por = in.Pagina, 25
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM mensajes WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selMensaje+` WHERE `+where+fmt.Sprintf(` ORDER BY created_at DESC LIMIT 25 OFFSET %d`, (in.Pagina-1)*25), args...)
			if err != nil {
				return nil, err
			}
			if o.Body.Items, err = pgx.CollectRows(rows, scanMensaje); err != nil {
				return nil, err
			}
			o.Body.Estados = map[string]int{}
			rows, err = s.a.DB.Query(ctx, `SELECT estado, count(*) FROM mensajes WHERE competition_id = $1 GROUP BY 1`, in.CID)
			if err != nil {
				return nil, err
			}
			for rows.Next() {
				var e string
				var n int
				if rows.Scan(&e, &n) == nil {
					o.Body.Estados[e] = n
				}
			}
			rows.Close()
			return o, nil
		})

	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type verOut struct {
		Body struct {
			Mensaje
			HTML  string `json:"html"`
			Texto string `json:"texto"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-salida-ver", Method: http.MethodGet, Path: base + "/salida/{id}", Summary: "Un mensaje con su contenido (enlaces privados ocultos)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*verOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			m, err := s.mensaje(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			var vars map[string]string
			if err := s.a.DB.QueryRow(ctx, `SELECT vars FROM mensajes WHERE id = $1`, in.ID).Scan(&vars); err != nil {
				return nil, err
			}
			// Access links (magic links, payment links, unsubscribe) belong to the recipient: never shown to staff.
			for k := range vars {
				if k == "enlace" || k == "url" || k == "baja" {
					vars[k] = "https://enlace-privado.invalid/"
				}
			}
			o := &verOut{}
			o.Body.Mensaje = m
			if e, err := s.plantilla(ctx, in.CID, m.Plantilla); err == nil {
				if r, err := renderizar(e.Contenido, vars, e.Variables, s.marca(ctx, in.CID), e.Esencial); err == nil {
					o.Body.HTML, o.Body.Texto = r.HTML, r.Texto
				}
			}
			return o, nil
		})

	type bulkIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs    []uuid.UUID `json:"ids" minItems:"1" maxItems:"200"`
			Accion string      `json:"accion" enum:"reintentar,cancelar"`
		}
	}
	type bulkOut struct {
		Body struct {
			Afectados int `json:"afectados"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-salida-bulk", Method: http.MethodPost, Path: base + "/salida/bulk", Summary: "Reintentar o cancelar mensajes", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *bulkIn) (*bulkOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			o := &bulkOut{}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var q string
				if in.Body.Accion == "reintentar" {
					// A retried bounce leaves the invalid list (the address may have been fixed).
					if _, err := tx.Exec(ctx, `DELETE FROM destinos_invalidos WHERE destino IN (SELECT destino FROM mensajes WHERE competition_id = $1 AND id = ANY($2) AND estado = 'rebotado')`, in.CID, in.Body.IDs); err != nil {
						return err
					}
					q = `UPDATE mensajes SET estado = 'en_cola', intentos = 0, proximo_at = now(), detalle = 'Reintento manual', updated_at = now()
						WHERE competition_id = $1 AND id = ANY($2) AND estado IN ('fallido', 'rebotado', 'cancelado', 'omitido', 'reintentando')`
				} else {
					q = `UPDATE mensajes SET estado = 'cancelado', detalle = 'Cancelado a mano', updated_at = now() WHERE competition_id = $1 AND id = ANY($2) AND estado IN ('en_cola', 'reintentando')`
				}
				tag, err := tx.Exec(ctx, q, in.CID, in.Body.IDs)
				o.Body.Afectados = int(tag.RowsAffected())
				return err
			})
			return o, err
		})

	// ---- automations ----
	type autoOut struct {
		Body struct {
			PausarEnEvento bool       `json:"pausarEnEvento"`
			Ritmo          int        `json:"ritmo"`
			Items          []AutoItem `json:"items"`
		}
	}
	autos := func(ctx context.Context, cid uuid.UUID) (*autoOut, error) {
		o := &autoOut{}
		o.Body.PausarEnEvento, o.Body.Ritmo = true, 120
		_ = s.a.DB.QueryRow(ctx, `SELECT pausar_en_evento, ritmo_minuto FROM ajustes WHERE competition_id = $1`, cid).Scan(&o.Body.PausarEnEvento, &o.Body.Ritmo)
		for _, a := range automatizaciones {
			it := AutoItem{Automatizacion: a, Activa: true, Estado: "activa", Plantillas: []string{}}
			_ = s.a.DB.QueryRow(ctx, `SELECT activa FROM automatizaciones WHERE competition_id = $1 AND clave = $2`, cid, a.Clave).Scan(&it.Activa)
			for _, t := range catalogo {
				if t.Auto == a.Clave && editable(t) {
					it.Plantillas = append(it.Plantillas, t.Clave)
				}
			}
			if len(it.Plantillas) == 0 {
				continue
			}
			var errores int
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM plantilla_estado WHERE competition_id = $1 AND clave = ANY($2) AND estado = 'error'`, cid, it.Plantillas).Scan(&errores)
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*), max(enviado_at) FROM mensajes WHERE competition_id = $1 AND plantilla = ANY($2) AND estado = 'enviado' AND NOT prueba AND enviado_at > now() - interval '7 days'`,
				cid, it.Plantillas).Scan(&it.Enviados7d, &it.Ultimo)
			switch {
			case errores > 0:
				it.Estado = "error"
			case !it.Activa:
				it.Estado = "pausada"
			}
			o.Body.Items = append(o.Body.Items, it)
		}
		return o, nil
	}
	huma.Register(api, huma.Operation{OperationID: "emails-automatizaciones", Method: http.MethodGet, Path: base + "/automatizaciones", Summary: "Automatizaciones y pausa global", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*autoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			return autos(ctx, in.CID)
		})
	type autoIn struct {
		CID   uuid.UUID `path:"cid"`
		Clave string    `path:"clave" pattern:"^[a-z0-9]{3,20}$"`
		Body  struct {
			Activa bool `json:"activa"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-automatizacion", Method: http.MethodPut, Path: base + "/automatizaciones/{clave}", Summary: "Activar o desactivar una automatización", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *autoIn) (*autoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			a, ok := autoDe(in.Clave)
			if !ok {
				return nil, problem.NotFound("Esa automatización no existe.")
			}
			if a.Esencial && !in.Body.Activa {
				return nil, problem.Conflict("AUTOMATIZACION_ESENCIAL", "Son emails operativos (accesos, pagos, horarios): no se pueden desactivar.")
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO automatizaciones (competition_id, clave, activa) VALUES ($1,$2,$3) ON CONFLICT (competition_id, clave) DO UPDATE SET activa = $3`, in.CID, in.Clave, in.Body.Activa); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "messaging.automatizacion", map[string]any{"clave": in.Clave, "nombre": a.Nombre, "activa": in.Body.Activa},
					events.Competition(in.CID.String()), events.ForPermission(perm)))
			})
			if err != nil {
				return nil, err
			}
			return autos(ctx, in.CID)
		})
	type ajustesIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			PausarEnEvento bool `json:"pausarEnEvento"`
			Ritmo          int  `json:"ritmo" minimum:"1" maximum:"2000"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "emails-ajustes", Method: http.MethodPut, Path: base + "/ajustes", Summary: "Pausa durante el evento y ritmo de envío", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *ajustesIn) (*autoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO ajustes (competition_id, pausar_en_evento, ritmo_minuto) VALUES ($1,$2,$3)
				ON CONFLICT (competition_id) DO UPDATE SET pausar_en_evento = $2, ritmo_minuto = $3`, in.CID, in.Body.PausarEnEvento, in.Body.Ritmo); err != nil {
				return nil, err
			}
			return autos(ctx, in.CID)
		})
}

const selMensaje = `SELECT id, destino::text, canal, plantilla, asunto, estado, intentos, detalle, prueba, created_at, enviado_at,
	CASE WHEN estado IN ('en_cola', 'reintentando') THEN proximo_at END, proveedor_id FROM mensajes`

func scanMensaje(r pgx.CollectableRow) (Mensaje, error) {
	var m Mensaje
	err := r.Scan(&m.ID, &m.Destino, &m.Canal, &m.Plantilla, &m.Asunto, &m.Estado, &m.Intentos, &m.Detalle, &m.Prueba, &m.CreatedAt, &m.EnviadoAt, &m.ProximoAt, &m.ProveedorID)
	if t, ok := porClave[m.Plantilla]; ok {
		m.Nombre = t.Nombre
	}
	return m, err
}

func (s *Svc) mensaje(ctx context.Context, cid, id uuid.UUID) (Mensaje, error) {
	rows, err := s.a.DB.Query(ctx, selMensaje+` WHERE competition_id = $1 AND id = $2`, cid, id)
	if err != nil {
		return Mensaje{}, err
	}
	m, err := pgx.CollectExactlyOneRow(rows, scanMensaje)
	if db.IsNoRows(err) {
		return m, errNoEncontrado
	}
	return m, err
}
