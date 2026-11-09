// Package fanauth is the session of the public community accounts («cuentas de directo»: atleta or público) used by
// the chat, donations and games. The `fans` service issues it after a magic link; every other service verifies it
// locally (HMAC-SHA256 with a key derived from INTERNAL_TOKEN_SECRET), so the hot path of the chat never calls
// another service.
//
// The token travels in the httpOnly cookie `grcup_fan` (Path=/api, SameSite=Lax). It never goes in Authorization:
// the gateway only accepts staff JWTs there.
//
// Revocation (logout everywhere, ban): the fan's session version lives in Redis (`fans:ver:<fanId>`); Verify with a
// Redis client compares it, so a bumped version invalidates every older token at once.
package fanauth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/redisx"
)

// Cookie is the name of the session cookie.
const Cookie = "grcup_fan"

// TTL is the lifetime of a session token (the fans service re-issues it while it is in use).
const TTL = 30 * 24 * time.Hour

// Tipo of account.
const (
	TipoAtleta  = "atleta"
	TipoPublico = "publico"
)

// Fan is the verified identity carried by the token.
type Fan struct {
	ID            uuid.UUID `json:"id"`
	CompetitionID uuid.UUID `json:"cid"`
	Tipo          string    `json:"tipo"`            // atleta | publico
	Alias         string    `json:"alias"`           // public nickname shown in the chat and rankings
	AtletaID      uuid.UUID `json:"aid,omitempty"`   // when Tipo == atleta and the email matched an athlete
	Ver           int64     `json:"ver"`             // session version (revocation)
	Exp           int64     `json:"exp"`             // unix seconds
	Verificado    bool      `json:"verif,omitempty"` // email confirmed (always true for issued tokens)
	Moderador     bool      `json:"mod,omitempty"`   // reserved: staff moderate from the backoffice with their JWT
}

var (
	// ErrInvalid means the token is malformed, forged or expired.
	ErrInvalid = errors.New("sesión de directo no válida")
	// ErrRevoked means the session version was bumped (logout everywhere or ban).
	ErrRevoked = errors.New("sesión de directo revocada")
)

// Key derives the signing key from the internal secret (same derivation in every service).
func Key(internalSecret string) []byte {
	m := hmac.New(sha256.New, []byte(internalSecret))
	m.Write([]byte("grcup/fans/sesion/v1"))
	return m.Sum(nil)
}

// Sign returns the token for f (Exp is set to now+TTL when zero).
func Sign(key []byte, f Fan) (string, error) {
	if f.Exp == 0 {
		f.Exp = time.Now().Add(TTL).Unix()
	}
	body, err := json.Marshal(f)
	if err != nil {
		return "", err
	}
	p := base64.RawURLEncoding.EncodeToString(body)
	return p + "." + sig(key, p), nil
}

func sig(key []byte, p string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(p))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// Parse checks the signature and expiry of a token (no revocation check).
func Parse(key []byte, tok string) (Fan, error) {
	p, s, ok := strings.Cut(tok, ".")
	if !ok || p == "" || s == "" || !hmac.Equal([]byte(sig(key, p)), []byte(s)) {
		return Fan{}, ErrInvalid
	}
	body, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return Fan{}, ErrInvalid
	}
	var f Fan
	if err := json.Unmarshal(body, &f); err != nil || f.ID == uuid.Nil || f.CompetitionID == uuid.Nil {
		return Fan{}, ErrInvalid
	}
	if time.Now().Unix() >= f.Exp {
		return Fan{}, ErrInvalid
	}
	return f, nil
}

// Verifier verifies tokens and, with Redis, their session version.
type Verifier struct {
	Key   []byte
	Redis *redis.Client // nil: no revocation check
	Keys  redisx.Keys
}

// VerKey is the Redis key holding the current session version of a fan.
func VerKey(k redisx.Keys, fanID uuid.UUID) string { return k.Of("fans", "ver", fanID.String()) }

// Verify parses tok and checks it was not revoked.
func (v *Verifier) Verify(ctx context.Context, tok string) (Fan, error) {
	f, err := Parse(v.Key, tok)
	if err != nil {
		return Fan{}, err
	}
	if v.Redis != nil {
		cur, err := v.Redis.Get(ctx, VerKey(v.Keys, f.ID)).Result()
		if err == nil {
			if n, perr := strconv.ParseInt(cur, 10, 64); perr == nil && n > f.Ver {
				return Fan{}, ErrRevoked
			}
		}
		// redis.Nil or a Redis error: accept (fail open on availability, the token is still signed and unexpired).
	}
	return f, nil
}

// FromRequest reads the cookie (or, for non-browser clients such as the load test, the
// `X-GrCup-Fan` header) and verifies it.
func (v *Verifier) FromRequest(r *http.Request) (Fan, error) {
	tok := ""
	if c, err := r.Cookie(Cookie); err == nil {
		tok = c.Value
	}
	if tok == "" {
		tok = r.Header.Get("X-GrCup-Fan")
	}
	if tok == "" {
		return Fan{}, ErrInvalid
	}
	return v.Verify(r.Context(), tok)
}

// Problem converts a verification error into the API error.
func Problem(err error) *problem.Error {
	if errors.Is(err, ErrRevoked) {
		return problem.Unauthorized("SESION_FAN_REVOCADA", "Tu sesión se ha cerrado. Vuelve a entrar con tu email.")
	}
	return problem.Unauthorized("SESION_FAN_REQUERIDA", "Entra con tu cuenta de atleta o público para participar.")
}

// SessionCookie builds the cookie that carries tok (maxAge < 0 deletes it).
func SessionCookie(tok string, maxAge int, secure bool) *http.Cookie {
	return &http.Cookie{Name: Cookie, Value: tok, Path: "/api", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge}
}

type ctxKey struct{}

// With stores f in ctx.
func With(ctx context.Context, f Fan) context.Context { return context.WithValue(ctx, ctxKey{}, f) }

// From returns the fan stored by With.
func From(ctx context.Context) (Fan, bool) {
	f, ok := ctx.Value(ctxKey{}).(Fan)
	return f, ok
}
