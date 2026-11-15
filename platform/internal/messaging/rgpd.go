package messaging

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// registerRGPD: crm forwards the right to erasure. Pending campaign deliveries to that address are cancelled and
// every trace of it (campaign recipients, the transactional outbox) keeps only the mask.
func (s *Svc) registerRGPD() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Email    string `json:"email,omitempty" maxLength:"254"`
			Telefono string `json:"telefono,omitempty" maxLength:"30"`
		}
	}
	type out struct {
		Body struct {
			Envios int `json:"envios"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-rgpd-supresion", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/rgpd/supresion", Summary: "Derecho de supresión (solo crm)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			dests := []string{}
			if e := strings.ToLower(strings.TrimSpace(in.Body.Email)); e != "" {
				dests = append(dests, e)
			}
			if t := normTelefono(in.Body.Telefono); t != "" {
				dests = append(dests, t)
			}
			if len(dests) == 0 {
				return o, nil
			}
			return o, s.tx(ctx, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE campana_destinatarios d SET estado = CASE WHEN d.estado = 'pendiente' THEN 'cancelado' ELSE d.estado END, destino = d.mascara, nombre = '', baja_url = '', updated_at = now()
					FROM campanas c WHERE c.id = d.campana_id AND c.competition_id = $1 AND (lower(d.destino) = ANY($2) OR d.destino = ANY($2))`, in.CID, dests)
				if err != nil {
					return err
				}
				o.Body.Envios = int(tag.RowsAffected())
				_, err = tx.Exec(ctx, `UPDATE mensajes SET destino = 'suprimido@rgpd.invalid', vars = '{}', updated_at = now() WHERE competition_id = $1 AND destino = ANY($2)`, in.CID, dests)
				return err
			})
		})
}
