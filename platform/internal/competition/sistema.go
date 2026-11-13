package competition

import (
	"context"
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

// ServiciosAnonimizan are the services that remove personal data on competition.anonimizacion_solicitada.
var ServiciosAnonimizan = []string{"crm", "ticketing", "raffle", "messaging"}

// registerSistema: the irreversible actions of Sistema › Zona peligrosa (Figma 64), Root only and confirmed by
// typing the slug of the competition.
func (s *Svc) registerSistema() {
	api := s.a.API

	type anonIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Confirmacion string     `json:"confirmacion" doc:"El slug de la competición"`
			ProgramarEn  *time.Time `json:"programarEn,omitempty" doc:"Vacío = ahora"`
		}
	}
	type anonOut struct {
		Body struct {
			Estado       string    `json:"estado" enum:"programado,en_curso"`
			AnonimizarAt time.Time `json:"anonimizarAt"`
			Servicios    []string  `json:"servicios"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-anonymize", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/anonimizar", Summary: "Adelantar o programar la anonimización de los datos personales (Root)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *anonIn) (*anonOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			en := time.Now().UTC()
			if in.Body.ProgramarEn != nil && in.Body.ProgramarEn.After(en) {
				en = in.Body.ProgramarEn.UTC()
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				c, err := lockComp(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if in.Body.Confirmacion != c.Slug {
					return problem.Unprocessable("CONFIRMACION", "Escribe el identificador de la competición para confirmar.")
				}
				if c.AnonimizadaAt != nil {
					return problem.Conflict("YA_ANONIMIZADA", "Esta competición ya está anonimizada.")
				}
				if _, err := tx.Exec(ctx, `UPDATE competiciones SET anonimizar_at = $2, updated_at = now(), version = version + 1 WHERE id = $1`, in.CID, en); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.anonimizacion_programada", map[string]any{"slug": c.Slug, "anonimizarAt": en},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config"), events.Subject("competicion:"+in.CID.String())))
			})
			if err != nil {
				return nil, err
			}
			o := &anonOut{}
			o.Body.Estado, o.Body.AnonimizarAt, o.Body.Servicios = "programado", en, ServiciosAnonimizan
			if !en.After(time.Now()) {
				if err := s.applyAnonimizar(ctx); err != nil {
					return nil, err
				}
				o.Body.Estado = "en_curso"
			}
			return o, nil
		})

	type delIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Confirmacion string `json:"confirmacion" doc:"El slug de la competición"`
		}
	}
	type delOut struct {
		Body struct {
			Estado string `json:"estado" enum:"eliminada"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-delete", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}", Summary: "Eliminar una competición archivada y anonimizada (Root)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *delIn) (*delOut, error) {
			p, err := auth.RequireRoot(ctx)
			if err != nil {
				return nil, err
			}
			var slug string
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				c, err := lockComp(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				slug = c.Slug
				if in.Body.Confirmacion != c.Slug {
					return problem.Unprocessable("CONFIRMACION", "Escribe el identificador de la competición para confirmar.")
				}
				if c.ArchivedAt == nil || c.AnonimizadaAt == nil {
					return problem.Conflict("NO_ELIMINABLE", "Solo se pueden eliminar competiciones archivadas y anonimizadas.")
				}
				if _, err := tx.Exec(ctx, `DELETE FROM competiciones WHERE id = $1`, in.CID); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, events.CompeticionEliminada, map[string]any{"slug": c.Slug, "por": p.UserID},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config"), events.Subject("competicion:"+in.CID.String())))
			})
			if err != nil {
				return nil, err
			}
			s.afterChange(ctx, Competicion{Slug: slug})
			o := &delOut{}
			o.Body.Estado = "eliminada"
			return o, nil
		})
}

// applyAnonimizar starts the due anonymisations: marks them done and asks every service holding personal data
// (competition.anonimizacion_solicitada). Replicas coordinate with FOR UPDATE SKIP LOCKED.
func (s *Svc) applyAnonimizar(ctx context.Context) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, slug FROM competiciones WHERE anonimizar_at <= now() AND anonimizada_at IS NULL ORDER BY anonimizar_at LIMIT 5 FOR UPDATE SKIP LOCKED`)
		if err != nil {
			return err
		}
		type due struct {
			id   uuid.UUID
			slug string
		}
		var list []due
		for rows.Next() {
			var d due
			if err := rows.Scan(&d.id, &d.slug); err != nil {
				rows.Close()
				return err
			}
			list = append(list, d)
		}
		rows.Close()
		for _, d := range list {
			if _, err := tx.Exec(ctx, `UPDATE competiciones SET anonimizada_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, d.id); err != nil {
				return err
			}
			if err := events.Enqueue(ctx, tx, events.New(ctx, events.AnonimizacionSolicitada, map[string]any{"slug": d.slug, "servicios": ServiciosAnonimizan},
				events.Competition(d.id.String()), events.ForPermission("integraciones.config"), events.Subject("competicion:"+d.id.String()))); err != nil {
				return err
			}
			s.a.Log.Info("anonimización solicitada", "competicion", d.id)
		}
		return nil
	})
}
