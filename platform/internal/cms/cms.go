// Package cms owns the web content of every competition: home sections (draft → publish), FAQ, sponsors,
// SEO and redirects, legal texts (versioned), content pages and blog, gallery albums, volunteer applications
// and uploaded media (Figma page 54 · «Web y contenidos»).
package cms

import (
	"context"
	"embed"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/cache"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
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
	comp     *svcclient.Client
	cache    *cache.Cache
	mediaDir string

	comps *compref.Resolver
}

// Service returns the cms service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{
		Name: "cms", Title: "GR Cup · cms", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		// 1 MiB for every request except media uploads (10 MB files + multipart overhead).
		BodyLimitFor: func(r *http.Request) int64 {
			if r.Method == http.MethodPost && (strings.HasPrefix(r.URL.Path, "/api/admin/competiciones/") && strings.HasSuffix(r.URL.Path, "/medios") || r.URL.Path == "/internal/medios") {
				return maxUpload
			}
			return 0
		},
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup},
	}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "cms", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "cms", "")}
	s.mediaDir = config.Str("MEDIA_DIR", "/data/medios")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerCollections()
	s.registerSecciones()
	s.registerLegal()
	s.registerMedios()
	s.registerPublic()
	s.registerRGPD()
	s.registerPublicExtra()
	return nil
}

// maxUpload is the request limit of a media upload (10 MB file + multipart overhead).
const maxUpload = 11 << 20

// cidFor resolves a public slug to the competition id (see compref: 404 for drafts/archived, 503 when competition fails).
func (s *Svc) cidFor(ctx context.Context, slug string) (uuid.UUID, error) {
	return s.comps.ID(ctx, slug)
}

// version is the content version of a competition: public caches are keyed by it, so a bump invalidates them all.
func (s *Svc) version(ctx context.Context, cid uuid.UUID) string {
	v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("cms", "ver", cid.String())).Result()
	if err != nil {
		return "0"
	}
	return v
}

func (s *Svc) bump(ctx context.Context, cid uuid.UUID) {
	_ = s.a.Redis.Incr(ctx, s.a.Keys.Of("cms", "ver", cid.String())).Err()
}

// Cache lifetimes: content only changes through a version bump, but scheduled pages and posts
// (publicar_at) become visible with time, so their read models expire quickly.
const (
	ttlContent = 10 * time.Minute
	ttlTimed   = time.Minute
)

// cached serves a public read model from Redis (keyed by content version) or builds it.
func cached[T any](ctx context.Context, s *Svc, cid uuid.UUID, key string, ttl time.Duration, build func() (T, error)) (T, error) {
	full := cid.String() + ":" + s.version(ctx, cid) + ":" + key
	var v T
	if s.cache.Get(ctx, full, &v) {
		return v, nil
	}
	v, err := build()
	if err == nil {
		s.cache.Set(ctx, full, v, ttl)
	}
	return v, err
}

// change runs a mutation with its admin event in one transaction and bumps the content version.
func (s *Svc) change(ctx context.Context, cid uuid.UUID, ev string, data any, fn func(tx pgx.Tx) error) error {
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err := fn(tx); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, ev, data, events.Competition(cid.String()), events.ForPermission("web.editar")))
	})
	if err == nil {
		s.bump(ctx, cid)
	}
	return err
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func itoa(i int) string { return strconv.Itoa(i) }
