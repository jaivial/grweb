// Package live runs the competition desk and the results (Figma page 57 «Directo y resultados», public pages 25,
// 27 and 28): the desk declares the weights and the three judges' lights of every attempt, the public follows it on
// /en-directo and the arena screen (SSE), results are computed (best valid lift, total, IPF GL points) and published
// per category to /resultados, with notices to the athletes' followers.
package live

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"io/fs"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/cache"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
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

var bearer = []map[string][]string{{"bearer": {}}}

// Svc holds the service dependencies.
type Svc struct {
	a        *app.App
	comps    *compref.Resolver
	athletes *svcclient.Client
	schedule *svcclient.Client
	cache    *cache.Cache
	panKey   []byte
	webURL   string
}

// Service returns the live service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "live", Title: "GR Cup · live", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup}}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "live", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	s.athletes = svcclient.New(config.Str("UPSTREAM_ATHLETES", "http://athletes:8080"), "live", "athletes", a.Cfg.InternalToken)
	s.schedule = svcclient.New(config.Str("UPSTREAM_SCHEDULE", "http://schedule:8080"), "live", "schedule", a.Cfg.InternalToken)
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "live", "")}
	m := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	m.Write([]byte("grcup/live/pantalla/v1"))
	s.panKey = m.Sum(nil)
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerMesa()
	s.registerResultados()
	s.registerPublic()
	return nil
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

func requireAny(ctx context.Context, cid uuid.UUID, msg string, perms ...string) (*auth.Principal, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return nil, err
	}
	for _, k := range perms {
		if p.Can(cid.String(), k) {
			return p, nil
		}
	}
	return nil, problem.Forbidden(msg)
}

// tokenPantalla signs the arena screen URL of a competition (version bumped to revoke an exposed link).
func (s *Svc) tokenPantalla(cid uuid.UUID, ver int) string {
	m := hmac.New(sha256.New, s.panKey)
	m.Write([]byte(cid.String() + ":" + itoa(ver)))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:18])
}

// ---- public cache version, spectators and events ----

func (s *Svc) version(ctx context.Context, cid uuid.UUID) string {
	v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("live", "ver", cid.String())).Result()
	if err != nil {
		return "0"
	}
	return v
}

func (s *Svc) bump(ctx context.Context, cid uuid.UUID) {
	_ = s.a.Redis.Incr(ctx, s.a.Keys.Of("live", "ver", cid.String())).Err()
	s.cache.Del(ctx, "plan:"+cid.String())
}

// espectadores sums the public SSE connections that the realtime pods report (one key per pod, refreshed every
// 20 s with a 60 s expiry, so a crashed pod stops counting).
func (s *Svc) espectadores(ctx context.Context, cid uuid.UUID) int {
	var total int
	iter := s.a.Redis.Scan(ctx, 0, s.a.Keys.Of("rt", "conexiones", cid.String(), "*"), 100).Iterator()
	for iter.Next(ctx) {
		n, err := s.a.Redis.Get(ctx, iter.Val()).Int()
		if err == nil {
			total += n
		}
	}
	return total
}

// evento queues a live event. Public ones carry no names (the clients fetch the public snapshot, which only names
// athletes with a public profile).
func evento(ctx context.Context, tx pgx.Tx, cid uuid.UUID, typ string, data map[string]any, opts ...events.Option) error {
	o := append([]events.Option{events.Competition(cid.String()), events.Audience(events.Public)}, opts...)
	return events.Enqueue(ctx, tx, events.New(ctx, typ, data, o...))
}

// ---- formatting ----

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// kg formats a weight the Spanish way: 132,5 · 140.
func kg(v float64) string {
	s := strings.TrimSuffix(strings.TrimSuffix(trimFloat(v), "0"), ".")
	return strings.ReplaceAll(s, ".", ",")
}

func trimFloat(v float64) string {
	n := int64(v*10 + 0.5)
	if v < 0 {
		n = int64(v*10 - 0.5)
	}
	ent, dec := n/10, n%10
	if dec < 0 {
		dec = -dec
	}
	return itoa(int(ent)) + "." + itoa(int(dec))
}

var movNombre = map[string]string{"sq": "Sentadilla", "bp": "Press banca", "dl": "Peso muerto"}

var ordinal = [...]string{"", "1.º", "2.º", "3.º"}
