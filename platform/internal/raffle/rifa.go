package raffle

// Rifa · escaparate (D-RIFA, Figma 07 and 60): the objects raffled at the venue and the cash ticket info. Public read,
// backoffice CRUD with sorteo.gestionar; every change emits rifa.items_actualizados / rifa.config_actualizada (outbox).

import (
	"context"
	"encoding/json"
	"errors"
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

var tagRifa = []string{"Rifa"}

// RifaConfig is the cash ticket info shown in the hero of /sorteo.
type RifaConfig struct {
	PrecioBoletoEfectivoCents int        `json:"precioBoletoEfectivoCents" minimum:"0" maximum:"100000"`
	Moneda                    string     `json:"moneda" readOnly:"true"`
	TextoInfo                 string     `json:"textoInfo" maxLength:"600"`
	Lugar                     string     `json:"lugar" maxLength:"160"`
	Horario                   string     `json:"horario" maxLength:"160"`
	FechaSorteo               *time.Time `json:"fechaSorteo,omitempty"`
	Visible                   bool       `json:"visible"`
	ItemsVisibles             int        `json:"itemsVisibles" readOnly:"true"`
	Version                   int        `json:"version" readOnly:"true"`
	UpdatedAt                 time.Time  `json:"updatedAt" readOnly:"true"`
}

// RifaGanador is the winning ticket of an object.
type RifaGanador struct {
	Boleto string `json:"boleto"`
	Nombre string `json:"nombre,omitempty"`
}

// RifaItem is one raffled object (Figma «Tarjeta item rifa»).
type RifaItem struct {
	ID                 uuid.UUID    `json:"id"`
	Nombre             string       `json:"nombre"`
	Descripcion        string       `json:"descripcion"`
	ImagenURL          *string      `json:"imagenUrl"`
	ValorEstimadoCents *int         `json:"valorEstimadoCents"`
	Donante            *string      `json:"donante"`
	Unidades           int          `json:"unidades"`
	Orden              int          `json:"orden"`
	Ganador            *RifaGanador `json:"ganador"`
	Visible            *bool        `json:"visible,omitempty" doc:"Solo en el backoffice"`
	Version            int          `json:"version,omitempty" doc:"Solo en el backoffice (If-Match)"`
}

// RifaItemIn is what the backoffice sends to create or replace an object.
type RifaItemIn struct {
	Nombre             string  `json:"nombre" minLength:"1" maxLength:"80"`
	Descripcion        string  `json:"descripcion,omitempty" maxLength:"400"`
	ImagenURL          *string `json:"imagenUrl,omitempty" maxLength:"500"`
	ValorEstimadoCents *int    `json:"valorEstimadoCents,omitempty" minimum:"0"`
	Donante            *string `json:"donante,omitempty" maxLength:"120"`
	Unidades           int     `json:"unidades" minimum:"1" maximum:"999"`
	Visible            bool    `json:"visible"`
}

type rifaListOut struct{ Body *rifaItems }

type rifaItems struct {
	Items []RifaItem `json:"items"`
	Total int        `json:"total"`
}

func (s *Svc) rifaConfig(ctx context.Context, q rowQ, cid uuid.UUID) (RifaConfig, error) {
	c := RifaConfig{Moneda: "EUR", PrecioBoletoEfectivoCents: 200, Visible: true}
	err := q.QueryRow(ctx, `SELECT precio_boleto_efectivo_cents, texto_info, lugar, horario, fecha_sorteo, visible, version, updated_at,
		(SELECT count(*) FROM rifa_items WHERE competition_id = $1 AND visible) FROM rifa_config WHERE competition_id = $1`, cid).
		Scan(&c.PrecioBoletoEfectivoCents, &c.TextoInfo, &c.Lugar, &c.Horario, &c.FechaSorteo, &c.Visible, &c.Version, &c.UpdatedAt, &c.ItemsVisibles)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, nil
	}
	return c, err
}

