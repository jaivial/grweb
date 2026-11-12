package ticketing

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// registerKPIs exposes the counters of the backoffice home (Figma 52 · Inicio) to audit, computed from the source
// tables so imported history counts too (events only cover what happens after the import).
func (s *Svc) registerKPIs() {
	type out struct{ Body map[string]int64 }
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-kpis", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/kpis", Summary: "KPIs del Inicio (solo audit)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidIn) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			var v [4]int64
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*), COALESCE(sum(personas), 0), count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
				COALESCE(sum(dentro), 0) FROM entradas WHERE competition_id = $1 AND estado <> 'anulada'`, in.CID).Scan(&v[0], &v[1], &v[2], &v[3]); err != nil {
				return nil, err
			}
			return &out{Body: map[string]int64{"entradas.reservas": v[0], "entradas.personas": v[1], "entradas.semana": v[2], "entradas.dentro": v[3]}}, nil
		})
}
