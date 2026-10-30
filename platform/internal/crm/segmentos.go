package crm

import (
	"context"
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

// Condicion is a rule of a segment. Fields and operators are whitelisted; values are always bound parameters.
type Condicion struct {
	Campo    string `json:"campo" enum:"origen,relacion,etiqueta,creado,actividad"`
	Operador string `json:"operador" enum:"es,no_es,desde,hasta"`
	Valor    string `json:"valor" maxLength:"80"`
}

// Recuento is the reachable audience of a segment: the channel consent is always applied, and suppressed
// destinations never count.
type Recuento struct {
	Total    int `json:"total"`
	Email    int `json:"email"`
	WhatsApp int `json:"whatsapp"`
}

// Segmento is a saved audience (Figma 61 · «Contactos · segmentos»).
type Segmento struct {
	ID          uuid.UUID   `json:"id"`
	Nombre      string      `json:"nombre"`
	Condiciones []Condicion `json:"condiciones"`
	UltimoUso   string      `json:"ultimoUso"`
	Recuento    Recuento    `json:"recuento"`
	Version     int         `json:"version"`
	UpdatedAt   time.Time   `json:"updatedAt"`
}

func condSQL(cs []Condicion, args *[]any) (string, error) {
	var w []string
	for _, c := range cs {
		*args = append(*args, c.Valor)
		n := fmt.Sprintf("$%d", len(*args))
		neg := c.Operador == "no_es"
		var cond string
		switch c.Campo {
		case "origen":
			vals := strings.Split(c.Valor, ",")
			(*args)[len(*args)-1] = trimAll(vals)
			cond = "c.origen = ANY(" + n + ")"
		case "relacion":
			switch c.Valor {
			case "seguidor":
				*args = (*args)[:len(*args)-1]
				cond = "jsonb_typeof(c.relacion -> 'sigue') = 'array' AND jsonb_array_length(c.relacion -> 'sigue') > 0"
			case "atleta", "voluntario", "reserva", "novedades":
				cond = "(c.relacion ->> " + n + ") = 'true'"
			default:
				return "", problem.Unprocessable("CONDICION_INVALIDA", "Relación desconocida: "+c.Valor)
			}
		case "etiqueta":
			cond = n + " = ANY(c.etiquetas)"
		case "creado", "actividad":
			if _, err := time.Parse("2006-01-02", c.Valor); err != nil {
				return "", problem.Unprocessable("CONDICION_INVALIDA", "La fecha tiene que ser AAAA-MM-DD.")
			}
			col := map[string]string{"creado": "c.created_at", "actividad": "c.actividad_at"}[c.Campo]
			op := map[string]string{"desde": ">=", "hasta": "<"}[c.Operador]
			if op == "" {
				return "", problem.Unprocessable("CONDICION_INVALIDA", "Con fechas usa «desde» o «hasta».")
			}
			cond = col + " " + op + " " + n + "::date"
			if c.Operador == "hasta" {
				cond = col + " < (" + n + "::date + 1)"
			}
			neg = false
		default:
			return "", problem.Unprocessable("CONDICION_INVALIDA", "Campo desconocido: "+c.Campo)
		}
		if neg {
			cond = "NOT (" + cond + ")"
		}
		w = append(w, cond)
	}
	if len(w) == 0 {
		return "TRUE", nil
	}
	return strings.Join(w, " AND "), nil
}

func trimAll(v []string) []string {
	out := make([]string, 0, len(v))
	for _, x := range v {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}

func (s *Svc) contar(ctx context.Context, cid uuid.UUID, cs []Condicion) (Recuento, error) {
	args := []any{cid}
	where, err := condSQL(cs, &args)
	if err != nil {
		return Recuento{}, err
	}
	var r Recuento
	err = s.a.DB.QueryRow(ctx, `SELECT count(*),
		count(*) FILTER (WHERE c.email IS NOT NULL AND EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = 'novedades_email' AND k.estado = 'confirmado')
			AND NOT EXISTS (SELECT 1 FROM supresiones x WHERE x.competition_id = c.competition_id AND x.canal = 'email' AND x.contacto_id = c.id)),
		count(*) FILTER (WHERE c.telefono IS NOT NULL AND EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = 'avisos_whatsapp' AND k.estado = 'confirmado')
			AND NOT EXISTS (SELECT 1 FROM supresiones x WHERE x.competition_id = c.competition_id AND x.canal = 'whatsapp' AND x.contacto_id = c.id))
		FROM contactos c WHERE c.competition_id = $1 AND c.anonimizado_at IS NULL AND `+where, args...).Scan(&r.Total, &r.Email, &r.WhatsApp)
	return r, err
}

func (s *Svc) registerSegmentos() {
	api := s.a.API
	leer := []string{"contactos.ver", "campanas.enviar"}
	list := func(ctx context.Context, cid uuid.UUID) ([]Segmento, error) {
		rows, err := s.a.DB.Query(ctx, `SELECT id, nombre, condiciones, ultimo_uso, version, updated_at FROM segmentos WHERE competition_id = $1 ORDER BY created_at`, cid)
		if err != nil {
			return nil, err
		}
		out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Segmento, error) {
			var g Segmento
			err := r.Scan(&g.ID, &g.Nombre, &g.Condiciones, &g.UltimoUso, &g.Version, &g.UpdatedAt)
			return g, err
		})
		if err != nil {
			return nil, err
		}
		for i := range out {
			if out[i].Recuento, err = s.contar(ctx, cid, out[i].Condiciones); err != nil {
				return nil, err
			}
		}
		if out == nil {
			out = []Segmento{}
		}
		return out, nil
	}
	huma.Register(api, huma.Operation{OperationID: "segmentos-list", Method: http.MethodGet, Path: baseC + "/segmentos", Summary: "Segmentos con su audiencia por canal", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body []Segmento }, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			l, err := list(ctx, in.CID)
			return &struct{ Body []Segmento }{l}, err
		})
	type contarIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Condiciones []Condicion `json:"condiciones" maxItems:"10"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "segmentos-contar", Method: http.MethodPost, Path: baseC + "/segmentos/contar", Summary: "Audiencia de unas condiciones (vista previa)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *contarIn) (*struct{ Body Recuento }, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			r, err := s.contar(ctx, in.CID, in.Body.Condiciones)
			return &struct{ Body Recuento }{r}, err
		})
	type segIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Nombre      string      `json:"nombre" minLength:"1" maxLength:"80"`
			Condiciones []Condicion `json:"condiciones" maxItems:"10"`
		}
	}
	guardar := func(ctx context.Context, cid uuid.UUID, id *uuid.UUID, ifm, nombre string, cs []Condicion) error {
		args := []any{cid}
		if _, err := condSQL(cs, &args); err != nil {
			return err
		}
		return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			var err error
			if id == nil {
				_, err = tx.Exec(ctx, `INSERT INTO segmentos (id, competition_id, nombre, condiciones) VALUES ($1,$2,$3,$4)`, newID(), cid, strings.TrimSpace(nombre), cs)
			} else {
				var ver int
				if err := tx.QueryRow(ctx, `SELECT version FROM segmentos WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, *id).Scan(&ver); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Ese segmento no existe.")
					}
					return err
				}
				if ifm != "" && ifm != fmt.Sprintf(`W/"%d"`, ver) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado este segmento. Recarga para ver sus cambios.")
				}
				_, err = tx.Exec(ctx, `UPDATE segmentos SET nombre = $3, condiciones = $4, version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`, cid, *id, strings.TrimSpace(nombre), cs)
			}
			if db.IsUniqueViolation(err, "") {
				return problem.Conflict("SEGMENTO_DUPLICADO", "Ya hay un segmento con ese nombre.")
			}
			if err != nil {
				return err
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "crm.segmento_guardado", map[string]any{"nombre": nombre}, events.Competition(cid.String()), events.ForPermission("campanas.enviar")))
		})
	}
	huma.Register(api, huma.Operation{OperationID: "segmentos-crear", Method: http.MethodPost, Path: baseC + "/segmentos", Summary: "Nuevo segmento", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *segIn) (*struct{ Body []Segmento }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "campanas.enviar"); err != nil {
				return nil, err
			}
			if err := guardar(ctx, in.CID, nil, "", in.Body.Nombre, in.Body.Condiciones); err != nil {
				return nil, err
			}
			l, err := list(ctx, in.CID)
			return &struct{ Body []Segmento }{l}, err
		})
	type segIDIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Nombre      string      `json:"nombre" minLength:"1" maxLength:"80"`
			Condiciones []Condicion `json:"condiciones" maxItems:"10"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "segmentos-editar", Method: http.MethodPut, Path: baseC + "/segmentos/{id}", Summary: "Editar un segmento (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *segIDIn) (*struct{ Body []Segmento }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "campanas.enviar"); err != nil {
				return nil, err
			}
			if err := guardar(ctx, in.CID, &in.ID, in.IfMatch, in.Body.Nombre, in.Body.Condiciones); err != nil {
				return nil, err
			}
			l, err := list(ctx, in.CID)
			return &struct{ Body []Segmento }{l}, err
		})
	huma.Register(api, huma.Operation{OperationID: "segmentos-borrar", Method: http.MethodDelete, Path: baseC + "/segmentos/{id}", Summary: "Borrar un segmento", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*struct{ Body []Segmento }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "campanas.enviar"); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `DELETE FROM segmentos WHERE competition_id = $1 AND id = $2`, in.CID, in.ID); err != nil {
				return nil, err
			}
			l, err := list(ctx, in.CID)
			return &struct{ Body []Segmento }{l}, err
		})
}

// Supresion is a destination we never write to.
type Supresion struct {
	ID       uuid.UUID  `json:"id"`
	Canal    string     `json:"canal"`
	Destino  string     `json:"destino" doc:"Enmascarado"`
	Tipo     string     `json:"tipo"`
	Motivo   string     `json:"motivo"`
	Origen   string     `json:"origen"`
	At       time.Time  `json:"at"`
	Contacto *uuid.UUID `json:"contactoId,omitempty"`
	Nombre   string     `json:"nombre"`
}

func (s *Svc) supresiones(ctx context.Context, cid uuid.UUID, where string, args ...any) ([]Supresion, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT x.id, x.canal, x.destino_mascara, x.tipo, x.motivo, x.origen, x.created_at, x.contacto_id, COALESCE(c.nombre, '') FROM supresiones x
		LEFT JOIN contactos c ON c.id = x.contacto_id WHERE x.competition_id = $1 AND `+where+` ORDER BY x.created_at DESC LIMIT 200`, append([]any{cid}, args...)...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Supresion])
	if out == nil {
		out = []Supresion{}
	}
	return out, err
}

