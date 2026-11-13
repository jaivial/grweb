package chat

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
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

var bearer = []map[string][]string{{"bearer": {}}}

// tunables of the deployment (see the report: CHAT_MAX_CONEXIONES comes from deploy/k8s/generar.py).
const (
	envMaxConexiones  = "CHAT_MAX_CONEXIONES"
	defMaxConexiones  = 10000
	defWsIdleSegundos = 90 // a WS connection is closed when the client sends nothing for this long
	envOrigenes       = "CHAT_ORIGENES"
)

// Svc holds the service dependencies.
type Svc struct {
	a        *app.App
	comps    *compref.Resolver
	fans     fanauth.Verifier
	hub      *hub
	max      int64
	pod      string
	origenes []string
	ctxRaiz  context.Context // app-lifetime context for the room readers (not the request's)
}

// Service returns the chat service definition.
func Service() app.Service {
	s := &Svc{hub: &hub{salas: map[salaID]*sala{}, streams: map[string]struct{}{}}}
	return app.Service{Name: "chat", Title: "GR Cup · chat (directo social)", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, MaxConns: -1, Setup: s.setup}
}

func (s *Svc) setup(ctx context.Context, a *app.App) error {
	s.a = a
	s.hub.a = a // the hub is created before the app exists (Service); the rooms need it
	// key of the public pseudonyms of the fans (HMAC): the UUID of a fan never travels to the clients
	s.hub.claveFan = fanauth.Key(a.Cfg.InternalToken)
	s.ctxRaiz = ctx
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "chat", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	s.fans = fanauth.Verifier{Key: fanauth.Key(a.Cfg.InternalToken), Redis: a.Redis, Keys: a.Keys}
	s.max = int64(config.Int(envMaxConexiones, defMaxConexiones))
	s.pod, _ = os.Hostname()
	s.origenes = origenesWS()

	s.registrarPublico()
	s.registrarAdmin()
	s.registrarMetricas()

	a.Go(s.presencia) // pods set + per-pod counter + estado frame every 10 s
	a.Go(func(c context.Context) { s.hub.gc(c) })
	a.Go(s.persistir) // consumer group chat-persistir: stream → tabla mensajes (lotes)
	a.Go(s.eventos)   // grcup:events: donacion.confirmada, patrocinio.banner, fans.baneado
	return nil
}

// ---- room helpers ----

// madrid is the competition time zone: the day of the room (§2) is today in Europe/Madrid.
var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// hoy is the day of the active room.
func hoy() string { return time.Now().In(madrid).Format("2006-01-02") }

// diaValido reports whether s looks like a date (the ?dia= history parameter).
func diaValido(s string) bool {
	_, err := time.ParseInLocation("2006-01-02", s, madrid)
	return err == nil && len(s) == 10
}

func boolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// streamDe names the room stream of a competition and day.
func (s *Svc) streamDe(cid, dia string) string { return s.a.Keys.Of("chat", "sala", cid, dia) }

// inyectar adds an item to a room stream without waking the room on this pod: the pods with subscribers have
// the room open and their readers fan it out locally.
func (s *Svc) inyectar(ctx context.Context, cid, dia string, it item) error {
	b, err := json.Marshal(it)
	if err != nil {
		return err
	}
	nombre := s.streamDe(cid, dia)
	if err := s.a.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: nombre,
		MaxLen: 5000,
		Approx: true,
		Values: map[string]any{"d": string(b)},
	}).Err(); err != nil {
		return err
	}
	s.anotarStream(ctx, nombre)
	return nil
}

// streamsActivosTTL is how long a room stream stays in the shared registry after its last entry.
const streamsActivosTTL = 48 * time.Hour

// anotarStream records the room stream in the shared registry (ZSET scored by last write), so every pod's
// persister reads it even when no pod has a viewer connected to that room.
func (s *Svc) anotarStream(ctx context.Context, nombre string) {
	if err := s.a.Redis.ZAdd(ctx, s.a.Keys.Of("chat", "streams"), redis.Z{Score: float64(time.Now().UnixMilli()), Member: nombre}).Err(); err != nil {
		s.a.Log.Warn("chat registro de streams", "stream", nombre, "err", err)
	}
}

// streamsActivos merges the rooms this pod has open with the shared registry of rooms written in the last 48 h.
func (s *Svc) streamsActivos(ctx context.Context) []string {
	nombres := s.hub.nombresStreams()
	clave := s.a.Keys.Of("chat", "streams")
	desde := time.Now().Add(-streamsActivosTTL).UnixMilli()
	_ = s.a.Redis.ZRemRangeByScore(ctx, clave, "-inf", "("+strconv.FormatInt(desde, 10)).Err()
	reg, err := s.a.Redis.ZRangeByScore(ctx, clave, &redis.ZRangeBy{Min: strconv.FormatInt(desde, 10), Max: "+inf"}).Result()
	if err != nil {
		return nombres
	}
	vistos := make(map[string]struct{}, len(nombres)+len(reg))
	for _, n := range nombres {
		vistos[n] = struct{}{}
	}
	for _, n := range reg {
		if _, ok := vistos[n]; !ok {
			vistos[n] = struct{}{}
			nombres = append(nombres, n)
		}
	}
	return nombres
}

