package athletes

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/kpiwin"
)

// registerKPIs exposes the counters of the backoffice home (Figma 52 · Inicio) to audit, computed from the source
// tables so imported history counts too (events only cover what happens after the import). ?periodo filters by
// creation date and adds the previous period and a sparkline (pkg/kpiwin).
func (s *Svc) registerKPIs() {
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-kpis", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/kpis", Summary: "KPIs del Inicio (solo audit)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *kpiwin.In) (*kpiwin.Out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o, err := kpiwin.Compute(ctx, in.Periodo, func(ctx context.Context, desde, hasta time.Time) (map[string]int64, error) {
				var v [3]int64
				err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE estado = 'confirmado'), count(*) FILTER (WHERE estado = 'reserva'),
					count(*) FILTER (WHERE estado = 'baja') FROM atletas WHERE competition_id = $1 AND created_at >= $2 AND created_at < $3`, in.CID, desde, hasta).Scan(&v[0], &v[1], &v[2])
				return map[string]int64{"atletas.confirmados": v[0], "atletas.reserva": v[1], "atletas.bajas": v[2]}, err
			})
			if err != nil {
				return nil, err
			}
			// «/150»: the real places of the competition (inscription total); the sum of alta_cupos only without it.
			if c, err := s.comps.ByID(ctx, in.CID); err == nil {
				plazas := int64(c.Inscripcion.Plazas)
				if plazas <= 0 {
					for _, n := range s.cupos(ctx, s.a.DB, in.CID, c.Inscripcion.Plazas) {
						plazas += int64(n)
					}
				}
				o.Body.Valores["atletas.plazas"] = plazas
			}
			return o, nil
		})
}
