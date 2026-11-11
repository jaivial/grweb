// Package fans runs the community accounts of «directo social» (Figma 70 · /en-directo and the access
// modal): one account per email and competition with a public alias, entered through a magic link that
// messaging delivers (`fans.email_solicitado`), the `grcup_fan` session of pkg/fanauth, and the bans the
// backoffice applies (version bump + `fans.baneado` for chat).
package fans

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func mustMigrations() fs.FS {
	m, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		panic(err)
	}
	return m
}

const (
	// reemision is how close to expiry `yo` re-issues the session cookie (TTL is 30 days).
	reemision = 7 * 24 * time.Hour
	// límites of link requests (§3): 5 per email and hour, 20 per IP and hour. The link itself
	// expires in 30 minutes (`interval '30 minutes'` in the INSERT below).
	limiteEmail = 5
	limiteIP    = 200 // per IP and hour: a venue wifi or carrier NAT shares one IP; the per-email limit stops abuse per recipient
)

// Svc holds the service dependencies.
type Svc struct {
	a        *app.App
	comp     *svcclient.Client
	comps    *compref.Resolver
	atletas  athleteRef
	verifier fanauth.Verifier
	webURL   string
	secure   bool
}

// Service returns the fans service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "fans", Title: "GR Cup · fans", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "fans", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	// athletes does not expose the by-email lookup yet: the call sits behind athleteRef (see atletas.go).
	s.atletas = athletesClient{c: svcclient.New(config.Str("UPSTREAM_ATHLETES", "http://athletes:8080"), "fans", "athletes", a.Cfg.InternalToken)}
	s.verifier = fanauth.Verifier{Key: fanauth.Key(a.Cfg.InternalToken), Redis: a.Redis, Keys: a.Keys}
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
	s.secure = config.Bool("COOKIE_SECURE", a.Cfg.Env != "dev")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerPublic()
	s.registerAdmin()
	return nil
}

// ---- ids, tokens, hashes ----

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func randomToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func hashToken(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }

// emailHash is how the email is searched and counted without ever landing in a log.
func emailHash(email string) string { return hashToken(strings.ToLower(strings.TrimSpace(email))) }

// ---- session version (revocation) ----

// bumpVersion raises the fan's session version in Redis (INCR, fanauth.VerKey) and keeps the table in sync,
// so a token signed later (new link, re-issue) carries the same version the others were revoked with.
func (s *Svc) bumpVersion(ctx context.Context, fanID uuid.UUID) (int64, error) {
	n, err := s.a.Redis.Incr(ctx, fanauth.VerKey(s.a.Keys, fanID)).Result()
	if err != nil {
		s.a.Log.Warn("redis versión de fan", "err", err)
	}
	var v int64
	if err := s.a.DB.QueryRow(ctx, `UPDATE fans SET version = GREATEST(version + 1, $2), updated_at = now() WHERE id = $1 RETURNING version`, fanID, n).Scan(&v); err != nil {
		return 0, err
	}
	if v != n && err == nil {
		_ = s.a.Redis.Set(ctx, fanauth.VerKey(s.a.Keys, fanID), v, 0).Err()
	}
	return v, nil
}

// fanRow is the account as stored.
type fanRow struct {
	ID            uuid.UUID
	CompetitionID uuid.UUID
	Email         string
	Tipo          string
	Alias         string
	AtletaID      uuid.UUID
	BaneadoHasta  *time.Time
	BaneadoMotivo string
	Version       int64
	CreatedAt     time.Time
}

const selFan = `SELECT id, competition_id, email::text, tipo, alias::text, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), baneado_hasta, baneado_motivo, version, created_at FROM fans`

func scanFan(row pgx.Row) (fanRow, error) {
	var f fanRow
	err := row.Scan(&f.ID, &f.CompetitionID, &f.Email, &f.Tipo, &f.Alias, &f.AtletaID, &f.BaneadoHasta, &f.BaneadoMotivo, &f.Version, &f.CreatedAt)
	if err != nil {
		return fanRow{}, err
	}
	return f, nil
}

// ---- emails (outbox, nunca datos personales en los logs) ----

func emailSolicitado(ctx context.Context, tx pgx.Tx, cid uuid.UUID, para, plantilla string, vars map[string]string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "fans.email_solicitado", map[string]any{"para": para, "plantilla": plantilla, "vars": vars},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}

// ---- errors ----

func aliasOcupado() *problem.Error {
	return problem.Conflict("ALIAS_OCUPADO", "Ese alias ya está en uso en esta competición. Elige otro.")
}

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

func baneado(hasta time.Time) *problem.Error {
	return problem.Forbidden(fmt.Sprintf("Tu cuenta está suspendida hasta el %s. Escríbenos si crees que es un error.", hasta.In(madrid).Format("02/01/2006 15:04")))
}
