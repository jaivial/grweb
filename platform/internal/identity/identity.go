// Package identity is the identity service: users, sessions, login (password, magic link, device flow),
// personal access tokens, roles and permissions per competition, team membership and invitations.
package identity

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Svc holds the service dependencies.
type Svc struct {
	a      *app.App
	signer *auth.Signer
	cfg    settings
}

type settings struct {
	CookieSecure bool
	BOURL        string // backoffice base URL (magic links, device verification, invitations)
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
}

// Service returns the service definition for app.Run.
func Service() app.Service {
	s := &Svc{}
	return app.Service{
		Name:       "identity",
		Title:      "GR Cup · identity",
		Migrations: mustMigrations(),
		Offline:    []string{"genkey"},
		NeedsDB:    true,
		NeedsRedis: true,
		Setup:      s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{
			"bootstrap-root": s.bootstrapRoot,
			"enlace-acceso":  s.loginLink,
			"genkey":         genKey,
		},
	}
}

func mustMigrations() fs.FS {
	m, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		panic(err)
	}
	return m
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	s.cfg = settings{
		CookieSecure: config.Bool("COOKIE_SECURE", a.Cfg.Env != "dev"),
		BOURL:        config.Str("BACKOFFICE_URL", "http://localhost:4201"),
		AccessTTL:    config.Duration("ACCESS_TTL", 15*time.Minute),
		RefreshTTL:   config.Duration("REFRESH_TTL", 30*24*time.Hour),
	}
	signer, err := loadSigner(a)
	if err != nil {
		return err
	}
	s.signer = signer
	// identity verifies its own tokens with its own key (no JWKS round trip).
	a.Verifier = auth.NewVerifier("", a.Cfg.JWTIssuer, "identity", a.Cfg.InternalToken, signer.Keys()).WithRevocation(a.Redis, a.Keys)

	// Every competition gets its default roles (and its creator as Admin) even if the synchronous call failed:
	// this consumer retries until it succeeds; ensureDefaultRoles is idempotent.
	a.Go((&events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: "identity-competiciones", Start: "0",
		Types: []string{"competition.creada"}, Handle: s.onCompetitionCreated, Log: a.Log}).Run)

	s.registerAuth()
	s.registerMe()
	s.registerTeam()
	s.registerAdmin()
	s.registerInternal()
	return nil
}

func loadSigner(a *app.App) (*auth.Signer, error) {
	pem := []byte(config.Str("JWT_PRIVATE_KEY", ""))
	if f := config.Str("JWT_PRIVATE_KEY_FILE", ""); len(pem) == 0 && f != "" {
		b, err := os.ReadFile(f)
		if err != nil {
			return nil, err
		}
		pem = b
	}
	if len(pem) == 0 {
		if a.Cfg.Env != "dev" {
			return nil, errors.New("falta JWT_PRIVATE_KEY o JWT_PRIVATE_KEY_FILE")
		}
		a.Log.Warn("JWT_PRIVATE_KEY no definida: clave efímera de desarrollo (los tokens caducan al reiniciar)")
		k, err := auth.GenerateKeyPEM()
		if err != nil {
			return nil, err
		}
		pem = k
	}
	return auth.NewSigner(pem, a.Cfg.JWTIssuer)
}

func (s *Svc) onCompetitionCreated(ctx context.Context, e events.Event) error {
	cid, err := uuid.Parse(e.CompetitionID)
	if err != nil {
		return nil // malformed: nothing to do
	}
	var d struct {
		PropietarioID *uuid.UUID `json:"propietarioId"`
	}
	_ = json.Unmarshal(e.Data, &d)
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err := ensureDefaultRoles(ctx, tx, cid); err != nil {
			return err
		}
		if d.PropietarioID == nil || *d.PropietarioID == uuid.Nil {
			return nil
		}
		rid, err := roleID(ctx, tx, cid, "admin")
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO membresias (usuario_id, competition_id, rol_id) SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM usuarios WHERE id = $1)
			ON CONFLICT DO NOTHING`, *d.PropietarioID, cid, rid)
		return err
	})
}

// genKey prints a new ES256 private key (PEM) to stdout.
func genKey(_ context.Context, _ *app.App, _ []string) error {
	k, err := auth.GenerateKeyPEM()
	if err != nil {
		return err
	}
	_, err = fmt.Fprint(os.Stdout, string(k))
	return err
}
