package cms

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Campo describes one editable field of a home section; the backoffice renders the form from it.
type Campo struct {
	Clave    string  `json:"clave"`
	Etiqueta string  `json:"etiqueta"`
	Tipo     string  `json:"tipo" enum:"texto,area,imagen,numero,lista"`
	Ayuda    string  `json:"ayuda,omitempty"`
	Max      int     `json:"max,omitempty"`
	Campos   []Campo `json:"campos,omitempty" doc:"Subcampos de cada elemento (tipo lista)"`
}

// SeccionDef is a home section of Figma page 03 («Secciones Home»).
type SeccionDef struct {
	Clave       string  `json:"clave"`
	Nombre      string  `json:"nombre"`
	Descripcion string  `json:"descripcion"`
	Campos      []Campo `json:"campos"`
}

var (
	cTitulo  = Campo{Clave: "titulo", Etiqueta: "Título", Tipo: "texto", Max: 90}
	cAcento  = Campo{Clave: "tituloAcento", Etiqueta: "Parte del título en rojo", Tipo: "texto", Max: 60}
	cEyebrow = Campo{Clave: "eyebrow", Etiqueta: "Antetítulo", Tipo: "texto", Max: 40}
	cTexto   = Campo{Clave: "texto", Etiqueta: "Texto", Tipo: "area", Max: 600}
	cImagen  = Campo{Clave: "imagen", Etiqueta: "Imagen", Tipo: "imagen"}
)

// Secciones lists the sections the public home can show, in default order.
var Secciones = []SeccionDef{
	{Clave: "hero", Nombre: "Hero", Descripcion: "Intro con la animación del trofeo", Campos: []Campo{cTitulo}},
	{Clave: "campeonato", Nombre: "Campeonato", Descripcion: "Título, nivel, datos y cuenta atrás", Campos: []Campo{cTitulo, {Clave: "subtitulo", Etiqueta: "Subtítulo (nivel)", Tipo: "texto", Max: 120}}},
	{Clave: "inscripciones", Nombre: "Inscripciones", Descripcion: "Estado de la inscripción de la AEP", Campos: []Campo{cTitulo, cTexto, {Clave: "plazas", Etiqueta: "Plazas de atleta", Tipo: "numero"}}},
	{Clave: "entradas", Nombre: "Entradas", Descripcion: "Ven a vivirlo en directo", Campos: []Campo{cEyebrow, cTitulo, cAcento, cTexto,
		{Clave: "puntos", Etiqueta: "Puntos", Tipo: "lista", Max: 4, Campos: []Campo{{Clave: "titulo", Etiqueta: "Título", Tipo: "texto", Max: 60}, {Clave: "texto", Etiqueta: "Texto", Tipo: "texto", Max: 140}}}}},
	{Clave: "atletas", Nombre: "Los atletas", Descripcion: "Editorial con foto", Campos: []Campo{cEyebrow, cTitulo, cAcento, cImagen}},
	{Clave: "dia", Nombre: "El día de la competición", Descripcion: "Editorial con foto", Campos: []Campo{cEyebrow, cTitulo, cAcento, cImagen}},
	{Clave: "premios", Nombre: "Premios", Descripcion: "Premio por movimiento", Campos: []Campo{cEyebrow, cTitulo, cAcento,
		{Clave: "items", Etiqueta: "Premios", Tipo: "lista", Max: 6, Campos: []Campo{{Clave: "titulo", Etiqueta: "Movimiento", Tipo: "texto", Max: 40}, {Clave: "imagen", Etiqueta: "Foto", Tipo: "imagen"}}},
		{Clave: "lema", Etiqueta: "Lema", Tipo: "texto", Max: 80}}},
	{Clave: "organizacion", Nombre: "Organización y equipamiento", Descripcion: "Texto y fotos", Campos: []Campo{cEyebrow, cTitulo, cAcento, cTexto,
		{Clave: "imagenes", Etiqueta: "Fotos", Tipo: "lista", Max: 4, Campos: []Campo{{Clave: "imagen", Etiqueta: "Foto", Tipo: "imagen"}, {Clave: "alt", Etiqueta: "Texto alternativo", Tipo: "texto", Max: 120}}}}},
	{Clave: "cifras", Nombre: "Cifras", Descripcion: "Franja de cifras", Campos: []Campo{
		{Clave: "items", Etiqueta: "Cifras", Tipo: "lista", Max: 4, Campos: []Campo{{Clave: "valor", Etiqueta: "Valor", Tipo: "texto", Max: 12}, {Clave: "etiqueta", Etiqueta: "Etiqueta", Tipo: "texto", Max: 40}}}}},
	{Clave: "patrocinadores", Nombre: "Patrocinadores", Descripcion: "Logos (se gestionan en Patrocinadores)", Campos: []Campo{cTitulo}},
	{Clave: "faq", Nombre: "Preguntas frecuentes", Descripcion: "Muestra las FAQ destacadas", Campos: []Campo{cEyebrow, cTitulo, cTexto}},
	{Clave: "localizacion", Nombre: "Localización", Descripcion: "Sede y cómo llegar (datos del evento)", Campos: []Campo{cEyebrow, cTitulo, cTexto}},
}

