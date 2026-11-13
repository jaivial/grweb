// Package raffle runs the in-person raffle of a competition (D-RIFA, Figma pages 07 · /sorteo and 60 · BO · Rifa):
// the objects raffled at the venue and the cash ticket info. Nothing is sold online: no payments, buyers or draw.
package raffle

import (
	"context"
	"embed"
	"io/fs"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
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

var bearer = []map[string][]string{{"bearer": {}}}

// Svc holds the service dependencies.
type Svc struct {
	a     *app.App
	comps *compref.Resolver
}

// Service returns the raffle service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "raffle", Title: "GR Cup · raffle", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup}}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "raffle", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	a.AlAnonimizar("raffle", anonimizar)
	s.registerKPIs()
	s.registerRifa()
	return nil
}

type rowQ interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}

// nombrePublico: «Laura G.» (first name and initial: enough for the audience, not a full identity).
func nombrePublico(n string) string {
	f := strings.Fields(n)
	if len(f) == 0 {
		return "—"
	}
	if len(f) == 1 {
		return f[0]
	}
	r := []rune(f[1])
	return f[0] + " " + strings.ToUpper(string(r[0])) + "."
}

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()
