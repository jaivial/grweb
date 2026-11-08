// worker.go: the `juegos worker` subcommand (juegos-worker, contract §6.4 and §10). One replica runs the
// consumer of grcup:events (leader lock in Redis, SET NX PX with renewal) and applies the scoreboard at most
// once per second and jornada (debounce + coalescing). It also serves /healthz and /readyz for k8s probes.
package juegos

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
)

// tiposWorker is the event filter of the consumer (contract §6.4).
var tiposWorker = []string{
	"chat.hito", "donacion.confirmada", "donacion.reembolsada",
	"directo.intento", "directo.veredicto", "directo.correccion", "resultados.publicados",
}

// comandoWorker runs the consumer loop; no public API, only health probes on HTTP_ADDR.
func (s *Svc) comandoWorker(ctx context.Context, a *app.App, _ []string) error {
	s.init(a)
	sucias := &sucias{m: map[uuid.UUID]int{}}

	s.salud(ctx, a)            // /healthz + /readyz for the probes; it also starts the reconciler
	go s.lider(ctx, a, sucias) // one consumer at a time: the Redis lock decides who consumes
	s.despacho(ctx, sucias)    // blocks until ctx is cancelled
	return ctx.Err()
}

// sucias coalesces the live events of a competition: many events per second end in one scoreboard reload per
// jornada (contract §6.4: «como mucho una recarga por segundo y jornada»). The debounce loop polls every second.
type sucias struct {
	mu sync.Mutex
	m  map[uuid.UUID]int
}

func (x *sucias) marcar(cid uuid.UUID) {
	x.mu.Lock()
	if _, ok := x.m[cid]; !ok {
		x.m[cid] = 0
	}
	x.mu.Unlock()
}

// tomar returns and clears the pending competitions.
func (x *sucias) tomar() map[uuid.UUID]int {
	x.mu.Lock()
	defer x.mu.Unlock()
	out := x.m
	x.m = map[uuid.UUID]int{}
	return out
}

// manejarEvento processes one event of the stream. Rewards run here; live events only mark the competition
// dirty (the debounced reload does the heavy work).
func (s *Svc) manejarEvento(sucias *sucias) events.Handler {
	return func(ctx context.Context, e events.Event) error {
		cid, err := uuid.Parse(e.CompetitionID)
		if err != nil {
			return nil // event without competition: nothing to do
		}
		switch e.Type {
		case "chat.hito":
			return s.recompensaHito(ctx, cid, e.Data)
		case "donacion.confirmada":
			return s.recompensaDonacion(ctx, cid, e.Data)
		case "donacion.reembolsada":
			return s.reembolsoDonacion(ctx, cid, e.Data)
		default: // directo.intento | directo.veredicto | directo.correccion | resultados.publicados
			sucias.marcar(cid)
			return nil
		}
	}
}

// despacho is the debounce loop: every second it reloads the scoreboard of each pending competition and applies
// the diffs (idempotent). A failed sync retries on the next tick.
func (s *Svc) despacho(ctx context.Context, sucias *sucias) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		for cid, n := range sucias.tomar() {
			if err := s.sincronizarActiva(ctx, cid); err != nil {
				if ctx.Err() == nil {
					s.a.Log.Warn("sincronización del marcador", "cid", cid, "err", err)
					if n < 10 {
						sucias.marcar(cid) // retry on the next tick; the reconciler is the last resort
					}
				}
				continue
			}
			if j, err := s.jornadaActiva(ctx, s.a.DB, cid); err == nil && j != nil {
				s.eventoClasificacion(ctx, cid, j.ID)
			}
		}
	}
}

// sincronizarActiva applies the scoreboard to the active jornada of a competition (no active jornada: nothing).
func (s *Svc) sincronizarActiva(ctx context.Context, cid uuid.UUID) error {
	j, err := s.jornadaActiva(ctx, s.a.DB, cid)
	if err != nil || j == nil {
		return err
	}
	return s.sincronizar(ctx, cid, *j)
}

