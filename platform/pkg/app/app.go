// Package app is the common bootstrap of every service: config, logging, PostgreSQL + migrations,
// Redis, huma API with problem errors, auth middleware, outbox relay, health probes and graceful shutdown.
//
// Subcommands: `serve` (default), `migrate`, plus any service-specific ones.
package app

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/net/netutil"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/redisx"
)

// Version is set at build time (-ldflags "-X …/pkg/app.Version=<sha>").
var Version = "dev"

// Service describes one microservice.
type Service struct {
	Name       string
	Title      string                                                            // OpenAPI title
	Migrations fs.FS                                                             // service migrations (nil = only platform tables)
	NeedsDB    bool                                                              // connect to PostgreSQL
	NeedsRedis bool                                                              // connect to Redis (required if NeedsDB: outbox relay)
	Setup      func(ctx context.Context, a *App) error                           // register routes and background workers
	Commands   map[string]func(ctx context.Context, a *App, args []string) error // extra subcommands
	Offline    []string                                                          // subcommands that need neither PostgreSQL nor Redis
	BodyLimit  int64                                                             // default 1 MiB
	// BodyLimitFor raises the limit for specific requests (e.g. media uploads); 0 keeps BodyLimit.
	BodyLimitFor func(*http.Request) int64
	Middlewares  []httpx.Middleware // service-specific, inside the common chain
	// MaxConns caps the open connections (0 = 512, <0 = no cap: gateway and streaming services hold one per client).
	// Under a flood the CPU-throttled pod accepts faster than it answers: crm piled up 6000 sockets (~16 KB of
	// heap each) and was OOMKilled. Beyond the cap the kernel keeps them in the accept queue, outside the pod's memory.
	MaxConns int
}

// App is what a service receives in Setup.
type App struct {
	Cfg      config.Common
	Log      *slog.Logger
	DB       *pgxpool.Pool
	Redis    *redis.Client
	Keys     redisx.Keys
	Mux      *http.ServeMux
	API      huma.API
	Verifier *auth.Verifier // replace in Setup (identity uses its own keys)
	Metrics  *httpx.Metrics
	Ready    []func(ctx context.Context) error

	wg      sync.WaitGroup
	workers []func(ctx context.Context)
}

// Go registers a background worker started with the server and stopped on shutdown.
func (a *App) Go(fn func(ctx context.Context)) { a.workers = append(a.workers, fn) }

// Emitter returns the Redis Stream name for events.
func (a *App) Stream() string { return a.Keys.Events() }

// Run executes the requested subcommand and exits.
func Run(s Service) {
	cfg := config.Load(s.Name)
	log := newLogger(cfg)
	slog.SetDefault(log)
	problem.Install()
	events.SetSource(s.Name)
	// QA simulations are never allowed in production: a copied QA configuration must not take fake payments.
	if cfg.Env == "prod" && (config.Bool("PAGOS_SIMULADOS", false) || config.Bool("WHATSAPP_SIMULADO", false)) {
		log.Error("arranque", "err", "PAGOS_SIMULADOS o WHATSAPP_SIMULADO activos con SERVICE_ENV=prod: configuración de QA en producción")
		os.Exit(1)
	}

	cmd := "serve"
	args := os.Args[1:]
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	a := &App{Cfg: cfg, Log: log, Keys: redisx.Keys(cfg.KeyPrefix)}
	if slices.Contains(s.Offline, cmd) {
		s.NeedsDB, s.NeedsRedis = false, false
	}
	if err := a.connect(ctx, s, cmd); err != nil {
		log.Error("arranque", "err", err)
		os.Exit(1)
	}
	defer a.close()

	var err error
	switch cmd {
	case "migrate":
		err = db.Migrate(ctx, a.DB, s.Migrations, log)
	case "serve":
		err = a.serve(ctx, s)
	default:
		fn, ok := s.Commands[cmd]
		if !ok {
			names := []string{"serve", "migrate"}
			for k := range s.Commands {
				names = append(names, k)
			}
			sort.Strings(names[2:])
			err = fmt.Errorf("subcomando desconocido %q (disponibles: %v)", cmd, names)
			break
		}
		err = fn(ctx, a, args)
	}
	if err != nil {
		log.Error(cmd, "err", err)
		a.close()
		os.Exit(1)
	}
}

