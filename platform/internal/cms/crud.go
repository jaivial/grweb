package cms

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Generic admin CRUD for the simple collections (list · create · update · delete · reorder), with permission,
// audit event and cache invalidation. Each collection supplies its row type R, input type I and the SQL.

type cidPath struct {
	CID uuid.UUID `path:"cid"`
}

type idPath struct {
	CID uuid.UUID `path:"cid"`
	ID  uuid.UUID `path:"id"`
}

type bodyIn[I any] struct {
	CID  uuid.UUID `path:"cid"`
	Body I
}

type bodyIDIn[I any] struct {
	CID  uuid.UUID `path:"cid"`
	ID   uuid.UUID `path:"id"`
	Body I
}

type listOut[R any] struct{ Body []R }
type oneOut[R any] struct{ Body R }

type orderIn struct {
	CID  uuid.UUID `path:"cid"`
	Body struct {
		IDs []uuid.UUID `json:"ids" minItems:"1" doc:"Ids en el nuevo orden"`
	}
}

type collection[R any, I any] struct {
	name     string // operation id and event name, e.g. "faq"
	path     string // full path under the competition, e.g. "/web/faq"
	table    string
	cols     string // SELECT list matching R's db tags
	scope    string // extra WHERE (e.g. "tipo = 'blog'")
	order    string
	tag      string
	perm     string
	noCreate bool
	validate func(in *I) error
	insert   func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *I) error
	update   func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *I) error
}

func (c collection[R, I]) where() string {
	w := "competition_id = $1"
	if c.scope != "" {
		w += " AND " + c.scope
	}
	return w
}

func register[R any, I any](s *Svc, c collection[R, I]) {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}" + c.path
	tags := []string{c.tag}
	one := func(ctx context.Context, q pgx.Tx, cid, id uuid.UUID) (R, error) {
		rows, err := q.Query(ctx, `SELECT `+c.cols+` FROM `+c.table+` WHERE `+c.where()+` AND id = $2`, cid, id)
		if err != nil {
			var z R
			return z, err
		}
		r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[R])
		if err != nil {
			return r, problem.NotFound("No encontrado.")
		}
		return r, nil
	}

	huma.Register(api, huma.Operation{OperationID: c.name + "-list", Method: http.MethodGet, Path: base, Summary: "Listar", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidPath) (*listOut[R], error) {
			if _, err := auth.Require(ctx, in.CID.String(), c.perm); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT `+c.cols+` FROM `+c.table+` WHERE `+c.where()+` ORDER BY `+c.order, in.CID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[R])
			if list == nil {
				list = []R{}
			}
			return &listOut[R]{Body: list}, err
		})

	if !c.noCreate {
		huma.Register(api, huma.Operation{OperationID: c.name + "-create", Method: http.MethodPost, Path: base, Summary: "Crear", Tags: tags, Security: bearer, DefaultStatus: http.StatusCreated},
			func(ctx context.Context, in *bodyIn[I]) (*oneOut[R], error) {
				if _, err := auth.Require(ctx, in.CID.String(), c.perm); err != nil {
					return nil, err
				}
				if c.validate != nil {
					if err := c.validate(&in.Body); err != nil {
						return nil, err
					}
				}
				id := newID()
				var r R
				err := s.change(ctx, in.CID, "cms."+c.name+"_creado", map[string]any{"id": id}, func(tx pgx.Tx) error {
					if err := c.insert(ctx, tx, in.CID, id, &in.Body); err != nil {
						return dupErr(err)
					}
					var err error
					r, err = one(ctx, tx, in.CID, id)
					return err
				})
				return &oneOut[R]{Body: r}, err
			})
	}

	huma.Register(api, huma.Operation{OperationID: c.name + "-update", Method: http.MethodPut, Path: base + "/{id}", Summary: "Guardar", Tags: tags, Security: bearer},
		func(ctx context.Context, in *bodyIDIn[I]) (*oneOut[R], error) {
			if _, err := auth.Require(ctx, in.CID.String(), c.perm); err != nil {
				return nil, err
			}
			if c.validate != nil {
				if err := c.validate(&in.Body); err != nil {
					return nil, err
				}
			}
			var r R
			err := s.change(ctx, in.CID, "cms."+c.name+"_actualizado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				if _, err := one(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				if err := c.update(ctx, tx, in.CID, in.ID, &in.Body); err != nil {
					return dupErr(err)
				}
				var err error
				r, err = one(ctx, tx, in.CID, in.ID)
				return err
			})
			return &oneOut[R]{Body: r}, err
		})

	huma.Register(api, huma.Operation{OperationID: c.name + "-delete", Method: http.MethodDelete, Path: base + "/{id}", Summary: "Borrar", Tags: tags, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idPath) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), c.perm); err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "cms."+c.name+"_eliminado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `DELETE FROM `+c.table+` WHERE `+c.where()+` AND id = $2`, in.CID, in.ID)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("No encontrado.")
				}
				return err
			})
		})

	huma.Register(api, huma.Operation{OperationID: c.name + "-reorder", Method: http.MethodPut, Path: base + "/orden", Summary: "Reordenar", Tags: tags, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *orderIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), c.perm); err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "cms."+c.name+"_reordenado", map[string]any{"total": len(in.Body.IDs)}, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `UPDATE `+c.table+` t SET orden = o.n FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, n) WHERE t.id = o.id AND t.`+c.where(), in.CID, in.Body.IDs)
				return err
			})
		})
}

func dupErr(err error) error {
	if db.IsUniqueViolation(err, "") {
		return problem.Conflict("DUPLICADO", "Ya existe un elemento con ese identificador (ruta, slug o versión).")
	}
	return err
}

func trimAll(ss ...*string) {
	for _, p := range ss {
		*p = strings.TrimSpace(*p)
	}
}
