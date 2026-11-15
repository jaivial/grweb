package raffle

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/kpiwin"
)

// registerKPIs keeps the internal KPI contract of the backoffice home (Figma 52 · Inicio). D-RIFA: tickets are sold in
// cash at the venue, so there are no online counters any more (zeros keep the dashboard cards stable).
func (s *Svc) registerKPIs() {
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-kpis", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/kpis", Summary: "KPIs del Inicio (solo audit)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *kpiwin.In) (*kpiwin.Out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			return kpiwin.Compute(ctx, in.Periodo, func(context.Context, time.Time, time.Time) (map[string]int64, error) {
				return map[string]int64{"sorteo.boletos": 0, "sorteo.recaudado": 0}, nil
			})
		})
}
