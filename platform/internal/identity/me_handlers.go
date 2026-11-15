package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagMe = []string{"Mi cuenta"}

type tokenAcceso struct {
	ID            uuid.UUID  `db:"id" json:"id"`
	Nombre        string     `db:"nombre" json:"nombre"`
	Prefijo       string     `db:"prefijo" json:"prefijo" doc:"Primeros caracteres para reconocerlo"`
	Scopes        []string   `db:"scopes" json:"scopes"`
	CompetitionID *uuid.UUID `db:"competition_id" json:"competitionId,omitempty"`
	ExpiresAt     *time.Time `db:"expires_at" json:"expiresAt,omitempty"`
	LastUsedAt    *time.Time `db:"last_used_at" json:"lastUsedAt,omitempty"`
	RevokedAt     *time.Time `db:"revoked_at" json:"revokedAt,omitempty"`
	CreatedAt     time.Time  `db:"created_at" json:"createdAt"`
}

const selToken = `id, nombre, prefijo, scopes, competition_id, expires_at, last_used_at, revoked_at, created_at`

type vista struct {
	ID        uuid.UUID       `db:"id" json:"id"`
	Recurso   string          `db:"recurso" json:"recurso"`
	Nombre    string          `db:"nombre" json:"nombre"`
	Filtros   json.RawMessage `db:"filtros" json:"filtros"`
	CreatedAt time.Time       `db:"created_at" json:"createdAt"`
}

func userOnly(ctx context.Context) (*auth.Principal, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return nil, err
	}
	if p.IsService() || p.UserID == uuid.Nil {
		return nil, problem.Forbidden("Endpoint de usuario.")
	}
	return p, nil
}

