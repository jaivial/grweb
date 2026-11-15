package messaging

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// registerSistema: the email queue for Sistema › Salud and the competition lifecycle (Figma 64).
func (s *Svc) registerSistema() {
	type in struct {
		CID uuid.UUID `path:"cid"`
	}
	type out struct {
		Body struct {
			Pendientes   int `json:"pendientes" doc:"En cola, reintentando o enviándose"`
			EnviadosHora int `json:"enviadosHora"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-cola", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/cola", Summary: "Cola de emails (solo audit)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE estado IN ('en_cola', 'reintentando', 'enviando')), count(*) FILTER (WHERE estado = 'enviado' AND enviado_at > now() - interval '1 hour')
				FROM mensajes WHERE competition_id = $1 AND canal = 'email'`, in.CID).Scan(&o.Body.Pendientes, &o.Body.EnviadosHora)
			return o, err
		})

	// Templates are structure: a new edition may copy them. Sent messages are personal data: anonymised.
	s.a.AlClonar("messaging", func(ctx context.Context, tx pgx.Tx, desde, hacia uuid.UUID, copiar map[string]bool) error {
		if !copiar["plantillas"] {
			return nil
		}
		for _, t := range []string{"plantillas", "plantilla_estado"} {
			if _, err := db.CopiarFilas(ctx, tx, t, desde, hacia, ""); err != nil {
				return err
			}
		}
		return nil
	})
	s.a.AlAnonimizar("messaging", func(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (int64, error) {
		tag, err := tx.Exec(ctx, `UPDATE mensajes SET destino = 'anonimizado', vars = '{}', updated_at = now() WHERE competition_id = $1 AND destino <> 'anonimizado'`, cid)
		if err != nil {
			return 0, err
		}
		dest, err := tx.Exec(ctx, `UPDATE campana_destinatarios d SET destino = d.mascara, nombre = '', baja_url = '' FROM campanas c
			WHERE d.campana_id = c.id AND c.competition_id = $1 AND d.destino <> d.mascara`, cid)
		return tag.RowsAffected() + dest.RowsAffected(), err
	})
}
