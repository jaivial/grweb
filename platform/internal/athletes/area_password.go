package athletes

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/passhash"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// Athlete area password (Jaime 15-nov): besides the email link, an athlete can set a password from the area and
// then sign in with email + password. Same hash as the directo account (pkg/passhash): one account per email, one
// password, kept in step through fans (see passwordAFan).

func (s *Svc) tienePassword(ctx context.Context, atleta uuid.UUID) bool {
	var ok bool
	_ = s.a.DB.QueryRow(ctx, `SELECT password_hash IS NOT NULL FROM atletas WHERE id = $1`, atleta).Scan(&ok)
	return ok
}

func (s *Svc) registerAreaPassword() {
	api := s.a.API
	base := "/api/area-atleta"

	type loginIn struct {
		Body struct {
			Competicion string `json:"competicion" pattern:"^[a-z0-9-]{2,41}$"`
			Email       string `json:"email" format:"email" maxLength:"254"`
			Password    string `json:"password" minLength:"1" maxLength:"200"`
		}
	}
	type sesionOut struct {
		SetCookie []http.Cookie `header:"Set-Cookie"`
		Body      Panel
	}
	huma.Register(api, huma.Operation{OperationID: "area-login", Method: http.MethodPost, Path: base + "/login", Summary: "Entrar con email y contraseña", Tags: tagArea},
		func(ctx context.Context, in *loginIn) (*sesionOut, error) {
			cid, err := s.comps.ID(ctx, in.Body.Competicion)
			if err != nil {
				return nil, err
			}
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "area-login", httpx.ClientIPFrom(ctx)), 20, 15*time.Minute); !r.Allowed {
				return nil, problem.TooMany("Demasiados intentos. Espera unos minutos.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "area-login-email", hashToken(e)[:16]), 8, 15*time.Minute); !r.Allowed {
				return nil, problem.TooMany("Demasiados intentos. Espera unos minutos.")
			}
			var aid uuid.UUID
			var hash *string
			_ = s.a.DB.QueryRow(ctx, `SELECT id, password_hash FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' ORDER BY created_at LIMIT 1`, cid, e).Scan(&aid, &hash)
			h := passhash.Dummy
			if hash != nil {
				h = *hash
			}
			if !passhash.Check(h, in.Body.Password) || hash == nil {
				return nil, problem.Unauthorized("CREDENCIALES", "Email o contraseña incorrectos. Si aún no tienes contraseña, entra con el enlace por email y créala en tu área.")
			}
			t := randomToken()
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO area_sesiones (id, atleta_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`, newID(), aid, hashToken(t), time.Now().Add(areaSessionTTL)); err != nil {
				return nil, err
			}
			r, err := getRow(ctx, s.a.DB, cid, aid)
			if err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			if err != nil {
				return nil, err
			}
			return &sesionOut{SetCookie: []http.Cookie{s.cookie(t, int(areaSessionTTL.Seconds()))}, Body: p}, nil
		})

	type passwordIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			Password string `json:"password" minLength:"10" maxLength:"200" doc:"Mínimo 10 caracteres"`
		}
	}
	type panelOut struct{ Body Panel }
	huma.Register(api, huma.Operation{OperationID: "area-password", Method: http.MethodPut, Path: base + "/password", Summary: "Crear o cambiar mi contraseña", Tags: tagArea},
		func(ctx context.Context, in *passwordIn) (*panelOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if len([]rune(in.Body.Password)) < 10 {
				return nil, problem.Unprocessable("CONTRASENA_DEBIL", "La contraseña debe tener al menos 10 caracteres.")
			}
			hash := passhash.Hash(in.Body.Password)
			if _, err := s.a.DB.Exec(ctx, `UPDATE atletas SET password_hash = $2, password_temporal = false, updated_at = now() WHERE id = $1`, r.ID, hash); err != nil {
				return nil, err
			}
			s.passwordAFan(ctx, r.CompetitionID, r.ID, hash)
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})

	// fans → athletes: the directo account of an athlete got a new password (one account per email, one password).
	type passwordAtletaIn struct {
		CID      uuid.UUID `path:"cid"`
		AtletaID uuid.UUID `path:"id"`
		Body     struct {
			PasswordHash string `json:"passwordHash" minLength:"1" maxLength:"200"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-atleta-password", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/atletas/{id}/password",
		Summary: "Contraseña nueva de la cuenta del directo del atleta (solo fans)", Tags: []string{"Interno"}, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *passwordAtletaIn) (*struct{}, error) {
			p, err := auth.RequireService(ctx)
			if err != nil {
				return nil, err
			}
			if p.Service != "fans" {
				return nil, problem.Forbidden("Solo fans.")
			}
			if !strings.HasPrefix(in.Body.PasswordHash, "$argon2id$") {
				return nil, problem.Unprocessable("HASH_NO_VALIDO", "El hash no es argon2id.")
			}
			if _, err := s.a.DB.Exec(ctx, `UPDATE atletas SET password_hash = $3, password_temporal = false, updated_at = now() WHERE id = $2 AND competition_id = $1`,
				in.CID, in.AtletaID, in.Body.PasswordHash); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})
}