func (s *Svc) registerMe() {
	api := s.a.API

	type listOut struct{ Body []tokenAcceso }
	huma.Register(api, huma.Operation{OperationID: "me-tokens-list", Method: http.MethodGet, Path: "/api/admin/me/tokens", Summary: "Mis tokens personales", Tags: tagMe, Security: bearer},
		func(ctx context.Context, _ *struct{}) (*listOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT `+selToken+` FROM tokens_acceso WHERE usuario_id = $1 ORDER BY created_at DESC`, p.UserID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[tokenAcceso])
			return &listOut{Body: list}, err
		})

	type createIn struct {
		Body struct {
			Nombre        string     `json:"nombre" minLength:"2" maxLength:"80"`
			Scopes        []string   `json:"scopes" minItems:"1" doc:"Claves de permiso; deben ser tuyas en esa competición"`
			CompetitionID *uuid.UUID `json:"competitionId,omitempty"`
			ExpiresAt     *time.Time `json:"expiresAt,omitempty"`
		}
	}
	type createOut struct {
		Body struct {
			Token string      `json:"token" doc:"Se muestra una sola vez"`
			Info  tokenAcceso `json:"info"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "me-tokens-create", Method: http.MethodPost, Path: "/api/admin/me/tokens", Summary: "Crear un token personal (CLI, automatizaciones, puerta)", Tags: tagMe, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *createIn) (*createOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			for _, sc := range in.Body.Scopes {
				if !auth.Valid(sc) {
					return nil, problem.Unprocessable("PERMISO_DESCONOCIDO", "Permiso desconocido: "+sc)
				}
				if in.Body.CompetitionID == nil && !p.Root {
					return nil, problem.Unprocessable("COMPETICION_OBLIGATORIA", "Indica la competición del token.")
				}
				if in.Body.CompetitionID != nil && !p.Can(in.Body.CompetitionID.String(), sc) {
					return nil, problem.Forbidden("No puedes delegar un permiso que no tienes: " + sc)
				}
			}
			if in.Body.ExpiresAt != nil && in.Body.ExpiresAt.Before(time.Now()) {
				return nil, problem.Unprocessable("CADUCIDAD_PASADA", "La caducidad debe ser futura.")
			}
			secret := "grc_" + randomToken(30)
			out := &createOut{}
			rows, err := s.a.DB.Query(ctx, `INSERT INTO tokens_acceso (id, usuario_id, nombre, token_hash, prefijo, scopes, competition_id, expires_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING `+selToken,
				uuid.Must(uuid.NewV7()), p.UserID, in.Body.Nombre, hashToken(secret), secret[:10], auth.Expand(in.Body.Scopes), in.Body.CompetitionID, in.Body.ExpiresAt)
			if err != nil {
				return nil, err
			}
			out.Body.Info, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[tokenAcceso])
			out.Body.Token = secret
			return out, err
		})

	type idIn struct {
		ID uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "me-tokens-revoke", Method: http.MethodDelete, Path: "/api/admin/me/tokens/{id}", Summary: "Revocar un token personal", Tags: tagMe, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE tokens_acceso SET revoked_at = now() WHERE id = $1 AND usuario_id = $2 AND revoked_at IS NULL`, in.ID, p.UserID)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Token no encontrado o ya revocado.")
			}
			_ = s.a.Redis.Del(ctx, s.a.Keys.Of("pat", in.ID.String())).Err()
			return nil, nil
		})

	// ---- vistas guardadas ----
	type vistasIn struct {
		Recurso string `query:"recurso" maxLength:"60"`
	}
	type vistasOut struct{ Body []vista }
	huma.Register(api, huma.Operation{OperationID: "me-vistas-list", Method: http.MethodGet, Path: "/api/admin/me/vistas", Summary: "Mis vistas (filtros) guardadas", Tags: tagMe, Security: bearer},
		func(ctx context.Context, in *vistasIn) (*vistasOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, recurso, nombre, filtros, created_at FROM vistas_guardadas WHERE usuario_id = $1 AND ($2 = '' OR recurso = $2) ORDER BY recurso, nombre`, p.UserID, in.Recurso)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[vista])
			return &vistasOut{Body: list}, err
		})
	type vistaIn struct {
		Body struct {
			Recurso string          `json:"recurso" minLength:"1" maxLength:"60"`
			Nombre  string          `json:"nombre" minLength:"1" maxLength:"80"`
			Filtros json.RawMessage `json:"filtros"`
		}
	}
	type vistaOut struct{ Body vista }
	huma.Register(api, huma.Operation{OperationID: "me-vistas-save", Method: http.MethodPost, Path: "/api/admin/me/vistas", Summary: "Guardar una vista (sobrescribe la del mismo nombre)", Tags: tagMe, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *vistaIn) (*vistaOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			if len(in.Body.Filtros) == 0 || !json.Valid(in.Body.Filtros) {
				in.Body.Filtros = json.RawMessage(`{}`)
			}
			rows, err := s.a.DB.Query(ctx, `INSERT INTO vistas_guardadas (id, usuario_id, recurso, nombre, filtros) VALUES ($1,$2,$3,$4,$5)
				ON CONFLICT (usuario_id, recurso, nombre) DO UPDATE SET filtros = EXCLUDED.filtros RETURNING id, recurso, nombre, filtros, created_at`,
				uuid.Must(uuid.NewV7()), p.UserID, in.Body.Recurso, in.Body.Nombre, in.Body.Filtros)
			if err != nil {
				return nil, err
			}
			v, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[vista])
			return &vistaOut{Body: v}, err
		})
	huma.Register(api, huma.Operation{OperationID: "me-vistas-delete", Method: http.MethodDelete, Path: "/api/admin/me/vistas/{id}", Summary: "Borrar una vista guardada", Tags: tagMe, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			_, err = s.a.DB.Exec(ctx, `DELETE FROM vistas_guardadas WHERE id = $1 AND usuario_id = $2`, in.ID, p.UserID)
			return nil, err
		})

	// ---- preferencias ----
	type prefOut struct {
		Body struct {
			Datos json.RawMessage `json:"datos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "me-preferencias-get", Method: http.MethodGet, Path: "/api/admin/me/preferencias", Summary: "Mis preferencias (columnas, densidad, competición por defecto)", Tags: tagMe, Security: bearer},
		func(ctx context.Context, _ *struct{}) (*prefOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			out := &prefOut{}
			err = s.a.DB.QueryRow(ctx, `SELECT datos FROM preferencias WHERE usuario_id = $1`, p.UserID).Scan(&out.Body.Datos)
			if db.IsNoRows(err) {
				out.Body.Datos, err = json.RawMessage(`{}`), nil
			}
			return out, err
		})
	type prefIn struct {
		Body struct {
			Datos json.RawMessage `json:"datos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "me-preferencias-put", Method: http.MethodPut, Path: "/api/admin/me/preferencias", Summary: "Guardar mis preferencias", Tags: tagMe, Security: bearer},
		func(ctx context.Context, in *prefIn) (*prefOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			if len(in.Body.Datos) == 0 || !json.Valid(in.Body.Datos) || !strings.HasPrefix(strings.TrimSpace(string(in.Body.Datos)), "{") {
				return nil, problem.Unprocessable("JSON_INVALIDO", "Las preferencias deben ser un objeto JSON.")
			}
			out := &prefOut{}
			err = s.a.DB.QueryRow(ctx, `INSERT INTO preferencias (usuario_id, datos) VALUES ($1,$2) ON CONFLICT (usuario_id) DO UPDATE SET datos = EXCLUDED.datos, updated_at = now() RETURNING datos`,
				p.UserID, in.Body.Datos).Scan(&out.Body.Datos)
			return out, err
		})
}

// intersect keeps the token scopes the user still holds (permissions may have been removed since).
func intersect(scopes, held []string) []string {
	out := []string{}
	for _, s := range scopes {
		if slices.Contains(held, s) {
			out = append(out, s)
		}
	}
	return out
}
