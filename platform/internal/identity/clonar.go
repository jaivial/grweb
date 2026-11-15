package identity

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// clonarRoles copies the custom roles and the team of the previous edition (Sistema › Nueva edición, Figma 64):
// every member keeps the role of the same slug in the new competition.
func clonarRoles(ctx context.Context, tx pgx.Tx, desde, hacia uuid.UUID, copiar map[string]bool) error {
	if !copiar["roles"] {
		return nil
	}
	if err := ensureDefaultRoles(ctx, tx, hacia); err != nil {
		return err
	}
	if _, err := db.CopiarFilas(ctx, tx, "roles", desde, hacia, `jsonb_build_object('id', gen_random_uuid(), 'version', 1)`); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id, estado)
		SELECT m.usuario_id, $2, r2.id, m.estado FROM membresias m JOIN roles r ON r.id = m.rol_id JOIN roles r2 ON r2.competition_id = $2 AND r2.slug = r.slug
		WHERE m.competition_id = $1 ON CONFLICT DO NOTHING`, desde, hacia)
	return err
}

// registerMiembros: active members per competition, for the cards of Sistema › Competiciones (only competition).
func (s *Svc) registerMiembros() {
	type out struct{ Body map[string]int }
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-miembros", Method: http.MethodGet, Path: "/internal/competiciones/miembros", Summary: "Miembros activos por competición", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, _ *struct{}) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT competition_id::text, count(*)::int FROM membresias WHERE estado = 'activo' GROUP BY 1`)
			if err != nil {
				return nil, err
			}
			o := &out{Body: map[string]int{}}
			for rows.Next() {
				var k string
				var n int
				if err := rows.Scan(&k, &n); err != nil {
					rows.Close()
					return nil, err
				}
				o.Body[k] = n
			}
			rows.Close()
			return o, rows.Err()
		})
}
