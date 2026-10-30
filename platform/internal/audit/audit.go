// Package audit stores every domain event (audit log), serves the activity feed and team notifications,
// and keeps the dashboard counters (KPIs) of the backoffice home.
package audit

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Svc struct{ a *app.App }

var (
	tagAudit = []string{"Auditoría y actividad"}
	bearer   = []map[string][]string{{"bearer": {}}}
)

// Service returns the audit service definition.
func Service() app.Service {
	mig, _ := fs.Sub(migrationsFS, "migrations")
	s := &Svc{}
	return app.Service{Name: "audit", Title: "GR Cup · audit", Migrations: mig, NeedsDB: true, NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	c := &events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: "audit", Start: "0", Handle: s.handle, Log: a.Log} // the audit log must include the retained history
	a.Go(c.Run)
	s.register()
	return nil
}

// noAudit are progress or delivery events: they are for live screens and other services, not the activity log.
// Internal events carrying personal data (email requests, contact facts, deliveries) are not kept in the log either.
var noAudit = map[string]bool{"import.progreso": true, "athletes.email_solicitado": true, "cms.email_solicitado": true, "identity.email_solicitado": true,
	"crm.email_solicitado": true, "athletes.contacto": true, "cms.contacto": true, "messaging.enviado": true, "messaging.rebote": true, "mensaje.estado": true}