func newLogger(cfg config.Common) *slog.Logger {
	lvl := slog.LevelInfo
	_ = lvl.UnmarshalText([]byte(cfg.LogLevel))
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})).With("svc", cfg.Service, "version", Version)
}

func (a *App) connect(ctx context.Context, s Service, cmd string) error {
	if s.NeedsDB {
		if a.Cfg.DatabaseURL == "" {
			return errors.New("falta DATABASE_URL")
		}
		pool, err := db.Connect(ctx, a.Cfg.DatabaseURL)
		if err != nil {
			return err
		}
		a.DB = pool
	}
	if (s.NeedsRedis || s.NeedsDB) && cmd != "migrate" {
		if a.Cfg.RedisAddr == "" {
			return errors.New("falta REDIS_ADDR")
		}
		rdb, err := redisx.Connect(ctx, redisx.Options{Addr: a.Cfg.RedisAddr, Username: a.Cfg.RedisUser, Password: a.Cfg.RedisPassword, DB: a.Cfg.RedisDB})
		if err != nil {
			return err
		}
		a.Redis = rdb
	}
	return nil
}

func (a *App) close() {
	if a.DB != nil {
		a.DB.Close()
		a.DB = nil
	}
	if a.Redis != nil {
		_ = a.Redis.Close()
		a.Redis = nil
	}
}

