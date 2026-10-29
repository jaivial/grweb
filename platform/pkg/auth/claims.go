// Package auth issues (identity only) and verifies the platform's JWTs and enforces permissions.
package auth

import (
	"context"
	"slices"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Token types.
const (
	TypAccess  = "access"
	TypService = "service"
)

// Claims of an access token (ES256, signed by identity) or a service token (HS256, internal).
type Claims struct {
	jwt.RegisteredClaims
	Typ    string              `json:"typ"`
	Name   string              `json:"name,omitempty"`
	Email  string              `json:"email,omitempty"`
	Root   bool                `json:"root,omitempty"`
	Comp   map[string][]string `json:"comp,omitempty"` // competition id → expanded permissions
	SID    string              `json:"sid,omitempty"`  // session id (revocation)
	Origin string              `json:"orig,omitempty"` // web | cli | mcp | token:<name>
	Svc    string              `json:"svc,omitempty"`  // calling service (service tokens)
}

// Principal is the authenticated caller of a request.
type Principal struct {
	UserID  uuid.UUID
	Email   string
	Name    string
	Root    bool
	Perms   map[string][]string
	SID     string
	Origin  string
	Service string // set for service tokens
	Token   string // raw bearer token (forwarded on internal calls on behalf of the user)
}

// IsService reports a service-to-service call.
func (p *Principal) IsService() bool { return p != nil && p.Service != "" }

// Can reports whether the principal holds perm in the competition.
func (p *Principal) Can(cid, perm string) bool {
	if p == nil {
		return false
	}
	if p.Root || p.IsService() {
		return true
	}
	return slices.Contains(p.Perms[cid], perm)
}

// Member reports any access to the competition.
func (p *Principal) Member(cid string) bool {
	if p == nil {
		return false
	}
	return p.Root || p.IsService() || len(p.Perms[cid]) > 0
}

type ctxKey int

const (
	principalKey ctxKey = iota
	authErrKey
)

// WithPrincipal stores the caller in the context.
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

// FromContext returns the caller, if any.
func FromContext(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalKey).(*Principal)
	return p, ok && p != nil
}

func withAuthError(ctx context.Context, err *problem.Error) context.Context {
	return context.WithValue(ctx, authErrKey, err)
}

// User requires an authenticated caller.
func User(ctx context.Context) (*Principal, error) {
	if p, ok := FromContext(ctx); ok {
		return p, nil
	}
	if e, ok := ctx.Value(authErrKey).(*problem.Error); ok {
		return nil, e
	}
	return nil, problem.Unauthorized("NO_AUTENTICADO", "Inicia sesión para continuar.")
}

// Require requires perm in competition cid (Root and services always pass).
func Require(ctx context.Context, cid, perm string) (*Principal, error) {
	p, err := User(ctx)
	if err != nil {
		return nil, err
	}
	if !p.Can(cid, perm) {
		return nil, problem.Forbidden("Tu rol no tiene el permiso «" + perm + "» en esta competición.")
	}
	return p, nil
}

// RequireMember requires any role in the competition.
func RequireMember(ctx context.Context, cid string) (*Principal, error) {
	p, err := User(ctx)
	if err != nil {
		return nil, err
	}
	if !p.Member(cid) {
		return nil, problem.Forbidden("No perteneces al equipo de esta competición.")
	}
	return p, nil
}

// RequireRoot requires a Root user.
func RequireRoot(ctx context.Context) (*Principal, error) {
	p, err := User(ctx)
	if err != nil {
		return nil, err
	}
	if !p.Root {
		return nil, problem.Forbidden("Solo Root puede hacer esto.")
	}
	return p, nil
}

// RequireService requires an internal service token.
func RequireService(ctx context.Context) (*Principal, error) {
	p, err := User(ctx)
	if err != nil {
		return nil, err
	}
	if !p.IsService() {
		return nil, problem.Forbidden("Endpoint interno.")
	}
	return p, nil
}

func principalFromClaims(c *Claims, raw string) *Principal {
	p := &Principal{Email: c.Email, Name: c.Name, Root: c.Root, Perms: c.Comp, SID: c.SID, Origin: c.Origin, Token: raw}
	if c.Typ == TypService {
		p.Service = c.Svc
		return p
	}
	p.UserID, _ = uuid.Parse(c.Subject)
	return p
}

func bearer(h string) string {
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}
