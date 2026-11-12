package raffle

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// registerKPIs exposes the counters of the backoffice home (Figma 52 · Inicio) to audit, computed from the source
// tables so imported history counts too (events only cover what happens after the import).
func (s *Svc) registerKPIs() {
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type out struct{ Body map[string]int64 }
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-kpis", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/kpis", Summary: "KPIs del Inicio (solo audit)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidIn) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			var v [2]int64
			if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(sum(cantidad), 0), COALESCE(sum(importe), 0) FROM compras WHERE competition_id = $1 AND estado = 'pagada'`, in.CID).Scan(&v[0], &v[1]); err != nil {
				return nil, err
			}
			return &out{Body: map[string]int64{"sorteo.boletos": v[0], "sorteo.recaudado": v[1]}}, nil
		})
}