func (s *Svc) registerSupresiones() {
	api := s.a.API
	type listIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `query:"tipo" enum:",baja,email_invalido,whatsapp_invalido,rebote"`
	}
	type listOut struct {
		Body struct {
			Items []Supresion    `json:"items"`
			Tipos map[string]int `json:"tipos"`
			Total int            `json:"total"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "supresiones-list", Method: http.MethodGet, Path: baseC + "/supresiones", Summary: "Bajas y supresiones (destinos enmascarados)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listIn) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.ver"); err != nil {
				return nil, err
			}
			o := &listOut{}
			var err error
			if in.Tipo == "" {
				o.Body.Items, err = s.supresiones(ctx, in.CID, "TRUE")
			} else {
				o.Body.Items, err = s.supresiones(ctx, in.CID, "x.tipo = $2", in.Tipo)
			}
			if err != nil {
				return nil, err
			}
			o.Body.Tipos = map[string]int{"baja": 0, "email_invalido": 0, "whatsapp_invalido": 0, "rebote": 0}
			rows, err := s.a.DB.Query(ctx, `SELECT tipo, count(*) FROM supresiones WHERE competition_id = $1 GROUP BY 1`, in.CID)
			if err != nil {
				return nil, err
			}
			for rows.Next() {
				var t string
				var n int
				if rows.Scan(&t, &n) == nil {
					o.Body.Tipos[t] = n
					o.Body.Total += n
				}
			}
			rows.Close()
			return o, nil
		})
	type addIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Canal   string `json:"canal" enum:"email,whatsapp"`
			Destino string `json:"destino" minLength:"5" maxLength:"254"`
			Motivo  string `json:"motivo,omitempty" maxLength:"200"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "supresiones-crear", Method: http.MethodPost, Path: baseC + "/supresiones", Summary: "Añadir una baja a mano (p. ej. pedida por teléfono)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *addIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			motivo := in.Body.Motivo
			if motivo == "" {
				motivo = "Añadida por " + actor(ctx)
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := s.suprimir(ctx, tx, in.CID, in.Body.Canal, in.Body.Destino, "baja", motivo, "backoffice"); err != nil {
					return err
				}
				if in.Body.Canal == "email" {
					if _, err := tx.Exec(ctx, `UPDATE consentimientos k SET estado = 'revocado', revocado_at = now(), revocado_motivo = $3 FROM contactos c
						WHERE c.id = k.contacto_id AND c.competition_id = $1 AND c.email = $2 AND k.finalidad = 'novedades_email' AND k.estado <> 'revocado'`,
						in.CID, strings.ToLower(strings.TrimSpace(in.Body.Destino)), motivo); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.baja_manual", map[string]any{"canal": in.Body.Canal}, events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
		})
	huma.Register(api, huma.Operation{OperationID: "supresiones-borrar", Method: http.MethodDelete, Path: baseC + "/supresiones/{id}", Summary: "Quitar una supresión (p. ej. un email corregido)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			var tipo string
			err := s.a.DB.QueryRow(ctx, `DELETE FROM supresiones WHERE competition_id = $1 AND id = $2 RETURNING tipo`, in.CID, in.ID).Scan(&tipo)
			if db.IsNoRows(err) {
				return nil, problem.NotFound("Esa supresión ya no existe.")
			}
			if tipo == "baja" {
				// An unsubscribe is the person's decision: removing it does not re-subscribe them (they must opt in again).
				return nil, err
			}
			return nil, err
		})
}
