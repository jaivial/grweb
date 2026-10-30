// Package gateway is the edge of the platform: it routes /api/* to the owning service, verifies JWTs,
// exchanges personal access tokens (grc_…) for short JWTs, rate-limits by IP, handles CORS and
// aggregates health and OpenAPI.
package gateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

type route struct {
	re  *regexp.Regexp
	svc string
}

// routeTable maps public paths to their owning service (same rules as docs/INVENTARIO.md). First match wins.
var routeTable = func() []route {
	c := `^/api/admin/competiciones/[^/]+/`
	p := `^/api/competiciones/[^/]+/`
	defs := [][2]string{
		{`^/\.well-known/jwks\.json$`, "identity"},
		{`^/api/auth(/|$)`, "identity"},
		{`^/api/admin/(me|usuarios)(/|$)`, "identity"},
		{`^/api/competition/`, "identity"},
		{c + `equipo(/|$)`, "identity"},
		{c + `stream$`, "realtime"},
		{p + `stream$`, "realtime"},
		{`^/api/pantalla/`, "realtime"},
		{c + `(auditoria|actividad|dashboard|notificaciones|exportaciones|trabajos|webhooks)(/|$)`, "audit"},
		{c + `(web|legal|voluntarios|medios)(/|$)`, "cms"},
		{p + `(web|faq|patrocinadores|legal|blog|galeria|voluntarios|seo|paginas|clubs)(/|$)`, "cms"},
		{`^/api/(sitemap|ayuda|medios)(/|$)`, "cms"},
		{c + `(directo|resultados)(/|$)`, "live"},
		{p + `(directo|resultados|jueces)(/|$)`, "live"},
		{c + `(atletas|inscripcion|cupones|referidos|pagos)(/|$)`, "athletes"},
		{p + `inscripcion(/|$)`, "athletes"},
		{`^/api/webhooks/pagos/inscripciones$`, "athletes"},
		{`^/api/pagos/simulado/athletes/`, "athletes"},
		{p + `(atletas|participantes|seguimientos)(/|$)`, "athletes"},
		{`^/api/area-atleta(/|$)`, "athletes"},
		{c + `(horarios|flights)(/|$)`, "schedule"},
		{p + `horarios(/|$)`, "schedule"},
		{c + `(entradas|checkin)(/|$)`, "ticketing"},
		{p + `entradas(/|$)`, "ticketing"},
		{`^/api/mi-entrada(/|$)`, "ticketing"},
		{c + `rifa(/|$)`, "raffle"},
		{p + `rifa(/|$)`, "raffle"},
		{`^/api/webhooks/stripe$`, "raffle"},
		{c + `(contactos|segmentos|supresiones)(/|$)`, "crm"},
		{`^/api/(baja|suscripciones|consentimientos)(/|$)`, "crm"},
		{c + `(campanas|emails|whatsapp|mensajes|automatizaciones)(/|$)`, "messaging"},
		{`^/api/webhooks/whatsapp$`, "messaging"},
		{c + `ia(/|$)`, "ai"},
		{`^/api/admin/(competiciones|workspaces)(/|$)`, "competition"},
		{`^/api/competiciones(/|$)`, "competition"},
	}
	out := make([]route, len(defs))
	for i, d := range defs {
		out[i] = route{regexp.MustCompile(d[0]), d[1]}
	}
	return out
}()

func match(path string) string {
	for _, r := range routeTable {
		if r.re.MatchString(path) {
			return r.svc
		}
	}
	return ""
}

// AllServices lists every backend service the gateway can route to.
var AllServices = []string{"identity", "competition", "cms", "athletes", "schedule", "live", "ticketing", "raffle", "crm", "messaging", "ai", "realtime", "audit"}

type gw struct {
	a        *app.App
	upstream map[string]*url.URL
	proxies  map[string]*httputil.ReverseProxy
	identity *svcclient.Client
	cors     []string
	ipLimit  int64

	specMu   sync.Mutex
	spec     []byte
	specTime time.Time
}

// Service returns the gateway definition.
func Service() app.Service {
	g := &gw{}
	return app.Service{Name: "gateway", Title: "GR Cup · gateway", NeedsRedis: true, Setup: g.setup, BodyLimit: 64 << 20}
}

