package audit

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// guardarWebhook keeps one row per provider event (Sistema › Salud · «Webhooks recibidos», Figma 64): a retry of
// the same event adds an attempt and keeps the last answer.
func (s *Svc) guardarWebhook(ctx context.Context, e events.Event) error {
	cid, err := uuid.Parse(e.CompetitionID)
	if err != nil {
		return nil
	}
	var d struct {
		Proveedor string `json:"proveedor"`
		Tipo      string `json:"tipo"`
		EventoID  string `json:"eventoId"`
		Respuesta int    `json:"respuesta"`
	}
	if json.Unmarshal(e.Data, &d) != nil {
		return nil
	}
	clave := d.EventoID
	if clave == "" {
		clave = e.ID.String()
	}
	_, err = s.a.DB.Exec(ctx, `INSERT INTO webhooks (competition_id, clave, proveedor, servicio, tipo, respuesta, recibido_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (competition_id, clave) DO UPDATE SET respuesta = EXCLUDED.respuesta, intentos = webhooks.intentos + 1, recibido_at = EXCLUDED.recibido_at`,
		cid, clave, d.Proveedor, e.Source, d.Tipo, d.Respuesta, e.OccurredAt)
	return err
}

// Webhook is one provider event as listed in Sistema › Salud.
type Webhook struct {
	ID         string    `json:"id"`
	Proveedor  string    `json:"proveedor"`
	Servicio   string    `json:"servicio"`
	Tipo       string    `json:"tipo"`
	Estado     string    `json:"estado" enum:"procesado,error"`
	Respuesta  int       `json:"respuesta"`
	Intentos   int       `json:"intentos"`
	RecibidoAt time.Time `json:"recibidoAt"`
}