func seccionDef(clave string) *SeccionDef {
	for i := range Secciones {
		if Secciones[i].Clave == clave {
			return &Secciones[i]
		}
	}
	return nil
}

type seccionRow struct {
	ID          uuid.UUID       `json:"id" db:"id"`
	Clave       string          `json:"clave" db:"clave"`
	Orden       int             `json:"orden" db:"orden"`
	Visible     bool            `json:"visible" db:"visible"`
	Borrador    json.RawMessage `json:"borrador" db:"borrador"`
	Publicado   json.RawMessage `json:"publicado" db:"publicado"`
	PublicadoAt *time.Time      `json:"publicadoAt,omitempty" db:"publicado_at"`
	Version     int             `json:"version" db:"version"`
	UpdatedAt   time.Time       `json:"updatedAt" db:"updated_at"`
}

type seccionView struct {
	seccionRow
	Nombre      string  `json:"nombre"`
	Descripcion string  `json:"descripcion"`
	Campos      []Campo `json:"campos"`
	Estado      string  `json:"estado" enum:"publicada,cambios,sin_publicar" doc:"Si el borrador difiere de lo publicado"`
}

const selSeccion = `SELECT id, clave, orden, visible, borrador, publicado, publicado_at, version, updated_at FROM secciones`

func view(r seccionRow) seccionView {
	v := seccionView{seccionRow: r}
	if d := seccionDef(r.Clave); d != nil {
		v.Nombre, v.Descripcion, v.Campos = d.Nombre, d.Descripcion, d.Campos
	}
	switch {
	case r.Publicado == nil:
		v.Estado = "sin_publicar"
	case !jsonEqual(r.Borrador, r.Publicado):
		v.Estado = "cambios"
	default:
		v.Estado = "publicada"
	}
	return v
}

func jsonEqual(a, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	ja, _ := json.Marshal(x)
	jb, _ := json.Marshal(y)
	return string(ja) == string(jb)
}

func (s *Svc) seccionesOf(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, cid uuid.UUID) ([]seccionView, error) {
	rows, err := q.Query(ctx, selSeccion+` WHERE competition_id = $1 ORDER BY orden`, cid)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[seccionRow])
	out := make([]seccionView, 0, len(list))
	for _, r := range list {
		out = append(out, view(r))
	}
	return out, err
}

// ensureSecciones creates the missing sections of a competition with empty drafts.
func ensureSecciones(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	for i, d := range Secciones {
		if _, err := tx.Exec(ctx, `INSERT INTO secciones (id, competition_id, clave, orden) VALUES ($1,$2,$3,$4) ON CONFLICT (competition_id, clave) DO NOTHING`, newID(), cid, d.Clave, i+1); err != nil {
			return err
		}
	}
	return nil
}