// handle stores the event, then applies notification and KPI rules (its own events are ignored to avoid loops).
func (s *Svc) handle(ctx context.Context, e events.Event) error {
	if e.Source == "audit" || noAudit[e.Type] {
		return nil
	}
	var cid *uuid.UUID
	if id, err := uuid.Parse(e.CompetitionID); err == nil {
		cid = &id
	}
	var actorID *uuid.UUID
	a := events.Actor{}
	if e.Actor != nil {
		a = *e.Actor
		if id, err := uuid.Parse(a.UserID); err == nil {
			actorID = &id
		}
	}
	data := e.Data
	if len(data) == 0 {
		data = json.RawMessage(`{}`)
	}
	var d map[string]any
	_ = json.Unmarshal(data, &d)
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO auditoria (id, competition_id, tipo, source, subject, audience, permiso, actor_usuario_id, actor_nombre, actor_origen, actor_servicio, datos, diff, request_id, occurred_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
			e.ID, cid, e.Type, e.Source, e.Subject, e.Audience, e.Permission, actorID, a.Name, a.Origin, a.Service, data, nullJSON(e.Diff), e.RequestID, e.OccurredAt)
		if err != nil || tag.RowsAffected() == 0 || cid == nil {
			return err
		}
		if rule, ok := notifRules[e.Type]; ok {
			if titulo, cuerpo, enlace, nivel, permiso, ok := rule(e, d); ok {
				if nivel != "ok" && nivel != "aviso" && nivel != "error" {
					nivel = "info" // a wrong level must not turn the event into a poison message
				}
				nid := uuid.Must(uuid.NewV7())
				if _, err := tx.Exec(ctx, `INSERT INTO notificaciones (id, competition_id, permiso, titulo, cuerpo, enlace, nivel, evento_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (evento_id) DO NOTHING`,
					nid, *cid, permiso, titulo, cuerpo, enlace, nivel, e.ID); err != nil {
					return err
				}
				out := events.New(ctx, "notificacion.nueva", map[string]any{"id": nid, "titulo": titulo, "cuerpo": cuerpo, "enlace": enlace, "nivel": nivel}, events.Competition(cid.String()))
				out.Permission = permiso
				if err := events.Enqueue(ctx, tx, out); err != nil {
					return err
				}
			}
		}
		if rule, ok := kpiRules[e.Type]; ok {
			deltas := rule(d)
			for k, v := range deltas {
				if _, err := tx.Exec(ctx, `INSERT INTO kpis (competition_id, clave, valor) VALUES ($1,$2,$3) ON CONFLICT (competition_id, clave) DO UPDATE SET valor = kpis.valor + EXCLUDED.valor, updated_at = now()`, *cid, k, v); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO kpi_serie (competition_id, clave, dia, valor) VALUES ($1,$2,($4 AT TIME ZONE 'Europe/Madrid')::date,$3)
					ON CONFLICT (competition_id, clave, dia) DO UPDATE SET valor = kpi_serie.valor + EXCLUDED.valor`, *cid, k, v, e.OccurredAt); err != nil {
					return err
				}
			}
			if len(deltas) > 0 {
				if err := events.Enqueue(ctx, tx, events.New(ctx, "kpi.delta", deltas, events.Competition(cid.String()))); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func nullJSON(b json.RawMessage) any {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	return b
}

// ---- read API ----

type entrada struct {
	ID          uuid.UUID       `json:"id" db:"id"`
	Tipo        string          `json:"tipo" db:"tipo"`
	Source      string          `json:"servicio" db:"source"`
	Subject     string          `json:"entidad" db:"subject"`
	ActorID     *uuid.UUID      `json:"actorId,omitempty" db:"actor_usuario_id"`
	ActorNombre string          `json:"actor" db:"actor_nombre"`
	Origen      string          `json:"origen" db:"actor_origen"`
	Datos       json.RawMessage `json:"datos" db:"datos"`
	Diff        json.RawMessage `json:"diff,omitempty" db:"diff"`
	RequestID   string          `json:"requestId" db:"request_id"`
	OccurredAt  time.Time       `json:"fecha" db:"occurred_at"`
	Audience    string          `json:"-" db:"audience"`
	Permiso     string          `json:"-" db:"permiso"`
}

const selEntrada = `SELECT id, tipo, source, subject, actor_usuario_id, actor_nombre, actor_origen, datos, diff, request_id, occurred_at, audience, permiso FROM auditoria`

type actividad struct {
	ID      uuid.UUID `json:"id"`
	Tipo    string    `json:"tipo"`
	Actor   string    `json:"actor"`
	Origen  string    `json:"origen"`
	Resumen string    `json:"resumen"`
	Entidad string    `json:"entidad"`
	Fecha   time.Time `json:"fecha"`
}

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

func encodeCursor(t time.Time, id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(t.UTC().Format(time.RFC3339Nano) + "|" + id.String()))
}

func decodeCursor(c string) (time.Time, uuid.UUID, bool) {
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return time.Time{}, uuid.Nil, false
	}
	ts, idStr, ok := strings.Cut(string(b), "|")
	t, err1 := time.Parse(time.RFC3339Nano, ts)
	id, err2 := uuid.Parse(idStr)
	return t, id, ok && err1 == nil && err2 == nil
}

func (s *Svc) register() {
	api := s.a.API

	type listIn struct {
		CID     uuid.UUID `path:"cid"`
		Usuario string    `query:"usuario" doc:"Id del usuario que hizo el cambio"`
		Tipo    string    `query:"tipo" doc:"Prefijo del tipo de evento (p. ej. identity.)"`
		Origen  string    `query:"origen" enum:"web,cli,mcp,token,"`
		Desde   string    `query:"desde" format:"date-time"`
		Hasta   string    `query:"hasta" format:"date-time"`
		Cursor  string    `query:"cursor"`
		Limite  int       `query:"limite" minimum:"1" maximum:"200" default:"50"`
	}
	type listOut struct {
		Body struct {
			Items     []entrada `json:"items"`
			Siguiente string    `json:"siguiente,omitempty" doc:"Cursor de la página siguiente"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "audit-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/auditoria", Summary: "Registro de auditoría (con diff y origen)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *listIn) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "auditoria.ver"); err != nil {
				return nil, err
			}
			where := []string{"competition_id = $1"}
			args := []any{in.CID}
			add := func(cond string, v any) {
				args = append(args, v)
				where = append(where, strings.ReplaceAll(cond, "?", "$"+itoa(len(args))))
			}
			if in.Usuario != "" {
				id, err := uuid.Parse(in.Usuario)
				if err != nil {
					return nil, problem.Unprocessable("USUARIO_INVALIDO", "Id de usuario no válido.")
				}
				add("actor_usuario_id = ?", id)
			}
			if in.Tipo != "" {
				add("tipo LIKE ?", in.Tipo+"%")
			}
			if in.Origen == "token" {
				where = append(where, "actor_origen LIKE 'token:%'")
			} else if in.Origen != "" {
				add("actor_origen = ?", in.Origen)
			}
			if in.Desde != "" {
				add("occurred_at >= ?::timestamptz", in.Desde)
			}
			if in.Hasta != "" {
				add("occurred_at < ?::timestamptz", in.Hasta)
			}
			if in.Cursor != "" {
				t, id, ok := decodeCursor(in.Cursor)
				if !ok {
					return nil, problem.BadRequest("CURSOR_INVALIDO", "Cursor no válido.")
				}
				args = append(args, t, id)
				where = append(where, "(occurred_at, id) < ($"+itoa(len(args)-1)+", $"+itoa(len(args))+")")
			}
			args = append(args, in.Limite+1)
			rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE `+strings.Join(where, " AND ")+` ORDER BY occurred_at DESC, id DESC LIMIT $`+itoa(len(args)), args...)
			if err != nil {
				return nil, err
			}
			items, err := pgx.CollectRows(rows, pgx.RowToStructByName[entrada])
			if err != nil {
				return nil, err
			}
			out := &listOut{}
			if len(items) > in.Limite {
				items = items[:in.Limite]
				last := items[len(items)-1]
				out.Body.Siguiente = encodeCursor(last.OccurredAt, last.ID)
			}
			out.Body.Items = items
			return out, nil
		})

	type oneIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type oneOut struct{ Body entrada }
	huma.Register(api, huma.Operation{OperationID: "audit-get", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/auditoria/{id}", Summary: "Detalle de un evento de auditoría", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *oneIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "auditoria.ver"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE id = $1 AND competition_id = $2`, in.ID, in.CID)
			if err != nil {
				return nil, err
			}
			e, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[entrada])
			if err != nil {
				return nil, problem.NotFound("Evento no encontrado.")
			}
			return &oneOut{Body: e}, nil
		})

	type actIn struct {
		CID    uuid.UUID `path:"cid"`
		Limite int       `query:"limite" minimum:"1" maximum:"100" default:"20"`
	}
	type actOut struct{ Body []actividad }
	huma.Register(api, huma.Operation{OperationID: "activity-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/actividad", Summary: "Actividad reciente que puedo ver (feed del Inicio)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *actIn) (*actOut, error) {
			p, err := auth.RequireMember(ctx, in.CID.String())
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE competition_id = $1 AND audience <> 'internal' ORDER BY occurred_at DESC, id DESC LIMIT 400`, in.CID)
			if err != nil {
				return nil, err
			}
			all, err := pgx.CollectRows(rows, pgx.RowToStructByName[entrada])
			if err != nil {
				return nil, err
			}
			out := &actOut{Body: []actividad{}}
			for _, e := range all {
				if e.Permiso != "" && !p.Can(in.CID.String(), e.Permiso) {
					continue
				}
				actor := e.ActorNombre
				if actor == "" {
					actor = "Sistema"
				}
				out.Body = append(out.Body, actividad{ID: e.ID, Tipo: e.Tipo, Actor: actor, Origen: e.Origen, Resumen: resumen(events.Event{Type: e.Tipo, Data: e.Datos}), Entidad: e.Subject, Fecha: e.OccurredAt})
				if len(out.Body) == in.Limite {
					break
				}
			}
			return out, nil
		})

	type notif struct {
		ID     uuid.UUID `json:"id"`
		Titulo string    `json:"titulo"`
		Cuerpo string    `json:"cuerpo"`
		Enlace string    `json:"enlace"`
		Nivel  string    `json:"nivel"`
		Leida  bool      `json:"leida"`
		Fecha  time.Time `json:"fecha"`
	}
	type notifIn struct {
		CID      uuid.UUID `path:"cid"`
		NoLeidas bool      `query:"noLeidas"`
	}
	type notifOut struct {
		Body struct {
			Items    []notif `json:"items"`
			NoLeidas int     `json:"noLeidas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "notifications-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/notificaciones", Summary: "Mis notificaciones (según mis permisos)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *notifIn) (*notifOut, error) {
			p, err := auth.RequireMember(ctx, in.CID.String())
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT n.id, n.titulo, n.cuerpo, n.enlace, n.nivel, n.permiso, n.created_at, (l.usuario_id IS NOT NULL) AS leida
				FROM notificaciones n LEFT JOIN notificaciones_leidas l ON l.notificacion_id = n.id AND l.usuario_id = $2
				WHERE n.competition_id = $1 ORDER BY n.created_at DESC LIMIT 100`, in.CID, p.UserID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			out := &notifOut{}
			out.Body.Items = []notif{}
			for rows.Next() {
				var n notif
				var permiso string
				if err := rows.Scan(&n.ID, &n.Titulo, &n.Cuerpo, &n.Enlace, &n.Nivel, &permiso, &n.Fecha, &n.Leida); err != nil {
					return nil, err
				}
				if permiso != "" && !p.Can(in.CID.String(), permiso) {
					continue
				}
				if !n.Leida {
					out.Body.NoLeidas++
				}
				if in.NoLeidas && n.Leida {
					continue
				}
				out.Body.Items = append(out.Body.Items, n)
			}
			return out, rows.Err()
		})

	type leerIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs   []uuid.UUID `json:"ids,omitempty"`
			Todas bool        `json:"todas,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "notifications-read", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/notificaciones/leer", Summary: "Marcar notificaciones como leídas", Tags: tagAudit, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *leerIn) (*struct{}, error) {
			p, err := auth.RequireMember(ctx, in.CID.String())
			if err != nil {
				return nil, err
			}
			if in.Body.Todas {
				_, err = s.a.DB.Exec(ctx, `INSERT INTO notificaciones_leidas (notificacion_id, usuario_id) SELECT id, $2 FROM notificaciones WHERE competition_id = $1 ON CONFLICT DO NOTHING`, in.CID, p.UserID)
			} else if len(in.Body.IDs) > 0 {
				_, err = s.a.DB.Exec(ctx, `INSERT INTO notificaciones_leidas (notificacion_id, usuario_id) SELECT id, $2 FROM notificaciones WHERE competition_id = $1 AND id = ANY($3) ON CONFLICT DO NOTHING`, in.CID, p.UserID, in.Body.IDs)
			}
			return nil, err
		})

	type dashIn struct {
		CID  uuid.UUID `path:"cid"`
		Modo string    `query:"modo" enum:"campana,evento" default:"campana"`
	}
	type dashOut struct {
		Body struct {
			Modo string           `json:"modo"`
			KPIs map[string]int64 `json:"kpis"`
			Hora time.Time        `json:"hora"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "dashboard-get", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/dashboard", Summary: "KPIs del Inicio (antes del evento o día del evento)", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *dashIn) (*dashOut, error) {
			if _, err := auth.RequireMember(ctx, in.CID.String()); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT clave, valor FROM kpis WHERE competition_id = $1`, in.CID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			out := &dashOut{}
			out.Body.Modo, out.Body.KPIs, out.Body.Hora = in.Modo, map[string]int64{}, time.Now().UTC()
			for rows.Next() {
				var k string
				var v int64
				if err := rows.Scan(&k, &v); err != nil {
					return nil, err
				}
				out.Body.KPIs[k] = v
			}
			return out, rows.Err()
		})

	type serieIn struct {
		CID     uuid.UUID `path:"cid"`
		Metrica string    `query:"metrica" required:"true"`
		Desde   string    `query:"desde" format:"date"`
	}
	type punto struct {
		Dia   string `json:"dia"`
		Valor int64  `json:"valor"`
	}
	type serieOut struct{ Body []punto }
	huma.Register(api, huma.Operation{OperationID: "dashboard-series", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/dashboard/serie", Summary: "Serie diaria de una métrica", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *serieIn) (*serieOut, error) {
			if _, err := auth.RequireMember(ctx, in.CID.String()); err != nil {
				return nil, err
			}
			desde := in.Desde
			if desde == "" {
				desde = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
			}
			rows, err := s.a.DB.Query(ctx, `SELECT dia::text, valor FROM kpi_serie WHERE competition_id = $1 AND clave = $2 AND dia >= $3::date ORDER BY dia`, in.CID, in.Metrica, desde)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (punto, error) {
				var p punto
				return p, r.Scan(&p.Dia, &p.Valor)
			})
			return &serieOut{Body: list}, err
		})
}

func itoa(i int) string { return strconv.Itoa(i) }