// Exportacion is a full export of a competition (ZIP, kept 24 h).
type Exportacion struct {
	ID          uuid.UUID  `json:"id"`
	Tipo        string     `json:"tipo"`
	Estado      string     `json:"estado" enum:"en_curso,lista,error"`
	Bytes       int64      `json:"bytes"`
	Error       string     `json:"error,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	TerminadaAt *time.Time `json:"terminadaAt,omitempty"`
	ExpiraAt    *time.Time `json:"expiraAt,omitempty"`
	URL         string     `json:"url,omitempty" doc:"Descarga (con la sesión de Root) mientras no caduque"`
}

func (s *Svc) registerSistema() {
	api := s.a.API

	type whIn struct {
		CID       uuid.UUID `path:"cid"`
		Proveedor string    `query:"proveedor" maxLength:"20"`
		Estado    string    `query:"estado" maxLength:"20"`
		Pagina    int       `query:"pagina" minimum:"0"`
		Por       int       `query:"por" minimum:"0" maximum:"100"`
	}
	type whOut struct {
		Body struct {
			Items  []Webhook `json:"items"`
			Total  int       `json:"total"`
			Pagina int       `json:"pagina"`
			Por    int       `json:"por"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sistema-webhooks", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/webhooks", Summary: "Webhooks recibidos de los proveedores (Stripe, WhatsApp) y su respuesta", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *whIn) (*whOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			if in.Pagina < 1 {
				in.Pagina = 1
			}
			if in.Por < 1 {
				in.Por = 25
			}
			where, args := `competition_id = $1`, []any{in.CID}
			if in.Proveedor != "" {
				args = append(args, in.Proveedor)
				where += fmt.Sprintf(` AND proveedor = $%d`, len(args))
			}
			switch in.Estado {
			case "error":
				where += ` AND respuesta >= 300`
			case "procesado":
				where += ` AND respuesta < 300`
			}
			o := &whOut{}
			o.Body.Pagina, o.Body.Por, o.Body.Items = in.Pagina, in.Por, []Webhook{}
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM webhooks WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT clave, proveedor, servicio, tipo, respuesta, intentos, recibido_at FROM webhooks WHERE `+where+
				fmt.Sprintf(` ORDER BY recibido_at DESC LIMIT %d OFFSET %d`, in.Por, (in.Pagina-1)*in.Por), args...)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			for rows.Next() {
				var w Webhook
				if err := rows.Scan(&w.ID, &w.Proveedor, &w.Servicio, &w.Tipo, &w.Respuesta, &w.Intentos, &w.RecibidoAt); err != nil {
					return nil, err
				}
				w.Estado = "procesado"
				if w.Respuesta >= 300 {
					w.Estado = "error"
				}
				o.Body.Items = append(o.Body.Items, w)
			}
			return o, rows.Err()
		})

	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type expIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Tipo string `json:"tipo" enum:"completa"`
		}
	}
	type expOut struct{ Body Exportacion }
	huma.Register(api, huma.Operation{OperationID: "sistema-exportar", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/exportaciones", Summary: "Solicitar la exportación completa (ZIP, Root)", Tags: tagAudit, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *expIn) (*expOut, error) {
			p, err := auth.RequireRoot(ctx)
			if err != nil {
				return nil, err
			}
			var curso int
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM exportaciones WHERE competition_id = $1 AND estado = 'en_curso' AND created_at > now() - interval '10 minutes'`, in.CID).Scan(&curso)
			if curso > 0 {
				return nil, problem.Conflict("EXPORTACION_EN_CURSO", "Ya hay una exportación en curso.")
			}
			id := uuid.Must(uuid.NewV7())
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO exportaciones (id, competition_id, tipo, pedida_por) VALUES ($1,$2,'completa',$3)`, id, in.CID, p.UserID); err != nil {
				return nil, err
			}
			go s.exportar(context.WithoutCancel(ctx), in.CID, id)
			e, err := s.exportacion(ctx, in.CID, id)
			return &expOut{Body: e}, err
		})

	type listOut struct{ Body []Exportacion }
	huma.Register(api, huma.Operation{OperationID: "sistema-exportaciones", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/exportaciones", Summary: "Últimas exportaciones (Root)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *cidIn) (*listOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id FROM exportaciones WHERE competition_id = $1 ORDER BY created_at DESC LIMIT 5`, in.CID)
			if err != nil {
				return nil, err
			}
			ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			if err != nil {
				return nil, err
			}
			o := &listOut{Body: []Exportacion{}}
			for _, id := range ids {
				e, err := s.exportacion(ctx, in.CID, id)
				if err != nil {
					return nil, err
				}
				o.Body = append(o.Body, e)
			}
			return o, nil
		})

	type oneIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "sistema-exportacion", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/exportaciones/{id}", Summary: "Estado de una exportación (Root)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *oneIn) (*expOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			e, err := s.exportacion(ctx, in.CID, in.ID)
			return &expOut{Body: e}, err
		})

	type zipOut struct {
		ContentType        string `header:"Content-Type"`
		ContentDisposition string `header:"Content-Disposition"`
		Body               []byte
	}
	huma.Register(api, huma.Operation{OperationID: "sistema-exportacion-descarga", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/exportaciones/{id}/descarga", Summary: "Descargar el ZIP (Root, 24 h)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *oneIn) (*zipOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			var b []byte
			err := s.a.DB.QueryRow(ctx, `SELECT archivo FROM exportaciones WHERE competition_id = $1 AND id = $2 AND estado = 'lista' AND expira_at > now()`, in.CID, in.ID).Scan(&b)
			if err != nil {
				return nil, problem.NotFound("La exportación no existe o ha caducado.")
			}
			return &zipOut{ContentType: "application/zip", ContentDisposition: `attachment; filename="exportacion-` + time.Now().Format("2006-01-02") + `.zip"`, Body: b}, nil
		})
}