// ---- config (room configuration cache: the hot path must not read PostgreSQL) ----

type cfgEntry struct {
	c   Config
	exp time.Time
}

var cfgMu sync.Mutex
var cfgCache = map[uuid.UUID]cfgEntry{}

const cfgTTL = 5 * time.Second

// configDe returns the room configuration of a competition: DB → Redis copy → defaults, cached in-process for
// 5 s. The PUT admin endpoint writes the DB and refreshes the Redis copy, so other pods see it within one TTL.
func (s *Svc) configDe(ctx context.Context, cid uuid.UUID) Config {
	cfgMu.Lock()
	if e, ok := cfgCache[cid]; ok && time.Now().Before(e.exp) {
		cfgMu.Unlock()
		return e.c
	}
	cfgMu.Unlock()

	cfg := configPorDefecto()
	key := s.a.Keys.Of("chat", "cfg", cid.String())
	if raw, err := s.a.Redis.Get(ctx, key).Result(); err == nil {
		if json.Unmarshal([]byte(raw), &cfg) == nil {
			if cfg.MaxHitos <= 0 {
				cfg.MaxHitos = 100
			}
		} else {
			cfg = configPorDefecto()
		}
	} else if s.a.DB != nil {
		var row struct {
			Activo             bool     `db:"activo"`
			ModoLentoSeg       int      `db:"modo_lento_seg"`
			PalabrasProhibidas []string `db:"palabras_prohibidas"`
			DominiosPermitidos []string `db:"dominios_permitidos"`
			MaxHitos           int      `db:"max_hitos"`
		}
		if err := s.a.DB.QueryRow(ctx, `SELECT activo, modo_lento_seg, palabras_prohibidas, dominios_permitidos, max_hitos FROM config_chat WHERE competition_id = $1`, cid).Scan(
			&row.Activo, &row.ModoLentoSeg, &row.PalabrasProhibidas, &row.DominiosPermitidos, &row.MaxHitos); err == nil {
			cfg = Config{Activo: row.Activo, ModoLentoSeg: row.ModoLentoSeg, PalabrasProhibidas: row.PalabrasProhibidas, DominiosPermitidos: row.DominiosPermitidos, MaxHitos: row.MaxHitos}
		} // no row yet: defaults
		if b, err := json.Marshal(cfg); err == nil {
			s.a.Redis.Set(ctx, key, string(b), time.Hour)
		}
	}

	cfgMu.Lock()
	cfgCache[cid] = cfgEntry{c: cfg, exp: time.Now().Add(cfgTTL)}
	cfgMu.Unlock()
	return cfg
}

// configRefrescar rewrites the Redis copy after an admin PUT (errors ignored: the TTL heals it).
func (s *Svc) configRefrescar(ctx context.Context, cid uuid.UUID, cfg Config) {
	if b, err := json.Marshal(cfg); err == nil {
		_ = s.a.Redis.Set(ctx, s.a.Keys.Of("chat", "cfg", cid.String()), string(b), time.Hour).Err()
	}
	cfgMu.Lock()
	cfgCache[cid] = cfgEntry{c: cfg, exp: time.Now().Add(cfgTTL)}
	cfgMu.Unlock()
}

// ---- presence (the realtime pattern: one counter per pod with expiry + the set of pods) ----