func (s *Svc) registerSecciones() {
	api := s.a.API
	tags := []string{"Web y contenidos"}
	base := "/api/admin/competiciones/{cid}/web/secciones"

	type listOut struct{ Body []seccionView }
	huma.Register(api, huma.Operation{OperationID: "secciones-list", Method: http.MethodGet, Path: base, Summary: "Secciones de la home (borrador y publicado)", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidPath) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return ensureSecciones(ctx, tx, in.CID) }); err != nil {
				return nil, err
			}
			list, err := s.seccionesOf(ctx, s.a.DB, in.CID)
			return &listOut{Body: list}, err
		})

	type putIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Borrador json.RawMessage `json:"borrador,omitempty" doc:"Contenido (objeto JSON según los campos de la sección)"`
			Visible  *bool           `json:"visible,omitempty"`
		}
	}
	type oneOut struct{ Body seccionView }
	huma.Register(api, huma.Operation{OperationID: "secciones-update", Method: http.MethodPut, Path: base + "/{id}", Summary: "Guardar el borrador o la visibilidad de una sección (autoguardado)", Tags: tags, Security: bearer},
		func(ctx context.Context, in *putIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			if in.Body.Borrador != nil {
				var obj map[string]any
				if json.Unmarshal(in.Body.Borrador, &obj) != nil {
					return nil, problem.Unprocessable("JSON_INVALIDO", "El contenido debe ser un objeto JSON.")
				}
			}
			var out seccionView
			err := s.change(ctx, in.CID, "cms.seccion_actualizada", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE secciones SET borrador = COALESCE($3, borrador), visible = COALESCE($4, visible), updated_at = now() WHERE competition_id = $1 AND id = $2`,
					in.CID, in.ID, nullRaw(in.Body.Borrador), in.Body.Visible)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					return problem.NotFound("Sección no encontrada.")
				}
				rows, err := tx.Query(ctx, selSeccion+` WHERE id = $1`, in.ID)
				if err != nil {
					return err
				}
				r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[seccionRow])
				out = view(r)
				return err
			})
			return &oneOut{Body: out}, err
		})

	huma.Register(api, huma.Operation{OperationID: "secciones-reorder", Method: http.MethodPut, Path: base + "/orden", Summary: "Reordenar las secciones", Tags: tags, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *orderIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "cms.secciones_reordenadas", nil, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `UPDATE secciones t SET orden = o.n FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, n) WHERE t.id = o.id AND t.competition_id = $1`, in.CID, in.Body.IDs)
				return err
			})
		})

	type pubIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Claves []string `json:"claves,omitempty" doc:"Secciones a publicar; vacío = todas las que tienen cambios"`
		}
	}
	type pubOut struct {
		Body struct {
			Publicadas []string `json:"publicadas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "web-publish", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/web/publicar", Summary: "Publicar los borradores de la home", Tags: tags, Security: bearer},
		func(ctx context.Context, in *pubIn) (*pubOut, error) {
			p, err := auth.Require(ctx, in.CID.String(), "web.publicar")
			if err != nil {
				return nil, err
			}
			out := &pubOut{}
			out.Body.Publicadas = []string{}
			var by *uuid.UUID
			if p.UserID != uuid.Nil {
				by = &p.UserID
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				rows, err := tx.Query(ctx, selSeccion+` WHERE competition_id = $1 FOR UPDATE`, in.CID)
				if err != nil {
					return err
				}
				list, err := pgx.CollectRows(rows, pgx.RowToStructByName[seccionRow])
				if err != nil {
					return err
				}
				for _, r := range list {
					want := len(in.Body.Claves) == 0 || contains(in.Body.Claves, r.Clave)
					if !want || (r.Publicado != nil && jsonEqual(r.Borrador, r.Publicado)) {
						continue
					}
					if _, err := tx.Exec(ctx, `UPDATE secciones SET publicado = borrador, publicado_at = now(), version = version + 1 WHERE id = $1`, r.ID); err != nil {
						return err
					}
					if _, err := tx.Exec(ctx, `INSERT INTO secciones_versiones (id, seccion_id, datos, publicado_por) VALUES ($1,$2,$3,$4)`, newID(), r.ID, r.Borrador, by); err != nil {
						return err
					}
					out.Body.Publicadas = append(out.Body.Publicadas, r.Clave)
				}
				if len(out.Body.Publicadas) == 0 {
					return problem.Conflict("SIN_CAMBIOS", "No hay cambios pendientes de publicar.")
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "web.publicada", map[string]any{"secciones": out.Body.Publicadas},
					events.Competition(in.CID.String()), events.Audience(events.Public)))
			})
			if err == nil {
				s.bump(ctx, in.CID)
			}
			return out, err
		})
}

func nullRaw(b json.RawMessage) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
