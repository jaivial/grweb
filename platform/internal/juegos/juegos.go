// Package juegos runs the virtual games of a live meet (contract §6): jornadas, wallets as a ledger (porra and
// fantasy coins, never bought with money), the porra (parimutuel betting on the scoreboard), GRS Fantasy (athlete
// market with real-time clauses), prizes and classifications. The `worker` subcommand (juegos-worker) consumes the
// events of chat, donations and live: rewards, clause changes, points and market liquidation.
package juegos

import (
	"context"
	"embed"
	"io/fs"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/cache"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
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

// The public operations of juegos authenticate with the fan session (the cookie «grcup_fan» or the header
// «X-GrCup-Fan»), not with the staff bearer token. The repo declares no cookie security scheme, so the
// operations document the session here: the OpenAPI published by the gateway is the contract of the generated
// clients and it must not describe a bearer that is not used (contract §3 and §6.6).
const (
	descSesionFan         = "Requiere la sesión de fan: cookie «grcup_fan» (Path=/api, httpOnly) o cabecera «X-GrCup-Fan»."
	descSesionFanOpcional = "La sesión de fan es opcional (cookie «grcup_fan» o cabecera «X-GrCup-Fan»): sin ella la respuesta no lleva «mi puesto» ni «mi saldo»."
)

// Svc holds the service dependencies.
type Svc struct {
	a      *app.App
	comps  *compref.Resolver
	live   *svcclient.Client
	sched  *svcclient.Client
	fans   *fanauth.Verifier
	cache  *cache.Cache
	marcMu sync.Mutex
	marc   map[string]marcEntrada
	marcSF singleflight.Group // one live call per scoreboard key at a time
	resum  memo // public summaries of the home (10 s, singleflight)
	// lobbyMemo: the public part of the lobby per jornada (1 s, singleflight, ST3-R2-1)
	lobbyMemo memo
	hor    map[string]horEntrada
	horSF  singleflight.Group // one schedule call per key at a time
	// horarioFijo replaces the published schedule in the tests.
	horarioFijo *horarioDia
}

type marcEntrada struct {
	m   *Marcador
	err error
	ok  time.Time // when m was fetched (stale limit)
	// caido: the last fetch failed; expired entries are served at once while a background retry runs.
	caido bool
	exp time.Time
}

// Service returns the games service definition.
func Service() app.Service {
	s := &Svc{marc: map[string]marcEntrada{}}
	return app.Service{Name: "juegos", Title: "GR Cup · juegos", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"worker": s.comandoWorker}}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "juegos", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	s.live = svcclient.New(config.Str("UPSTREAM_LIVE", "http://live:8080"), "juegos", "live", a.Cfg.InternalToken)
	s.sched = svcclient.New(config.Str("UPSTREAM_SCHEDULE", "http://schedule:8080"), "juegos", "schedule", a.Cfg.InternalToken)
	s.fans = &fanauth.Verifier{Key: fanauth.Key(a.Cfg.InternalToken), Redis: a.Redis, Keys: a.Keys}
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "juegos", "")}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerPublic()
	s.registerPublicExtra()
	s.registerResumen()
	s.registerSalas()
	s.registerAdmin()
	return nil
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }
