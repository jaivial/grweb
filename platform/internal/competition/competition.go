// Package competition owns competitions (tenants): event data, venue, state (with scheduled changes), modules,
// set-up checklist, external AEP registration, how-to-get-there and encrypted integration settings.
package competition

import (
	"context"
	"embed"
	"io/fs"
	"time"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/cache"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/crypto"
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

// Svc holds the service dependencies.
type Svc struct {
	a        *app.App
	box      *crypto.Box
	cache    *cache.Cache
	identity *svcclient.Client
}

// Service returns the competition service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{
		Name: "competition", Title: "GR Cup · competition", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true,
		Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{
			"seed-grcup": s.seedGRCup,
			"etl-mysql":  s.etlMySQL,
		},
	}
}

func (s *Svc) init(a *app.App) error {
	s.a = a
	box, err := crypto.NewBox(config.Str("CRYPTO_KEY", ""))
	if err != nil {
		if a.Cfg.Env != "dev" {
			return err
		}
		a.Log.Warn("CRYPTO_KEY no válida: clave de desarrollo (no usar fuera de dev)")
		box, _ = crypto.NewBox("00000000000000000000000000000000000000000000000000000000000000aa")
	}
	s.box = box
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "competition", "")}
	s.identity = svcclient.New(config.Str("UPSTREAM_IDENTITY", "http://identity:8080"), "competition", "identity", a.Cfg.InternalToken)
	return nil
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	if err := s.init(a); err != nil {
		return err
	}
	s.registerPublic()
	s.registerAdmin()
	s.registerIntegrations()
	s.registerDominio()
	s.registerInternal()
	a.Go(s.scheduler)
	return nil
}

// scheduler applies due scheduled state changes. Replicas coordinate with FOR UPDATE SKIP LOCKED.
func (s *Svc) scheduler(ctx context.Context) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.applyScheduled(ctx); err != nil && ctx.Err() == nil {
				s.a.Log.Warn("estados programados", "err", err)
			}
		}
	}
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }
