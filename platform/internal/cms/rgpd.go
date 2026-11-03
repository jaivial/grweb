package cms

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// registerRGPD: crm forwards the right to erasure of a contact; cms deletes the volunteer requests of that address
// (no legal retention applies to them).
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
			Voluntarios int `json:"voluntarios"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-rgpd-supresion", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/rgpd/supresion", Summary: "Derecho de supresión (solo crm)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if e == "" {
				return o, nil
			}
			rows, err := s.a.DB.Query(ctx, `DELETE FROM voluntarios WHERE competition_id = $1 AND email = $2 RETURNING id`, in.CID, e)
			if err != nil {
				return o, err
			}
			ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			for _, id := range ids {
				s.borrarAutorizacion(in.CID, id) // and their guardian's authorisation, if any
			}
			o.Body.Voluntarios = len(ids)
			if len(ids) > 0 {
				s.bump(ctx, in.CID)
			}
			return o, err
		})
}