// jornadaActiva: dia = today (Europe/Madrid) with estado abierta or en_juego (contract §2).
func (s *Svc) jornadaActiva(ctx context.Context, q querier, cid uuid.UUID) (*jornada, error) {
	j, err := scanJornada(q.QueryRow(ctx, selJornada+` FROM jornadas
		WHERE competition_id = $1 AND estado IN ('abierta','en_juego') AND dia = (now() AT TIME ZONE 'Europe/Madrid')::date
		ORDER BY estado = 'en_juego' DESC LIMIT 1`, cid))
	if db.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// lider keeps the leader lock (SET NX PX 30 s, renewed with a token check): only the holder runs the consumer.
// Compatible with Redis 6.0 (no XAUTOCLAIM, no SET … GET).
func (s *Svc) lider(ctx context.Context, a *app.App, sucias *sucias) {
	k := a.Keys.Of("juegos", "worker", "lider")
	token := uuid.Must(uuid.NewV7()).String()
	liberar := redis.NewScript(`if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end`)
	renovar := redis.NewScript(`if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) end`)
	soy := false
	var consumir context.CancelFunc
	defer func() {
		if consumir != nil {
			consumir()
		}
		if soy {
			liberar.Run(context.Background(), a.Redis, []string{k}, token) //nolint:errcheck
		}
	}()
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if !soy {
			ok, err := a.Redis.SetNX(ctx, k, token, 30*time.Second).Result()
			if err == nil && ok {
				soy = true
				a.Log.Info("worker de juegos: lider adquirido")
				cctx, cancel := context.WithCancel(ctx)
				consumir = cancel
				go s.consumidor(cctx, a, sucias)
			}
			continue
		}
		n, err := renovar.Run(ctx, a.Redis, []string{k}, token, 30000).Int()
		if err != nil || n != 1 {
			soy = false
			if consumir != nil {
				consumir()
				consumir = nil
			}
			a.Log.Info("worker de juegos: lider perdido")
		}
	}
}

// consumidor reads the stream with group "juegos" and Start "$" (contract §1), idempotent via processed_events.
func (s *Svc) consumidor(ctx context.Context, a *app.App, sucias *sucias) {
	c := &events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: "juegos", Start: "$",
		Types: tiposWorker, Handle: s.manejarEvento(sucias), Log: a.Log}
	c.Run(ctx)
}

// reconciler re-syncs the active jornadas every 30 s: the safety net that also loads the athletes when a
// jornada opens (contract §6.3: alta desde el marcador al abrir la jornada o con «sincronizar atletas»).
func (s *Svc) reconciler(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		rows, err := s.a.DB.Query(ctx, selJornada+` FROM jornadas
			WHERE estado IN ('abierta','en_juego') AND dia = (now() AT TIME ZONE 'Europe/Madrid')::date`)
		if err != nil {
			continue
		}
		var js []jornada
		for rows.Next() {
			if j, err := scanJornada(rows); err == nil {
				js = append(js, j)
			}
		}
		rows.Close()
		for _, j := range js {
			if err := s.sincronizar(ctx, j.CompetitionID, j); err != nil && ctx.Err() == nil {
				s.a.Log.Warn("reconciliación del marcador", "cid", j.CompetitionID, "err", err)
			}
		}
	}
}

// salud serves /healthz and /readyz for the probes of the worker Deployment and starts the reconciler.
func (s *Svc) salud(ctx context.Context, a *app.App) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
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
		w.WriteHeader(http.StatusNoContent)
	})
	srv := &http.Server{Addr: a.Cfg.HTTPAddr, Handler: mux, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 120 * time.Second}
	go func() {
		a.Log.Info("worker de juegos: salud", "addr", a.Cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			a.Log.Warn("salud del worker", "err", err)
		}
	}()
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()
	go s.reconciler(ctx)
}
