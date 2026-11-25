package athletes

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"

	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// Athlete area password (Jaime 15-nov): besides the email link, an athlete can set a password from the area and
// then sign in with email + password. argon2id with the same parameters as the backoffice users.
var b64pw = base64.RawStdEncoding

// argonPwSlots bounds concurrent argon2id runs (19 MiB each).
var argonPwSlots = make(chan struct{}, 4)

func areaHash(pw string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	argonPwSlots <- struct{}{}
	key := argon2.IDKey([]byte(pw), salt, 2, 19*1024, 1, 32)
	<-argonPwSlots
	return fmt.Sprintf("$argon2id$v=19$m=19456,t=2,p=1$%s$%s", b64pw.EncodeToString(salt), b64pw.EncodeToString(key))
}

func areaCheck(hash, pw string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	salt, err1 := b64pw.DecodeString(parts[4])
	want, err2 := b64pw.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		// A password taken from the fan account (pkg/passhash writes the URL-safe alphabet).
		salt, err1 = base64.RawURLEncoding.DecodeString(parts[4])
		want, err2 = base64.RawURLEncoding.DecodeString(parts[5])
	}
	if err1 != nil || err2 != nil {
		return false
	}
	argonPwSlots <- struct{}{}
	got := argon2.IDKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	<-argonPwSlots
	return subtle.ConstantTimeCompare(got, want) == 1
}

// dummyAreaHash keeps the timing of unknown emails close to a real check.
var dummyAreaHash = areaHash("contraseña-de-relleno")

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
			h := dummyAreaHash
			if hash != nil {
				h = *hash
			}
			if !areaCheck(h, in.Body.Password) || hash == nil {
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
			if _, err := s.a.DB.Exec(ctx, `UPDATE atletas SET password_hash = $2, password_temporal = false, updated_at = now() WHERE id = $1`, r.ID, areaHash(in.Body.Password)); err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, r)
			return &panelOut{Body: p}, err
		})
}