func (g *gw) setup(_ context.Context, a *app.App) error {
	g.a = a
	g.cors = config.List("CORS_ORIGINS")
	g.ipLimit = int64(config.Int("RATE_LIMIT_IP_MIN", 600))
	g.upstream, g.proxies = map[string]*url.URL{}, map[string]*httputil.ReverseProxy{}
	enabled := config.List("UPSTREAMS")
	if len(enabled) == 0 {
		enabled = AllServices
	}
	transport := &http.Transport{MaxIdleConnsPerHost: 64, IdleConnTimeout: 90 * time.Second, ResponseHeaderTimeout: 60 * time.Second}
	for _, svc := range enabled {
		raw := config.Str("UPSTREAM_"+strings.ToUpper(svc), "http://"+svc+":8080")
		u, err := url.Parse(raw)
		if err != nil {
			return err
		}
		g.upstream[svc] = u
		g.proxies[svc] = g.newProxy(svc, u, transport)
	}
	if u, ok := g.upstream["identity"]; ok {
		g.identity = svcclient.New(u.String(), "gateway", "identity", a.Cfg.InternalToken)
	}
	a.Mux.HandleFunc("GET /api/health", g.health)
	a.Mux.HandleFunc("GET /openapi/v1.json", g.openapi)
	a.Mux.HandleFunc("/api/", g.serve)
	a.Mux.HandleFunc("/.well-known/", g.serve)
	return nil
}

func (g *gw) newProxy(svc string, target *url.URL, t http.RoundTripper) *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Transport:     t,
		FlushInterval: -1, // stream SSE immediately
		Rewrite: func(pr *httputil.ProxyRequest) {
			// nginx overwrites X-Forwarded-For with the real client: keep it as the first hop.
			if xff := pr.In.Header.Get("X-Forwarded-For"); xff != "" {
				pr.Out.Header.Set("X-Forwarded-For", xff)
			}
			pr.SetURL(target)
			pr.SetXForwarded()
			pr.Out.Host = target.Host
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			g.a.Log.Warn("upstream", "svc", svc, "err", err, "request_id", httpx.RequestIDFrom(r.Context()))
			problem.Write(w, problem.New(http.StatusBadGateway, "SERVICIO_NO_DISPONIBLE", "El servicio "+svc+" no responde. Inténtalo en unos segundos."))
		},
	}
}

func (g *gw) serve(w http.ResponseWriter, r *http.Request) {
	if g.applyCORS(w, r) {
		return
	}
	ctx := r.Context()
	if res, err := ratelimit.Allow(ctx, g.a.Redis, g.a.Keys.Of("rl", "gw", httpx.ClientIPFrom(ctx)), g.ipLimit, time.Minute); err == nil && !res.Allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(res.RetryAfter.Seconds())+1))
		problem.Write(w, problem.TooMany("Demasiadas peticiones desde tu red. Espera un momento."))
		return
	}
	svc := match(r.URL.Path)
	if svc == "" {
		problem.Write(w, problem.NotFound("Ruta desconocida: "+r.URL.Path))
		return
	}
	proxy, ok := g.proxies[svc]
	if !ok {
		problem.Write(w, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "El módulo «"+svc+"» todavía no está desplegado."))
		return
	}
	// Clients never send internal headers.
	r.Header.Del("X-GrCup-Service")
	if tok := bearer(r.Header.Get("Authorization")); tok != "" {
		if strings.HasPrefix(tok, "grc_") {
			jwt, err := g.exchange(ctx, tok)
			if err != nil {
				problem.Write(w, problem.Unauthorized("TOKEN_INVALIDO", "Token personal no válido, revocado o caducado."))
				return
			}
			r.Header.Set("Authorization", "Bearer "+jwt)
			if r.Header.Get("X-GrCup-Origen") == "" {
				r.Header.Set("X-GrCup-Origen", "cli")
			}
		} else if !strings.HasPrefix(r.URL.Path, "/api/auth/") {
			if _, err := g.a.Verifier.Verify(ctx, tok); err != nil {
				problem.Write(w, problem.Unauthorized("TOKEN_INVALIDO", "Tu sesión ha caducado o no es válida. Vuelve a iniciar sesión."))
				return
			}
		}
	}
	proxy.ServeHTTP(w, r)
}

// exchange swaps a personal access token for a short JWT minted by identity (cached in Redis).
func (g *gw) exchange(ctx context.Context, pat string) (string, error) {
	sum := sha256.Sum256([]byte(pat))
	key := g.a.Keys.Of("pat", "jwt", hex.EncodeToString(sum[:]))
	if v, err := g.a.Redis.Get(ctx, key).Result(); err == nil && v != "" {
		return v, nil
	}
	if g.identity == nil {
		return "", problem.Internal()
	}
	var out struct {
		AccessToken string    `json:"accessToken"`
		ExpiresAt   time.Time `json:"expiresAt"`
	}
	if err := g.identity.Do(ctx, http.MethodPost, "/internal/tokens/intercambio", map[string]string{"token": pat}, &out); err != nil {
		return "", err
	}
	ttl := min(time.Until(out.ExpiresAt)-10*time.Second, time.Minute)
	if ttl > time.Second {
		_ = g.a.Redis.Set(ctx, key, out.AccessToken, ttl).Err()
	}
	return out.AccessToken, nil
}

