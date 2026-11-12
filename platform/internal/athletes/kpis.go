package athletes

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
			var v [3]int64
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE estado = 'confirmado'), count(*) FILTER (WHERE estado = 'reserva'),
				count(*) FILTER (WHERE estado = 'baja') FROM atletas WHERE competition_id = $1`, in.CID).Scan(&v[0], &v[1], &v[2]); err != nil {
				return nil, err
			}
			return &out{Body: map[string]int64{"atletas.confirmados": v[0], "atletas.reserva": v[1], "atletas.bajas": v[2]}}, nil
		})
}
