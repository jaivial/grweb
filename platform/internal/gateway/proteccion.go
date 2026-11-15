package gateway

// Protección ante sobrecarga (perf-20261115, informe §3): sala de espera por competición, límite de peticiones en
// vuelo por upstream, circuit breaker por upstream y señal de presión para que los servicios se degraden.
//
//   - Admisión: un fan (token X-GrCup-Fan / cookie) cuenta como activo durante ADMISION_TTL_SEG desde su última
//     petición. Con ADMISION_MAX activos en su competición, un fan nuevo recibe 503 EN_COLA con su posición
//     (orden de llegada) y Retry-After; la web enseña «estás en cola» y reintenta. Los ya admitidos, el
//     backoffice (Bearer) y los anónimos no hacen cola. ADMISION_MAX=0 lo apaga.
//   - Límite por upstream: UPSTREAM_MAX_INFLIGHT peticiones REST en vuelo por servicio y réplica; por encima,
//     503 SERVICIO_SATURADO inmediato (Retry-After 2) en vez de encolar sin fin hasta el timeout.
//   - Circuit breaker: BREAKER_FALLOS fallos seguidos (error de transporte, 502/504) abren el circuito
//     BREAKER_SEG; luego deja pasar una petición de prueba (half-open).
//   - Presión: cualquier rechazo por saturación o cola escribe <prefix>gw:presion (TTL 30 s); chat la lee y
//     activa el modo lento.

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

type proteccion struct {
	rdb  *redis.Client
	keys func(...string) string
	key  []byte // fanauth key (signature check only; services still verify revocation)

	admMax int64
	admTTL time.Duration
	memoMu sync.Mutex
	memo   map[uuid.UUID]time.Time // fans admitted on this replica (skip Redis until exp)

	inflightMax int64
	inflight    map[string]*atomic.Int64
	breakers    map[string]*breaker

	presionHasta atomic.Int64 // unix ms of the last write of the pressure key (debounce)
}

// PresionKey is the Redis key of the pressure signal (shared with chat).
func PresionKey(keys func(...string) string) string { return keys("gw", "presion") }

func nuevaProteccion(rdb *redis.Client, keys func(...string) string, internalSecret string, servicios []string) *proteccion {
	p := &proteccion{
		rdb: rdb, keys: keys, key: fanauth.Key(internalSecret),
		admMax:      int64(config.Int("ADMISION_MAX", 0)),
		admTTL:      time.Duration(max(config.Int("ADMISION_TTL_SEG", 60), 10)) * time.Second,
		memo:        map[uuid.UUID]time.Time{},
		inflightMax: int64(config.Int("UPSTREAM_MAX_INFLIGHT", 256)),
		inflight:    map[string]*atomic.Int64{},
		breakers:    map[string]*breaker{},
	}
	fallos := max(config.Int("BREAKER_FALLOS", 5), 1)
	abierto := time.Duration(max(config.Int("BREAKER_SEG", 5), 1)) * time.Second
	for _, s := range servicios {
		p.inflight[s] = &atomic.Int64{}
		p.breakers[s] = &breaker{umbral: fallos, abierto: abierto}
	}
	return p
}

// admision: KEYS activos, cola, colaVivos; ARGV now_ms, ttl_ms, max, fan. Returns {0} admitted, {1, pos} queued.
// The queue keeps the arrival order (score = join time); a queued fan that stops polling for 30 s leaves it.
var admision = redis.NewScript(`local now = tonumber(ARGV[1])
local mx = tonumber(ARGV[3])
local fan = ARGV[4]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[2]))
local muertos = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now - 30000, 'LIMIT', 0, 200)
for _, m in ipairs(muertos) do redis.call('ZREM', KEYS[2], m); redis.call('ZREM', KEYS[3], m) end
if redis.call('ZSCORE', KEYS[1], fan) then
  redis.call('ZADD', KEYS[1], now, fan)
  return {0, 0}
end
local libres = mx - redis.call('ZCARD', KEYS[1])
local r = redis.call('ZRANK', KEYS[2], fan)
if libres > 0 and ((r and r < libres) or (not r and redis.call('ZCARD', KEYS[2]) < libres)) then
  redis.call('ZADD', KEYS[1], now, fan)
  redis.call('ZREM', KEYS[2], fan)
  redis.call('ZREM', KEYS[3], fan)
  return {0, 0}
end
if not r then
  redis.call('ZADD', KEYS[2], now, fan)
  r = redis.call('ZCARD', KEYS[2]) - 1
end
redis.call('ZADD', KEYS[3], now, fan)
redis.call('PEXPIRE', KEYS[2], 600000)
redis.call('PEXPIRE', KEYS[3], 600000)
return {1, r - math.max(libres, 0) + 1}`)