func (s *Svc) exportacion(ctx context.Context, cid, id uuid.UUID) (Exportacion, error) {
	var e Exportacion
	err := s.a.DB.QueryRow(ctx, `SELECT id, tipo, estado, bytes, error, created_at, terminada_at, expira_at FROM exportaciones WHERE competition_id = $1 AND id = $2`, cid, id).
		Scan(&e.ID, &e.Tipo, &e.Estado, &e.Bytes, &e.Error, &e.CreatedAt, &e.TerminadaAt, &e.ExpiraAt)
	if err != nil {
		return e, problem.NotFound("Exportación no encontrada.")
	}
	if e.Estado == "lista" && e.ExpiraAt != nil && e.ExpiraAt.After(time.Now()) {
		e.URL = "/api/admin/competiciones/" + cid.String() + "/exportaciones/" + id.String() + "/descarga"
	}
	return e, nil
}

// exportTablas: what the ZIP holds. The audit log is the history of every domain fact of the competition.
var exportTablas = []struct{ nombre, sql string }{
	{"auditoria.csv", `SELECT id::text, occurred_at::text, tipo, source, subject, actor_nombre, actor_origen, datos::text FROM auditoria WHERE competition_id = $1 ORDER BY occurred_at`},
	{"notificaciones.csv", `SELECT id::text, created_at::text, nivel, titulo, cuerpo, enlace FROM notificaciones WHERE competition_id = $1 ORDER BY created_at`},
	{"kpis.csv", `SELECT clave, valor::text, updated_at::text FROM kpis WHERE competition_id = $1 ORDER BY clave`},
	{"kpi_serie.csv", `SELECT clave, dia::text, valor::text FROM kpi_serie WHERE competition_id = $1 ORDER BY clave, dia`},
	{"webhooks.csv", `SELECT clave, proveedor, servicio, tipo, respuesta::text, intentos::text, recibido_at::text FROM webhooks WHERE competition_id = $1 ORDER BY recibido_at`},
}

func (s *Svc) exportar(ctx context.Context, cid, id uuid.UUID) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	b, err := s.zip(ctx, cid)
	if err != nil {
		s.a.Log.Error("exportación", "competicion", cid, "err", err)
		_, _ = s.a.DB.Exec(ctx, `UPDATE exportaciones SET estado = 'error', error = $2, terminada_at = now() WHERE id = $1`, id, "No se pudo generar la exportación.")
		return
	}
	_, _ = s.a.DB.Exec(ctx, `UPDATE exportaciones SET estado = 'lista', archivo = $2, bytes = $3, terminada_at = now(), expira_at = now() + interval '24 hours' WHERE id = $1`, id, b, len(b))
	_, _ = s.a.DB.Exec(ctx, `UPDATE exportaciones SET archivo = NULL WHERE expira_at < now() AND archivo IS NOT NULL`)
	_ = events.Publish(ctx, s.a.Redis, s.a.Stream(), events.New(ctx, "exportacion.lista", map[string]any{"id": id, "bytes": len(b)}, events.Competition(cid.String()), events.ForPermission("integraciones.config")))
}

func (s *Svc) zip(ctx context.Context, cid uuid.UUID) ([]byte, error) {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for _, t := range exportTablas {
		w, err := z.Create(t.nombre)
		if err != nil {
			return nil, err
		}
		rows, err := s.a.DB.Query(ctx, t.sql, cid)
		if err != nil {
			return nil, err
		}
		cw := csv.NewWriter(w)
		cols := []string{}
		for _, f := range rows.FieldDescriptions() {
			cols = append(cols, f.Name)
		}
		_ = cw.Write(cols)
		for rows.Next() {
			vals, err := rows.Values()
			if err != nil {
				rows.Close()
				return nil, err
			}
			rec := make([]string, len(vals))
			for i, v := range vals {
				if v != nil {
					rec[i] = strings.TrimSpace(fmt.Sprint(v))
				}
			}
			_ = cw.Write(rec)
		}
		rows.Close()
		cw.Flush()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