// presencia reports this pod's connections per competition every 10 s (25 s expiry: a dead pod stops counting
// within 2 missed ticks, and its member is pruned from the set once its counter has expired)
// and publishes the estado frame with the sum of pods to the local subscribers of each active room.
func (s *Svc) presencia(ctx context.Context) {
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for {
		for _, sl := range s.hub.salasVivas() {
			n := int64(sl.nsubs())
			cid := sl.id.cid
			pods := s.a.Keys.Of("chat", "pods", cid)
			p := s.a.Redis.TxPipeline()
			p.Set(ctx, s.a.Keys.Of("chat", "conex", cid, s.pod), n, 25*time.Second)
			p.SAdd(ctx, pods, s.pod)
			p.Expire(ctx, pods, 10*time.Minute)
			if _, err := p.Exec(ctx); err != nil {
				s.a.Log.Warn("chat presencia", "err", err)
				continue
			}
			// total = the sum of the pods' counters (SMEMBERS + MGET, never SCAN on the shared Redis)
			members, err := s.a.Redis.SMembers(ctx, pods).Result()
			total := n
			if err == nil && len(members) > 0 {
				claves := make([]string, 0, len(members))
				for _, m := range members {
					claves = append(claves, s.a.Keys.Of("chat", "conex", cid, m))
				}
				valores, err := s.a.Redis.MGet(ctx, claves...).Result()
				if err == nil {
					total = 0
					for i, v := range valores {
						if v == nil && members[i] != s.pod {
							s.a.Redis.SRem(ctx, pods, members[i]) // dead pod: its counter expired
							continue
						}
						if str, ok := v.(string); ok {
							var x int64
							if _, err := fmt.Sscanf(str, "%d", &x); err == nil {
								total += x
							}
						}
					}
				}
			}
			// local-only frame: every pod publishes the same total, the stream stays clean of noise
			sl.publicar(item{T: "estado", Conectados: total, Dia: sl.id.dia, Ts: time.Now().UnixMilli()})
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// origenesWS is the whitelist of Origin hosts accepted in the WebSocket handshake. The gateway rewrites the Host
// (chat:8080), so the browser's Origin can never match it and has to be checked against this list. InsecureSkipVerify
// is NOT an option: the chat authenticates with the cookie of the fan and skipping the check would open the door to
// CSWSH.
// CHAT_ORIGENES (comma separated) has priority; by default the host of PUBLIC_WEB_URL, plus localhost:* and
// 127.0.0.1:* only in dev.
func origenesWS() []string {
	var out []string
	if v := config.Str(envOrigenes, ""); v != "" {
		for _, o := range strings.Split(v, ",") {
			if o = strings.TrimSpace(o); o != "" {
				out = append(out, o)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	if web := config.Str("PUBLIC_WEB_URL", "http://localhost:4200"); web != "" {
		if u, err := url.Parse(web); err == nil && u.Host != "" {
			out = append(out, u.Host, u.Host+":*")
		}
	}
	if config.Str("SERVICE_ENV", "dev") == "dev" {
		out = append(out, "localhost:*", "127.0.0.1:*")
	}
	return out
}

// ---- metrics (counters exposed at /metrics/chat; HTTP request metrics come from a.Metrics) ----

var (
	conexActivas     atomic.Int64 // open WS+SSE connections on this pod
	mensajesEnviados atomic.Int64 // items XADDed to room streams
	hitosTotal       atomic.Int64 // chat.hito milestones emitted
	lentasTotal      atomic.Int64 // subscribers dropped for being slow
	persistPend      atomic.Int64 // items waiting in the persistence batch
	persistLotes     atomic.Int64 // batches written to PostgreSQL
)

func (s *Svc) registrarMetricas() {
	s.a.Mux.Handle("GET /metrics/chat", internoChat(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = fmt.Fprintf(w, "# TYPE grcup_chat_conexiones gauge\ngrcup_chat_conexiones{pod=%q} %d\n", s.pod, conexActivas.Load())
		_, _ = fmt.Fprintf(w, "# TYPE grcup_chat_mensajes_total counter\ngrcup_chat_mensajes_total %d\n", mensajesEnviados.Load())
		_, _ = fmt.Fprintf(w, "# TYPE grcup_chat_hitos_total counter\ngrcup_chat_hitos_total %d\n", hitosTotal.Load())
		_, _ = fmt.Fprintf(w, "# TYPE grcup_chat_desconexiones_lentas_total counter\ngrcup_chat_desconexiones_lentas_total %d\n", lentasTotal.Load())
		_, _ = fmt.Fprintf(w, "# TYPE grcup_chat_persistencia_pendientes gauge\ngrcup_chat_persistencia_pendientes %d\n", persistPend.Load())
		_, _ = fmt.Fprintf(w, "# TYPE grcup_chat_persistencia_lotes_total counter\ngrcup_chat_persistencia_lotes_total %d\n", persistLotes.Load())
	})))
}

// internoChat mirrors pkg/app.interno: only in-cluster callers (the host nginx always adds X-Forwarded-For).
func internoChat(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Real-IP") != "" {
			http.NotFound(w, r)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// ---- small shared helpers ----

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func writeErr(w http.ResponseWriter, err error) {
	var p *problem.Error
	if errors.As(err, &p) {
		problem.Write(w, p)
		return
	}
	slog.Error("chat", "err", err)
	problem.Write(w, problem.New(http.StatusBadGateway, "SERVICIO_NO_DISPONIBLE", "El chat no está disponible ahora mismo. Inténtalo en unos segundos."))
}

// tsDeID returns the unix millis encoded in a Redis stream id («1710000000000-0»).
func tsDeID(id string) int64 {
	var ms int64
	if _, err := fmt.Sscanf(id, "%d", &ms); err != nil {
		return 0
	}
	return ms
}