// admitir decides whether the request of a fan enters. ok=false means it was answered (503 EN_COLA).
func (p *proteccion) admitir(ctx context.Context, w http.ResponseWriter, r *http.Request) bool {
	if p.admMax <= 0 || p.rdb == nil {
		return true
	}
	tok := ""
	if c, err := r.Cookie(fanauth.Cookie); err == nil {
		tok = c.Value
	}
	if tok == "" {
		tok = r.Header.Get("X-GrCup-Fan")
	}
	if tok == "" {
		return true // anonymous reads and the backoffice never queue
	}
	f, err := fanauth.Parse(p.key, tok)
	if err != nil {
		return true // the service answers 401
	}
	now := time.Now()
	p.memoMu.Lock()
	exp, ok := p.memo[f.ID]
	p.memoMu.Unlock()
	if ok && now.Before(exp) {
		return true
	}
	cid := f.CompetitionID.String()
	v, err := admision.Run(ctx, p.rdb, []string{p.keys("gw", "adm", cid), p.keys("gw", "cola", cid), p.keys("gw", "colavivos", cid)},
		now.UnixMilli(), p.admTTL.Milliseconds(), p.admMax, f.ID.String()).Int64Slice()
	if err != nil || len(v) != 2 {
		return true // Redis down: fail open, like the rate limit
	}
	if v[0] == 0 {
		// re-check in Redis after a third of the TTL (keeps the fan active there while it keeps calling)
		p.memoMu.Lock()
		if len(p.memo) > 100_000 {
			p.memo = map[uuid.UUID]time.Time{}
		}
		p.memo[f.ID] = now.Add(p.admTTL / 3)
		p.memoMu.Unlock()
		return true
	}
	colasTotal.Add(1)
	p.marcarPresion(ctx)
	espera := min(5+v[1]/50, 30)
	w.Header().Set("Retry-After", strconv.FormatInt(espera, 10))
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = fmt.Fprintf(w, `{"title":"Service Unavailable","status":503,"code":"EN_COLA","detail":"Hay mucha gente conectada. Estás en la cola: entrarás en cuanto quede sitio.","posicion":%d,"reintentarEn":%d}`, v[1], espera)
	return false
}

// entrar takes an in-flight slot of svc and checks its breaker. ok=false means it was answered (503).
func (p *proteccion) entrar(ctx context.Context, w http.ResponseWriter, svc string) (salir func(status int), ok bool) {
	b, c := p.breakers[svc], p.inflight[svc]
	if b == nil || c == nil {
		return func(int) {}, true
	}
	if !b.permitir() {
		w.Header().Set("Retry-After", strconv.Itoa(int(b.abierto.Seconds())))
		problem.Write(w, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "El servicio "+svc+" no responde. Inténtalo en unos segundos."))
		return nil, false
	}
	if c.Add(1) > p.inflightMax {
		c.Add(-1)
		b.soltar()
		saturadasTotal.Add(1)
		p.marcarPresion(ctx)
		w.Header().Set("Retry-After", "2")
		problem.Write(w, problem.New(http.StatusServiceUnavailable, "SERVICIO_SATURADO", "Hay mucha demanda ahora mismo. Inténtalo en unos segundos."))
		return nil, false
	}
	return func(status int) {
		c.Add(-1)
		b.resultado(status == http.StatusBadGateway || status == http.StatusGatewayTimeout)
	}, true
}

// marcarPresion writes the pressure key at most once every 5 s per replica.
func (p *proteccion) marcarPresion(ctx context.Context) {
	now := time.Now().UnixMilli()
	last := p.presionHasta.Load()
	if now-last < 5000 || !p.presionHasta.CompareAndSwap(last, now) || p.rdb == nil {
		return
	}
	_ = p.rdb.Set(ctx, PresionKey(p.keys), now, 30*time.Second).Err()
}

// breaker is a consecutive-failure circuit breaker (closed → open for `abierto` → half-open with one probe).
type breaker struct {
	mu        sync.Mutex
	umbral    int
	abierto   time.Duration
	fallos    int
	hasta     time.Time
	sondeando bool
}

func (b *breaker) permitir() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.fallos < b.umbral {
		return true
	}
	if time.Now().Before(b.hasta) || b.sondeando {
		return false
	}
	b.sondeando = true // half-open: this request is the probe
	return true
}

// soltar releases a probe that never reached the upstream.
func (b *breaker) soltar() {
	b.mu.Lock()
	b.sondeando = false
	b.mu.Unlock()
}

func (b *breaker) resultado(fallo bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.sondeando = false
	if !fallo {
		b.fallos = 0
		return
	}
	b.fallos++
	if b.fallos >= b.umbral {
		if b.fallos == b.umbral {
			breakersAbiertos.Add(1)
		}
		b.hasta = time.Now().Add(b.abierto)
	}
}

var colasTotal, saturadasTotal, breakersAbiertos atomic.Int64

// estadoW records the status the proxy wrote (for the breaker).
type estadoW struct {
	http.ResponseWriter
	status int
}

func (e *estadoW) WriteHeader(c int) {
	if e.status == 0 {
		e.status = c
	}
	e.ResponseWriter.WriteHeader(c)
}

func (e *estadoW) Write(b []byte) (int, error) {
	if e.status == 0 {
		e.status = http.StatusOK
	}
	return e.ResponseWriter.Write(b)
}

// Flush keeps streaming responses working through the wrapper.
func (e *estadoW) Flush() {
	if f, ok := e.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (e *estadoW) Unwrap() http.ResponseWriter { return e.ResponseWriter }