func (a *App) serve(ctx context.Context, s Service) error {
	if a.DB != nil && a.Cfg.AutoMigrate {
		if err := db.Migrate(ctx, a.DB, s.Migrations, a.Log); err != nil {
			return err
		}
	}
	a.Mux = http.NewServeMux()
	hc := huma.DefaultConfig(s.Title, Version)
	hc.CreateHooks = nil // no $schema links in responses
	hc.OpenAPIPath = "/openapi"
	hc.DocsPath = "/docs"
	hc.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"bearer": {Type: "http", Scheme: "bearer", BearerFormat: "JWT"},
	}
	a.API = humago.New(a.Mux, hc)
	// Admin operations answer 401 before huma validates the body (an anonymous caller must not learn the schema).
	a.API.UseMiddleware(func(hctx huma.Context, next func(huma.Context)) {
		if op := hctx.Operation(); op != nil && len(op.Security) > 0 && strings.HasPrefix(op.Path, "/api/admin/") {
			if _, err := auth.User(hctx.Context()); err != nil {
				_, w := humago.Unwrap(hctx)
				var pe *problem.Error
				if !errors.As(err, &pe) {
					pe = problem.Unauthorized("NO_AUTENTICADO", "Inicia sesión para continuar.")
				}
				problem.Write(w, pe)
				return
			}
		}
		next(hctx)
	})
	a.Verifier = auth.NewVerifier(a.Cfg.JWKSURL, a.Cfg.JWTIssuer, s.Name, a.Cfg.InternalToken, nil)
	if a.Redis != nil {
		a.Verifier.WithRevocation(a.Redis, a.Keys)
	}

	// Also on the main port: audit's «Salud» calls /readyz through the Service.
	a.Mux.HandleFunc("GET /healthz", healthz)
	a.Mux.HandleFunc("GET /readyz", a.readyz)
	// Observability (internal port only: the gateway proxies /api): Prometheus text and a summary for «Salud».
	a.Metrics = httpx.NewMetrics()
	a.Mux.Handle("GET /metrics", interno(a.Metrics.Handler(s.Name)))
	a.Mux.Handle("GET /metrics/resumen", interno(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		p95, n := a.Metrics.P95()
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"p95":%g,"peticiones":%d}`, p95, n)
	})))

	if s.Setup != nil {
		if err := s.Setup(ctx, a); err != nil {
			return err
		}
	}
	if a.DB != nil && a.Redis != nil {
		relay := &events.Relay{DB: a.DB, Redis: a.Redis, Stream: a.Stream(), Log: a.Log}
		a.Go(relay.Run)
	}

	limit := s.BodyLimit
	if limit == 0 {
		limit = 1 << 20
	}
	mws := []httpx.Middleware{httpx.RequestID, httpx.Recover(a.Log), httpx.Logger(a.Log), httpx.MaxBodyFor(limit, s.BodyLimitFor), httpx.RejectNUL, auth.Middleware(a.Verifier)}
	mws = append(mws, s.Middlewares...)
	mws = append(mws, a.Metrics.Middleware) // it sees the route pattern the mux matched
	mws = append(mws, httpx.LimpiaMultipart) // innermost: same *http.Request huma parses the multipart on
	srv := &http.Server{
		Addr:              a.Cfg.HTTPAddr,
		Handler:           httpx.Chain(a.Mux, mws...),
		ReadHeaderTimeout: 10 * time.Second,
		MaxHeaderBytes:    64 << 10,
		IdleTimeout:       120 * time.Second,
	}

	wctx, cancelWorkers := context.WithCancel(ctx)
	for _, w := range a.workers {
		a.wg.Add(1)
		go func() { defer a.wg.Done(); w(wctx) }()
	}
	errc := make(chan error, 1)
	go func() {
		a.Log.Info("escuchando", "addr", a.Cfg.HTTPAddr, "env", a.Cfg.Env)
		ln, err := httpx.Listen(ctx, a.Cfg.HTTPAddr)
		if err != nil {
			errc <- err
			return
		}
		switch {
		case s.MaxConns == 0:
			ln = netutil.LimitListener(ln, 512)
		case s.MaxConns > 0:
			ln = netutil.LimitListener(ln, s.MaxConns)
		}
		errc <- srv.Serve(ln)
	}()
	// Probes on their own listener: under a flood the main one sits at its LimitListener cap and the kubelet's
	// 1 s probes timed out (crm restarted by liveness, 0/1 Ready).
	var hsrv *http.Server
	if a.Cfg.HealthAddr != "" {
		hm := http.NewServeMux()
		hm.HandleFunc("GET /healthz", healthz)
		hm.HandleFunc("GET /readyz", a.readyz)
		hsrv = &http.Server{Addr: a.Cfg.HealthAddr, Handler: hm, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
		go func() {
			if err := hsrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				errc <- fmt.Errorf("salud %s: %w", a.Cfg.HealthAddr, err)
			}
		}()
	}
	select {
	case err := <-errc:
		cancelWorkers()
		if hsrv != nil {
			_ = hsrv.Close()
		}
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		a.Log.Info("apagando")
		sctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
		if hsrv != nil {
			_ = hsrv.Shutdown(sctx)
		}
		cancelWorkers()
	}
	a.wg.Wait()
	return nil
}

func healthz(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }

// interno only serves in-cluster callers: the host nginx in front of the gateway always adds X-Forwarded-For and
// X-Real-IP, so a request carrying them came from the internet (the gateway runs on this same package).
func interno(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Real-IP") != "" {
			http.NotFound(w, r)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func (a *App) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if a.DB != nil {
		if err := a.DB.Ping(ctx); err != nil {
			http.Error(w, "postgres: "+err.Error(), http.StatusServiceUnavailable)
			return
		}
	}
	if a.Redis != nil {
		if err := a.Redis.Ping(ctx).Err(); err != nil {
			http.Error(w, "redis: "+err.Error(), http.StatusServiceUnavailable)
			return
		}
	}
	for _, f := range a.Ready {
		if err := f(ctx); err != nil {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