func (s *Svc) rifaItems(ctx context.Context, cid uuid.UUID, admin bool) ([]RifaItem, error) {
	sql := `SELECT id, nombre, descripcion, imagen_url, valor_estimado_cents, donante, unidades, orden, visible, ganador_boleto, ganador_nombre, version
		FROM rifa_items WHERE competition_id = $1`
	if !admin {
		sql += ` AND visible`
	}
	rows, err := s.a.DB.Query(ctx, sql+` ORDER BY orden, created_at`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RifaItem{}
	for rows.Next() {
		var it RifaItem
		var vis bool
		var gb, gn *string
		if err := rows.Scan(&it.ID, &it.Nombre, &it.Descripcion, &it.ImagenURL, &it.ValorEstimadoCents, &it.Donante, &it.Unidades, &it.Orden, &vis, &gb, &gn, &it.Version); err != nil {
			return nil, err
		}
		if gb != nil {
			it.Ganador = &RifaGanador{Boleto: *gb}
			if gn != nil {
				it.Ganador.Nombre = *gn
			}
		}
		if admin {
			it.Visible = &vis
		} else {
			it.Version = 0
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// itemsCambiados queues rifa.items_actualizados with the public list (read inside the same transaction).
func (s *Svc) itemsCambiados(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	rows, err := tx.Query(ctx, `SELECT id, nombre, descripcion, imagen_url, valor_estimado_cents, donante, unidades, orden, ganador_boleto, ganador_nombre
		FROM rifa_items WHERE competition_id = $1 AND visible ORDER BY orden, created_at`, cid)
	if err != nil {
		return err
	}
	items := []RifaItem{}
	for rows.Next() {
		var it RifaItem
		var gb, gn *string
		if err := rows.Scan(&it.ID, &it.Nombre, &it.Descripcion, &it.ImagenURL, &it.ValorEstimadoCents, &it.Donante, &it.Unidades, &it.Orden, &gb, &gn); err != nil {
			rows.Close()
			return err
		}
		if gb != nil {
			it.Ganador = &RifaGanador{Boleto: *gb}
			if gn != nil {
				it.Ganador.Nombre = *gn
			}
		}
		items = append(items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "rifa.items_actualizados", map[string]any{"items": items},
		events.Competition(cid.String()), events.Audience(events.Public), events.Subject("rifa")))
}

func limpio(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func validarItem(b *RifaItemIn) error {
	b.Nombre = strings.TrimSpace(b.Nombre)
	b.Descripcion = strings.TrimSpace(b.Descripcion)
	b.ImagenURL, b.Donante = limpio(b.ImagenURL), limpio(b.Donante)
	if b.Nombre == "" {
		return problem.Unprocessable("FALTA_NOMBRE", "Indica el nombre del objeto.")
	}
	if u := b.ImagenURL; u != nil && !strings.HasPrefix(*u, "https://") && !strings.HasPrefix(*u, "/") {
		return problem.Unprocessable("IMAGEN_NO_VALIDA", "La imagen debe ser un enlace https.")
	}
	if b.Unidades < 1 {
		b.Unidades = 1
	}
	return nil
}

func etagOK(ifMatch string, version int) bool {
	return strings.Trim(ifMatch, `"W/`) == fmt.Sprint(version)
}

// writeProblem answers from a huma middleware (before huma validates the request).
func writeProblem(hc huma.Context, p *problem.Error) {
	hc.SetHeader("Content-Type", "application/problem+json")
	hc.SetStatus(p.Status)
	_ = json.NewEncoder(hc.BodyWriter()).Encode(p)
}

// autenticado rejects anonymous callers with 401 before the body is validated.
func autenticado(hc huma.Context, next func(huma.Context)) {
	if _, err := auth.User(hc.Context()); err != nil {
		var pe *problem.Error
		if !errors.As(err, &pe) {
			pe = problem.Unauthorized("NO_AUTENTICADO", "Inicia sesión para continuar.")
		}
		writeProblem(hc, pe)
		return
	}
	next(hc)
}

// faltaIfMatch is 428 when the optimistic-lock header is missing.
func faltaIfMatch(v string) error {
	if strings.TrimSpace(v) == "" {
		return problem.New(http.StatusPreconditionRequired, "FALTA_IF_MATCH", "Falta la cabecera If-Match con la versión que editas.")
	}
	return nil
}

func (s *Svc) registerRifa() {
	api := s.a.API

	// ---- public ----
	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type cfgPub struct {
		CacheControl string `header:"Cache-Control"`
		ETag         string `header:"ETag"`
		Body         *RifaConfig
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-publica", Method: http.MethodGet, Path: "/api/competiciones/{slug}/rifa", Summary: "Rifa presencial: precio del boleto en efectivo, lugar y horario", Tags: tagRifa},
		func(ctx context.Context, in *slugIn) (*cfgPub, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			cfg, err := s.rifaConfig(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			if !cfg.Visible {
				return nil, problem.New(http.StatusNotFound, "RIFA_NO_PUBLICADA", "La rifa todavía no está publicada.")
			}
			return &cfgPub{CacheControl: "public, max-age=30", ETag: fmt.Sprintf(`"%d-%d"`, cfg.Version, cfg.ItemsVisibles), Body: &cfg}, nil
		})
	type itemsPub struct {
		CacheControl string `header:"Cache-Control"`
		Body         *rifaItems
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-items", Method: http.MethodGet, Path: "/api/competiciones/{slug}/rifa/items", Summary: "Objetos que se rifan (visibles, por orden)", Tags: tagRifa},
		func(ctx context.Context, in *slugIn) (*itemsPub, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			cfg, err := s.rifaConfig(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			if !cfg.Visible {
				return nil, problem.New(http.StatusNotFound, "RIFA_NO_PUBLICADA", "La rifa todavía no está publicada.")
			}
			it, err := s.rifaItems(ctx, c.ID, false)
			if err != nil {
				return nil, err
			}
			return &itemsPub{CacheControl: "public, max-age=30", Body: &rifaItems{Items: it, Total: len(it)}}, nil
		})

	// ---- backoffice ----
	base := "/api/admin/competiciones/{cid}/rifa"
	adminMw := huma.Middlewares{autenticado}
	gestionar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := auth.Require(ctx, cid.String(), "sorteo.gestionar")
		return err
	}
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type cfgOut struct {
		ETag string `header:"ETag"`
		Body *RifaConfig
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-config", Method: http.MethodGet, Path: base + "/config", Summary: "Configuración de la rifa presencial", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *cidIn) (*cfgOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			c, err := s.rifaConfig(ctx, s.a.DB, in.CID)
			return &cfgOut{ETag: fmt.Sprintf(`"%d"`, c.Version), Body: &c}, err
		})
	type cfgIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    RifaConfig
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-config-guardar", Method: http.MethodPut, Path: base + "/config", Summary: "Guardar precio del boleto, lugar, horario y visibilidad", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *cfgIn) (*cfgOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			if err := faltaIfMatch(in.IfMatch); err != nil {
				return nil, err
			}
			b := in.Body
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO rifa_config (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, in.CID); err != nil {
					return err
				}
				var v int
				if err := tx.QueryRow(ctx, `SELECT version FROM rifa_config WHERE competition_id = $1 FOR UPDATE`, in.CID).Scan(&v); err != nil {
					return err
				}
				if !etagOK(in.IfMatch, v) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración. Recarga la página.")
				}
				if _, err := tx.Exec(ctx, `UPDATE rifa_config SET precio_boleto_efectivo_cents=$2, texto_info=$3, lugar=$4, horario=$5, fecha_sorteo=$6, visible=$7,
					version = version + 1, updated_por=$8, updated_at = now() WHERE competition_id = $1`,
					in.CID, b.PrecioBoletoEfectivoCents, strings.TrimSpace(b.TextoInfo), strings.TrimSpace(b.Lugar), strings.TrimSpace(b.Horario), b.FechaSorteo, b.Visible, actor(ctx)); err != nil {
					return err
				}
				c, err := s.rifaConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "rifa.config_actualizada", c, events.Competition(in.CID.String()), events.Audience(events.Public), events.Subject("rifa")))
			})
			if err != nil {
				return nil, err
			}
			c, err := s.rifaConfig(ctx, s.a.DB, in.CID)
			return &cfgOut{ETag: fmt.Sprintf(`"%d"`, c.Version), Body: &c}, err
		})

	huma.Register(api, huma.Operation{OperationID: "rifa-items-admin", Method: http.MethodGet, Path: base + "/items", Summary: "Todos los objetos (también los ocultos)", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *cidIn) (*rifaListOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			it, err := s.rifaItems(ctx, in.CID, true)
			if err != nil {
				return nil, err
			}
			return &rifaListOut{Body: &rifaItems{Items: it, Total: len(it)}}, nil
		})

	type crearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body RifaItemIn
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-item-crear", Method: http.MethodPost, Path: base + "/items", Summary: "Añadir un objeto (al final)", Tags: tagRifa, Security: bearer, DefaultStatus: http.StatusCreated, Middlewares: adminMw},
		func(ctx context.Context, in *crearIn) (*rifaListOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if err := validarItem(&b); err != nil {
				return nil, err
			}
			return s.cambioItems(ctx, in.CID, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `INSERT INTO rifa_items (id, competition_id, nombre, descripcion, imagen_url, valor_estimado_cents, donante, unidades, visible, orden)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT coalesce(max(orden), 0) + 1 FROM rifa_items WHERE competition_id = $2))`,
					newID(), in.CID, b.Nombre, b.Descripcion, b.ImagenURL, b.ValorEstimadoCents, b.Donante, b.Unidades, b.Visible)
				return err
			})
		})

	type editarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    RifaItemIn
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-item-editar", Method: http.MethodPatch, Path: base + "/items/{id}", Summary: "Editar un objeto (reemplaza los campos editables)", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *editarIn) (*rifaListOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			if err := faltaIfMatch(in.IfMatch); err != nil {
				return nil, err
			}
			b := in.Body
			if err := validarItem(&b); err != nil {
				return nil, err
			}
			return s.cambioItems(ctx, in.CID, func(tx pgx.Tx) error {
				if err := s.versionItem(ctx, tx, in.CID, in.ID, in.IfMatch); err != nil {
					return err
				}
				_, err := tx.Exec(ctx, `UPDATE rifa_items SET nombre=$3, descripcion=$4, imagen_url=$5, valor_estimado_cents=$6, donante=$7, unidades=$8, visible=$9,
					version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`,
					in.CID, in.ID, b.Nombre, b.Descripcion, b.ImagenURL, b.ValorEstimadoCents, b.Donante, b.Unidades, b.Visible)
				return err
			})
		})

	type borrarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-item-borrar", Method: http.MethodDelete, Path: base + "/items/{id}", Summary: "Quitar un objeto", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *borrarIn) (*rifaListOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			if err := faltaIfMatch(in.IfMatch); err != nil {
				return nil, err
			}
			return s.cambioItems(ctx, in.CID, func(tx pgx.Tx) error {
				if err := s.versionItem(ctx, tx, in.CID, in.ID, in.IfMatch); err != nil {
					return err
				}
				_, err := tx.Exec(ctx, `DELETE FROM rifa_items WHERE competition_id = $1 AND id = $2`, in.CID, in.ID)
				return err
			})
		})

	type ordenIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs []uuid.UUID `json:"ids" maxItems:"500" doc:"Todos los objetos en el orden nuevo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-items-orden", Method: http.MethodPut, Path: base + "/items/orden", Summary: "Reordenar los objetos", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *ordenIn) (*rifaListOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			return s.cambioItems(ctx, in.CID, func(tx pgx.Tx) error {
				// The list must be an exact permutation of every object of the competition.
				var total int
				if err := tx.QueryRow(ctx, `SELECT count(*) FROM (SELECT 1 FROM rifa_items WHERE competition_id = $1 FOR UPDATE) t`, in.CID).Scan(&total); err != nil {
					return err
				}
				vistos := map[uuid.UUID]bool{}
				for _, id := range in.Body.IDs {
					vistos[id] = true
				}
				var validos int
				if err := tx.QueryRow(ctx, `SELECT count(*) FROM rifa_items WHERE competition_id = $1 AND id = ANY($2)`, in.CID, in.Body.IDs).Scan(&validos); err != nil {
					return err
				}
				if len(vistos) != len(in.Body.IDs) || len(in.Body.IDs) != total || validos != total {
					return problem.Unprocessable("ORDEN_NO_VALIDO", "Envía todos los objetos una sola vez, en el orden nuevo.")
				}
				for i, id := range in.Body.IDs {
					if _, err := tx.Exec(ctx, `UPDATE rifa_items SET orden = $3, updated_at = now() WHERE competition_id = $1 AND id = $2`, in.CID, id, i+1); err != nil {
						return err
					}
				}
				return nil
			})
		})

	type ganadorIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Boleto string `json:"boleto" maxLength:"20" doc:"Vacío para quitar el ganador"`
			Nombre string `json:"nombre,omitempty" maxLength:"80" doc:"Se publica como «Nombre I.»"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "rifa-item-ganador", Method: http.MethodPost, Path: base + "/items/{id}/ganador", Summary: "Publicar (o quitar) el boleto ganador de un objeto", Tags: tagRifa, Security: bearer, Middlewares: adminMw},
		func(ctx context.Context, in *ganadorIn) (*rifaListOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			bol := strings.TrimSpace(in.Body.Boleto)
			var boleto, nombre *string
			if bol != "" {
				boleto = &bol
				if n := strings.TrimSpace(in.Body.Nombre); n != "" {
					np := nombrePublico(n)
					nombre = &np
				}
			}
			return s.cambioItems(ctx, in.CID, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE rifa_items SET ganador_boleto=$3, ganador_nombre=$4, ganador_at = CASE WHEN $3::text IS NULL THEN NULL ELSE now() END,
					version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, boleto, nombre)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("Objeto no encontrado.")
				}
				return err
			})
		})
}

func (s *Svc) versionItem(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, ifMatch string) error {
	var v int
	err := tx.QueryRow(ctx, `SELECT version FROM rifa_items WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.NotFound("Objeto no encontrado.")
	}
	if err != nil {
		return err
	}
	if !etagOK(ifMatch, v) {
		return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado este objeto. Recarga la página.")
	}
	return nil
}

// cambioItems runs a change and the rifa.items_actualizados event in one transaction and returns the admin list.
func (s *Svc) cambioItems(ctx context.Context, cid uuid.UUID, f func(pgx.Tx) error) (*rifaListOut, error) {
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err := f(tx); err != nil {
			return err
		}
		return s.itemsCambiados(ctx, tx, cid)
	}); err != nil {
		return nil, err
	}
	it, err := s.rifaItems(ctx, cid, true)
	if err != nil {
		return nil, err
	}
	return &rifaListOut{Body: &rifaItems{Items: it, Total: len(it)}}, nil
}
