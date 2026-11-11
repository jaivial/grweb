// Package compref resolves the public slug of a competition to its id and basic data, for services that serve
// public pages (cms, athletes…). Lookups are cached for 5 minutes per pod; with Versioned, a change saved in the
// competition service (VerKey bumped in Redis) invalidates every pod within a second. Drafts and archived competitions are
// not public (404). Only an upstream 404 becomes 404: timeouts and 5xx answer 503 so crawlers do not drop pages.
package compref

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

// SlugPattern is the shape of a public competition slug (also used as a huma `pattern` tag).
const SlugPattern = "^[a-z0-9-]{2,41}$"

var slugRe = regexp.MustCompile(SlugPattern)

// Comp is the part of a competition public services need.
type Comp struct {
	ID          uuid.UUID `json:"id"`
	Slug        string    `json:"slug"`
	Nombre      string    `json:"nombre"`
	Estado      string    `json:"estado"`
	FechaInicio string    `json:"fechaInicio,omitempty"`
	FechaFin    string    `json:"fechaFin,omitempty"`
	ZonaHoraria string    `json:"zonaHoraria"`
	Sede        struct {
		Nombre    string `json:"nombre"`
		Direccion string `json:"direccion"`
		Ciudad    string `json:"ciudad"`
	} `json:"sede"`
	Inscripcion struct {
		Modo   string `json:"modo"`
		Estado string `json:"estado"`
		Plazas int    `json:"plazas"`
	} `json:"inscripcion"`
}

// Year of the competition (from fechaInicio), or the current year.
func (c Comp) Year() int {
	if t, err := time.Parse("2006-01-02", c.FechaInicio); err == nil {
		return t.Year()
	}
	return time.Now().Year()
}

type entry struct {
	c   Comp
	ver string
	exp time.Time
}

// VerKey is the Redis key the competition service increments on every change (same key prefix in every service).
func VerKey(prefix func(...string) string) string { return prefix("compref", "ver") }

// Resolver caches slug → competition lookups against the competition service.
type Resolver struct {
	client *svcclient.Client
	log    *slog.Logger
	mu     sync.Mutex
	m      map[string]entry
	rdb    *redis.Client
	verKey string
	ver    string
	verExp time.Time
}

// New returns a resolver that asks competition through client.
func New(client *svcclient.Client, log *slog.Logger) *Resolver {
	return &Resolver{client: client, log: log, m: map[string]entry{}}
}

// Versioned makes cached entries depend on the shared version key (see VerKey).
func (r *Resolver) Versioned(rdb *redis.Client, key string) *Resolver {
	r.rdb, r.verKey = rdb, key
	return r
}

// version is the shared version, read from Redis at most once a second (empty without Redis or on error).
func (r *Resolver) version(ctx context.Context) string {
	if r.rdb == nil {
		return ""
	}
	r.mu.Lock()
	if time.Now().Before(r.verExp) {
		v := r.ver
		r.mu.Unlock()
		return v
	}
	r.mu.Unlock()
	v, err := r.rdb.Get(ctx, r.verKey).Result()
	r.mu.Lock()
	defer r.mu.Unlock()
	if err != nil && err != redis.Nil {
		return r.ver // Redis down: keep the last known version (entries still expire after 5 min)
	}
	r.ver, r.verExp = v, time.Now().Add(time.Second)
	return v
}

// Public returns the public competition of slug.
func (r *Resolver) Public(ctx context.Context, slug string) (Comp, error) {
	if !slugRe.MatchString(slug) {
		return Comp{}, problem.NotFound("Competición no encontrada.")
	}
	ver := r.version(ctx)
	r.mu.Lock()
	if e, ok := r.m[slug]; ok && time.Now().Before(e.exp) && e.ver == ver {
		r.mu.Unlock()
		return e.c, nil
	}
	r.mu.Unlock()
	var c Comp
	if err := r.client.Do(ctx, http.MethodGet, "/internal/competiciones/slug/"+url.PathEscape(slug), nil, &c); err != nil {
		var p *problem.Error
		if errors.As(err, &p) && p.Status == http.StatusNotFound {
			return Comp{}, problem.NotFound("Competición no encontrada.")
		}
		r.log.Warn("competition no disponible", "err", err)
		return Comp{}, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No podemos cargar la competición ahora mismo. Inténtalo en unos segundos.")
	}
	if c.Estado == "borrador" || c.Estado == "archivada" {
		return Comp{}, problem.NotFound("Competición no encontrada.")
	}
	r.mu.Lock()
	r.m[slug] = entry{c: c, ver: ver, exp: time.Now().Add(5 * time.Minute)}
	r.mu.Unlock()
	return c, nil
}

// ID returns only the id of the public competition of slug.
func (r *Resolver) ID(ctx context.Context, slug string) (uuid.UUID, error) {
	c, err := r.Public(ctx, slug)
	return c.ID, err
}

// ByID returns a competition by id (any state; used by admin endpoints that need its date or time zone).
func (r *Resolver) ByID(ctx context.Context, id uuid.UUID) (Comp, error) {
	return r.byID(ctx, id, false)
}

// ByIDFresh skips the cache (decisions that must see the latest data, e.g. the places left when registering).
func (r *Resolver) ByIDFresh(ctx context.Context, id uuid.UUID) (Comp, error) {
	return r.byID(ctx, id, true)
}

func (r *Resolver) byID(ctx context.Context, id uuid.UUID, fresh bool) (Comp, error) {
	key := "id:" + id.String()
	ver := r.version(ctx)
	r.mu.Lock()
	if e, ok := r.m[key]; ok && time.Now().Before(e.exp) && e.ver == ver && !fresh {
		r.mu.Unlock()
		return e.c, nil
	}
	r.mu.Unlock()
	var c Comp
	if err := r.client.Do(ctx, http.MethodGet, "/internal/competiciones/"+id.String(), nil, &c); err != nil {
		var p *problem.Error
		if errors.As(err, &p) && p.Status == http.StatusNotFound {
			return Comp{}, problem.NotFound("Competición no encontrada.")
		}
		return Comp{}, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No podemos cargar la competición ahora mismo. Inténtalo en unos segundos.")
	}
	r.mu.Lock()
	r.m[key] = entry{c: c, ver: ver, exp: time.Now().Add(5 * time.Minute)}
	r.mu.Unlock()
	return c, nil
}