// applyCORS sets CORS headers for allowed origins; returns true when it answered a preflight.
func (g *gw) applyCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" || !slices.Contains(g.cors, origin) {
		return false
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", origin)
	h.Set("Access-Control-Allow-Credentials", "true")
	h.Add("Vary", "Origin")
	if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match, Idempotency-Key, Last-Event-ID, Prefer, X-GrCup-Origen, X-Request-Id")
		h.Set("Access-Control-Expose-Headers", "ETag, Location, Retry-After, X-Request-Id")
		h.Set("Access-Control-Max-Age", "600")
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	h.Set("Access-Control-Expose-Headers", "ETag, Location, Retry-After, X-Request-Id")
	return false
}

func bearer(h string) string {
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

type svcHealth struct {
	Estado string `json:"estado"`
	MS     int64  `json:"ms"`
	Error  string `json:"error,omitempty"`
}

// health aggregates /readyz of every configured service.
func (g *gw) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	res := map[string]svcHealth{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	client := &http.Client{Timeout: 2500 * time.Millisecond}
	for name, u := range g.upstream {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start := time.Now()
			h := svcHealth{Estado: "ok"}
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.String()+"/readyz", nil)
			resp, err := client.Do(req)
			if err != nil {
				h.Estado, h.Error = "caido", "sin respuesta"
			} else {
				resp.Body.Close()
				if resp.StatusCode >= 300 {
					h.Estado, h.Error = "degradado", "estado "+strconv.Itoa(resp.StatusCode)
				}
			}
			h.MS = time.Since(start).Milliseconds()
			mu.Lock()
			res[name] = h
			mu.Unlock()
		}()
	}
	wg.Wait()
	estado := "ok"
	for _, h := range res {
		if h.Estado != "ok" {
			estado = "degradado"
		}
	}
	redisOK := g.a.Redis.Ping(ctx).Err() == nil
	if !redisOK {
		estado = "degradado"
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"estado": estado, "version": app.Version, "redis": redisOK, "servicios": res, "hora": time.Now().UTC()})
}

// openapi merges the OpenAPI documents of all services (cached 60 s). Internal paths are dropped.
func (g *gw) openapi(w http.ResponseWriter, r *http.Request) {
	g.specMu.Lock()
	defer g.specMu.Unlock()
	if g.spec == nil || time.Since(g.specTime) > time.Minute {
		g.spec = g.buildSpec(r.Context())
		g.specTime = time.Now()
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(g.spec)
}

func (g *gw) buildSpec(ctx context.Context) []byte {
	paths := map[string]json.RawMessage{}
	schemas := map[string]json.RawMessage{}
	var tags []json.RawMessage
	client := &http.Client{Timeout: 4 * time.Second}
	names := make([]string, 0, len(g.upstream))
	for n := range g.upstream {
		names = append(names, n)
	}
	slices.Sort(names)
	for _, name := range names {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, g.upstream[name].String()+"/openapi.json", nil)
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		var doc struct {
			Paths      map[string]json.RawMessage `json:"paths"`
			Tags       []json.RawMessage          `json:"tags"`
			Components struct {
				Schemas map[string]json.RawMessage `json:"schemas"`
			} `json:"components"`
		}
		err = json.NewDecoder(resp.Body).Decode(&doc)
		resp.Body.Close()
		if err != nil {
			continue
		}
		for p, v := range doc.Paths {
			if !strings.HasPrefix(p, "/internal/") {
				paths[p] = v
			}
		}
		for k, v := range doc.Components.Schemas {
			if _, dup := schemas[k]; !dup {
				schemas[k] = v
			}
		}
		tags = append(tags, doc.Tags...)
	}
	out, _ := json.Marshal(map[string]any{
		"openapi": "3.1.0",
		"info":    map[string]string{"title": "GR Cup Platform API", "version": app.Version},
		"servers": []map[string]string{{"url": "/"}},
		"paths":   paths,
		"tags":    tags,
		"components": map[string]any{
			"schemas":         schemas,
			"securitySchemes": map[string]any{"bearer": map[string]string{"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
		},
	})
	return out
}
