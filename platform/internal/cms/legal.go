package cms

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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

// TiposLegales are the legal texts of Figma page 54 · «Web · textos legales».
var TiposLegales = []struct{ Tipo, Nombre, Ruta string }{
	{"privacidad", "Política de privacidad", "/privacidad"},
	{"terminos", "Términos y condiciones", "/terminos"},
	{"cookies", "Política de cookies", "/cookies"},
	{"consentimiento", "Consentimiento de datos e imagen", "/consentimiento-datos"},
	{"bases-sorteo", "Bases del sorteo", "/politica-concurso"},
}

type legalRow struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	Tipo        string     `json:"tipo" db:"tipo"`
	Version     string     `json:"version" db:"version"`
	Titulo      string     `json:"titulo" db:"titulo"`
	Contenido   string     `json:"contenido" db:"contenido"`
	Hash        string     `json:"hash" db:"hash"`
	PublicadoAt *time.Time `json:"publicadoAt,omitempty" db:"publicado_at"`
	CreatedAt   time.Time  `json:"createdAt" db:"created_at"`
}

const selLegal = `SELECT id, tipo, version, titulo, contenido, hash, publicado_at, created_at FROM legal`

func hashText(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

func (s *Svc) registerLegal() {
	api := s.a.API
	tags := []string{"Textos legales"}
	base := "/api/admin/competiciones/{cid}/legal"

	type grupo struct {
		Tipo      string     `json:"tipo"`
		Nombre    string     `json:"nombre"`
		Ruta      string     `json:"ruta"`
		Vigente   *legalRow  `json:"vigente,omitempty"`
		Versiones []legalRow `json:"versiones"`
	}
	type listOut struct{ Body []grupo }
	huma.Register(api, huma.Operation{OperationID: "legal-list", Method: http.MethodGet, Path: base, Summary: "Textos legales y sus versiones", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidPath) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selLegal+` WHERE competition_id = $1 ORDER BY tipo, created_at DESC`, in.CID)
			if err != nil {
				return nil, err
			}
			all, err := pgx.CollectRows(rows, pgx.RowToStructByName[legalRow])
			if err != nil {
				return nil, err
			}
			out := &listOut{}
			for _, t := range TiposLegales {
				g := grupo{Tipo: t.Tipo, Nombre: t.Nombre, Ruta: t.Ruta, Versiones: []legalRow{}}
				for i := range all {
					if all[i].Tipo != t.Tipo {
						continue
					}
					g.Versiones = append(g.Versiones, all[i])
					if all[i].PublicadoAt != nil && (g.Vigente == nil || all[i].PublicadoAt.After(*g.Vigente.PublicadoAt)) {
						g.Vigente = &all[i]
					}
				}
				out.Body = append(out.Body, g)
			}
			return out, nil
		})

	type verIn struct {
		Version   string `json:"version" pattern:"^[a-z0-9.-]{1,20}$" doc:"p. ej. 2026-10"`
		Titulo    string `json:"titulo" minLength:"3" maxLength:"140"`
		Contenido string `json:"contenido" minLength:"20" maxLength:"100000" doc:"Markdown"`
	}
	type createIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `path:"tipo" enum:"privacidad,terminos,cookies,consentimiento,bases-sorteo"`
		Body verIn
	}
	type oneOut struct{ Body legalRow }
	huma.Register(api, huma.Operation{OperationID: "legal-create", Method: http.MethodPost, Path: base + "/{tipo}/versiones", Summary: "Nueva versión (borrador)", Tags: tags, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *createIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			id := newID()
			var r legalRow
			err := s.change(ctx, in.CID, "cms.legal_borrador", map[string]any{"tipo": in.Tipo, "version": in.Body.Version}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
					id, in.CID, in.Tipo, in.Body.Version, in.Body.Titulo, in.Body.Contenido, hashText(in.Body.Contenido)); err != nil {
					return dupErr(err)
				}
				var err error
				r, err = oneLegal(ctx, tx, in.CID, id)
				return err
			})
			return &oneOut{Body: r}, err
		})

	type updIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `path:"tipo"`
		ID   uuid.UUID `path:"id"`
		Body verIn
	}
	huma.Register(api, huma.Operation{OperationID: "legal-update", Method: http.MethodPut, Path: base + "/{tipo}/versiones/{id}", Summary: "Editar un borrador (las versiones publicadas no cambian)", Tags: tags, Security: bearer},
		func(ctx context.Context, in *updIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			var r legalRow
			err := s.change(ctx, in.CID, "cms.legal_borrador", map[string]any{"tipo": in.Tipo, "version": in.Body.Version}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE legal SET version=$4, titulo=$5, contenido=$6, hash=$7 WHERE competition_id=$1 AND tipo=$2 AND id=$3 AND publicado_at IS NULL`,
					in.CID, in.Tipo, in.ID, in.Body.Version, in.Body.Titulo, in.Body.Contenido, hashText(in.Body.Contenido))
				if err != nil {
					return dupErr(err)
				}
				if tag.RowsAffected() == 0 {
					return problem.Conflict("VERSION_PUBLICADA", "Una versión publicada no se puede editar: crea una nueva.")
				}
				r, err = oneLegal(ctx, tx, in.CID, in.ID)
				return err
			})
			return &oneOut{Body: r}, err
		})

	type pubIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `path:"tipo"`
		ID   uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "legal-publish", Method: http.MethodPost, Path: base + "/{tipo}/versiones/{id}/publicar", Summary: "Publicar una versión (pasa a estar vigente)", Tags: tags, Security: bearer},
		func(ctx context.Context, in *pubIn) (*oneOut, error) {
			p, err := auth.Require(ctx, in.CID.String(), "web.publicar")
			if err != nil {
				return nil, err
			}
			var by *uuid.UUID
			if p.UserID != uuid.Nil {
				by = &p.UserID
			}
			var r legalRow
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE legal SET publicado_at = now(), publicado_por = $4 WHERE competition_id=$1 AND tipo=$2 AND id=$3 AND publicado_at IS NULL`, in.CID, in.Tipo, in.ID, by)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					return problem.Conflict("VERSION_PUBLICADA", "Esa versión ya está publicada o no existe.")
				}
				if r, err = oneLegal(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				// Public: consents given under an older version must be renewed (crm reacts to it).
				return events.Enqueue(ctx, tx, events.New(ctx, "legal.publicado", map[string]any{"tipo": in.Tipo, "version": r.Version, "hash": r.Hash},
					events.Competition(in.CID.String()), events.Audience(events.Public)))
			})
			if err == nil {
				s.bump(ctx, in.CID)
			}
			return &oneOut{Body: r}, err
		})
}

func oneLegal(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID) (legalRow, error) {
	rows, err := tx.Query(ctx, selLegal+` WHERE competition_id = $1 AND id = $2`, cid, id)
	if err != nil {
		return legalRow{}, err
	}
	return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[legalRow])
}
