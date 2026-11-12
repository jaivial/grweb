package crm

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
			return kpiwin.Compute(ctx, in.Periodo, func(ctx context.Context, desde, hasta time.Time) (map[string]int64, error) {
				var v [2]int64
				err := s.a.DB.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id
					AND k.finalidad = 'novedades_email' AND k.estado = 'confirmado')) FROM contactos c WHERE c.competition_id = $1 AND c.anonimizado_at IS NULL
					AND c.created_at >= $2 AND c.created_at < $3`, in.CID, desde, hasta).Scan(&v[0], &v[1])
				return map[string]int64{"contactos.total": v[0], "contactos.novedades": v[1]}, err
			})
		})
}
