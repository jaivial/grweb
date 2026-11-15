package fans

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Directo social (admin)"}

// FanAdmin is a row of the backoffice list (C › Directo › Fans).
type FanAdmin struct {
	ID            uuid.UUID  `json:"id"`
	Email         string     `json:"email"`
	Tipo          string     `json:"tipo" enum:"atleta,publico"`
	Alias         string     `json:"alias"`
	AtletaID      uuid.UUID  `json:"atletaId,omitempty"`
	BaneadoHasta  *time.Time `json:"baneadoHasta,omitempty"`
	BaneadoMotivo string     `json:"baneadoMotivo,omitempty"`
	Version       int64      `json:"version"`
	CreatedAt     time.Time  `json:"createdAt"`
}

func (s *Svc) registerAdmin() {
	type emailIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type emailOut struct {
		Body struct {
			Email string `json:"email"`
		}
	}
	// verified email of a fan session: cms ties volunteer/club requests to it (its DB has no fans table).
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-fan-email", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/fans/{id}/email", Summary: "Email verificado de un fan (solo cms)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *emailIn) (*emailOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &emailOut{}
			err := s.a.DB.QueryRow(ctx, `SELECT lower(email::text) FROM fans WHERE id = $1 AND competition_id = $2`, in.ID, in.CID).Scan(&o.Body.Email)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("Fan no encontrado.")
			}
			if err != nil {
				return nil, err
			}
			return o, nil
		})
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/fans"
	operar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := auth.Require(ctx, cid.String(), "directo.operar")
		return err
	}
	type CidIn struct {
		CID uuid.UUID `path:"cid"`
	}

	// ---- lista y búsqueda ----
	type listaIn struct {
		CidIn
		Estado string `query:"estado" enum:"todos,activos,baneados," doc:"Filtro rápido; vacío = todos"`
		Q      string `query:"q" maxLength:"80" doc:"Alias (contiene) o email exacto"`
		Pagina int    `query:"pagina" minimum:"1" default:"1"`
	}
	type listaOut struct {
		Body struct {
			Items  []FanAdmin `json:"items"`
			Total  int        `json:"total"`
			Pagina int        `json:"pagina"`
			Por    int        `json:"por"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-admin-lista", Method: http.MethodGet, Path: base,
		Summary: "Cuentas de directo: lista, búsqueda y baneos", Tags: tagAdmin, Security: []map[string][]string{{"bearer": {}}}},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			where := `competition_id = $1`
			args := []any{in.CID}
			switch in.Estado {
			case "baneados":
				where += ` AND baneado_hasta IS NOT NULL AND baneado_hasta > now()`
			case "activos":
				where += ` AND (baneado_hasta IS NULL OR baneado_hasta <= now())`
			}
			if q := strings.TrimSpace(in.Q); q != "" {
				args = append(args, "%"+strings.ToLower(q)+"%", emailHash(q))
				where += ` AND (lower(alias::text) LIKE $2 OR email_hash = $3)`
			}
			o := &listaOut{}
			o.Body.Pagina, o.Body.Por = max(in.Pagina, 1), 25
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM fans WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, email::text, tipo, alias::text, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), baneado_hasta, baneado_motivo, version, created_at
				FROM fans WHERE `+where+fmt.Sprintf(` ORDER BY created_at DESC LIMIT %d OFFSET %d`, o.Body.Por, (o.Body.Pagina-1)*o.Body.Por), args...)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o.Body.Items = []FanAdmin{}
			for rows.Next() {
				var f FanAdmin
				if err := rows.Scan(&f.ID, &f.Email, &f.Tipo, &f.Alias, &f.AtletaID, &f.BaneadoHasta, &f.BaneadoMotivo, &f.Version, &f.CreatedAt); err != nil {
					return nil, err
				}
				o.Body.Items = append(o.Body.Items, f)
			}
			return o, rows.Err()
		})

	// ---- banear ----
	type banIn struct {
		CidIn
		FanID uuid.UUID `path:"fanId"`
		Body  struct {
			Hasta  *time.Time `json:"hasta,omitempty" doc:"Momento hasta el que no puede entrar (por defecto 24 horas)"`
			Motivo string     `json:"motivo,omitempty" maxLength:"300"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-admin-banear", Method: http.MethodPost, Path: base + "/{fanId}/banear",
		Summary: "Banear: cierra sus sesiones, bloquea el canje y avisa a chat (fans.baneado)", Tags: tagAdmin, Security: []map[string][]string{{"bearer": {}}}},
		func(ctx context.Context, in *banIn) (*struct{ Body FanAdmin }, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			hasta := time.Now().Add(24 * time.Hour)
			if in.Body.Hasta != nil {
				hasta = *in.Body.Hasta
			}
			if !hasta.After(time.Now()) {
				return nil, problem.Unprocessable("FECHA_NO_VALIDA", "La fecha de fin del baneo debe ser futura.")
			}
			f, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1 AND competition_id = $2`, in.FanID, in.CID))
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("No existe esa cuenta de directo en la competición.")
			} else if err != nil {
				return nil, err
			}
			v, err := s.bumpVersion(ctx, f.ID)
			if err != nil {
				return nil, err
			}
			if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE fans SET baneado_hasta = $3, baneado_motivo = $4, updated_at = now() WHERE id = $1 AND competition_id = $2`,
					f.ID, in.CID, hasta, strings.TrimSpace(in.Body.Motivo)); err != nil {
					return err
				}
				// chat silencia al fan y borra sus mensajes de la sala al recibirlo (Internal: nunca sale por SSE público).
				return events.Enqueue(ctx, tx, events.New(ctx, "fans.baneado", map[string]any{"fanId": f.ID, "alias": f.Alias, "hasta": hasta, "motivo": strings.TrimSpace(in.Body.Motivo)},
					events.Competition(in.CID.String()), events.Audience(events.Internal)))
			}); err != nil {
				return nil, err
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1`, f.ID))
			if err != nil {
				return nil, err
			}
			row.Version = v
			return &struct{ Body FanAdmin }{Body: FanAdmin{ID: row.ID, Email: row.Email, Tipo: row.Tipo, Alias: row.Alias, AtletaID: atletaOpcional(row),
				BaneadoHasta: row.BaneadoHasta, BaneadoMotivo: row.BaneadoMotivo, Version: row.Version, CreatedAt: row.CreatedAt}}, nil
		})

	// ---- desbanear ----
	huma.Register(api, huma.Operation{OperationID: "fans-admin-desbanear", Method: http.MethodPost, Path: base + "/{fanId}/desbanear",
		Summary: "Desbanear (podrá volver a entrar pidiendo un enlace)", Tags: tagAdmin, Security: []map[string][]string{{"bearer": {}}},
		DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *struct {
			CidIn
			FanID uuid.UUID `path:"fanId"`
		}) (*struct{}, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE fans SET baneado_hasta = NULL, baneado_motivo = '', updated_at = now() WHERE id = $1 AND competition_id = $2 AND baneado_hasta IS NOT NULL`, in.FanID, in.CID)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Esa cuenta no está baneada (o no existe en la competición).")
			}
			// Su sesión ya murió con el baneo; no hace falta subir la versión otra vez.
			return nil, nil
		})
}
