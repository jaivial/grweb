package chat

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// Límites por fan (§4): 1 mensaje cada 2 s con ráfaga de 5 (cubeta de tokens en Redis).
const (
	rateCoste     = 1.0
	ratePorMs     = 0.0005 // un token cada 2 s (en tokens por milisegundo)
	rateCapacidad = 5
	rateTTL       = 30 * time.Second
	dedupTTL      = 60 * time.Second
	prevTTL       = 10 * time.Minute
	mudTTLMax     = 7 * 24 * time.Hour
)

// cubeta is the token bucket script (Redis 6.0 compatible: HMGET/HSET/PEXPIRE).
var cubeta = redis.NewScript(`local st = redis.call('HMGET', KEYS[1], 't', 'b')
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cap = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local t = tonumber(st[1]) or now
local b = tonumber(st[2]) or cap
b = math.min(cap, b + (now - t) * rate)
if b < cost then
  redis.call('HSET', KEYS[1], 't', now, 'b', b)
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return {0, math.ceil((cost - b) / rate * 1000)}
end
b = b - cost
redis.call('HSET', KEYS[1], 't', now, 'b', b)
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return {1, 0}`)

var (
	errSalaInactiva = problem.Conflict("SALA_INACTIVA", "El chat está cerrado para esta competición.")
	errSilenciado   = problem.Forbidden("Un moderador te ha silenciado temporalmente.")
	errDuplicado    = errors.New("mensaje duplicado")
)

// enviar is the hot path shared by WS and REST (§4): validar → límites en Redis → XADD MAXLEN ~ 5000 → responder.
// PostgreSQL is only touched for the (infrequent) milestone events.
func (s *Svc) enviar(ctx context.Context, cid uuid.UUID, dia string, f fanauth.Fan, texto, msgCID string) (item, error) {
	cfg := s.configDe(ctx, cid)
	if !cfg.Activo {
		return item{}, errSalaInactiva
	}
	if res := filtrar(texto, cfg); !res.OK {
		return item{}, problem.Unprocessable(res.Code, res.Detalle)
	}
	if silenciado, err := s.a.Redis.Exists(ctx, s.a.Keys.Of("chat", "mudo", cid.String(), f.ID.String())).Result(); err == nil && silenciado > 0 {
		return item{}, errSilenciado
	}

	// ráfaga + ritmo por fan; if Redis fails the message goes through (fail-open, like pkg/ratelimit)
	espera, err := cubeta.Run(ctx, s.a.Redis, []string{s.a.Keys.Of("chat", "rate", cid.String(), f.ID.String())},
		time.Now().UnixMilli(), ratePorMs, rateCapacidad, rateCoste, rateTTL.Milliseconds()).Int64Slice()
	if err == nil && len(espera) == 2 && espera[0] == 0 {
		return item{}, problem.TooMany("Vas muy rápido. Espera unos segundos.")
	}
	if cfg.ModoLentoSeg > 0 {
		if r, err := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("chat", "lento", cid.String(), f.ID.String()), 1, time.Duration(cfg.ModoLentoSeg)*time.Second); err == nil && !r.Allowed {
			return item{}, problem.TooMany("Modo lento activo: espera antes de escribir otra vez.")
		}
	}

	// deduplicación por el cid del cliente (reintento de red o doble clic): SET NX EX 60
	if msgCID != "" {
		ok, err := s.a.Redis.SetNX(ctx, s.a.Keys.Of("chat", "dedup", cid.String(), dia, msgCID), 1, dedupTTL).Result()
		if err == nil && !ok {
			return item{}, errDuplicado
		}
	}

	it := item{T: "msg", Texto: strings.TrimSpace(texto), Alias: f.Alias, FanID: f.ID.String(), Atleta: f.Tipo == fanauth.TipoAtleta, Ts: time.Now().UnixMilli(), Cid: msgCID, Dia: dia}
	b, err := json.Marshal(it)
	if err != nil {
		return item{}, problem.Internal()
	}
	res, err := s.a.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: s.streamDe(cid.String(), dia),
		MaxLen: 5000,
		Approx: true,
		Values: map[string]any{"d": string(b)},
	}).Result()
	if err != nil {
		return item{}, problem.New(503, "CHAT_NO_DISPONIBLE", "No se pudo publicar el mensaje. Inténtalo de nuevo.")
	}
	it.ID = res
	mensajesEnviados.Add(1)
	s.contar(ctx, cid, dia, f, it, cfg)
	return it, nil
}

// contar updates the milestone counters (§4). A message counts when it has at least 3 non-space characters and
// does not repeat the previous message of the same fan. Every multiple of 5 (up to max_hitos) emits `chat.hito`
// through the outbox (the games worker credits the rewards).
func (s *Svc) contar(ctx context.Context, cid uuid.UUID, dia string, f fanauth.Fan, it item, cfg Config) {
	if !contable(it.Texto) {
		return
	}
	prevKey := s.a.Keys.Of("chat", "prev", cid.String(), dia, f.ID.String())
	norm := normalizar(it.Texto)
	if old, err := s.a.Redis.Get(ctx, prevKey).Result(); err == nil && old == norm {
		return // repeated message of the same fan: not counted
	}
	s.a.Redis.Set(ctx, prevKey, norm, prevTTL)

	cntKey := s.a.Keys.Of("chat", "cnt", cid.String(), dia, f.ID.String())
	n, err := s.a.Redis.Incr(ctx, cntKey).Result()
	if err != nil {
		return // Redis down: the message was published, only the counter is lost
	}
	if n == 1 {
		s.a.Redis.Expire(ctx, cntKey, 26*time.Hour) // a little more than a day (the room of tomorrow is another one)
	}
	if n%5 != 0 || n/5 > int64(cfg.MaxHitos) {
		return
	}
	hitosTotal.Add(1)
	// frame para los clientes del chat (contrato §4: «+100 porra · +10k fantasy»): el worker acredita por el
	// evento, pero la sala necesita ver su propio hito
	if err := s.inyectar(ctx, cid.String(), dia, item{T: "hito", Mensajes: n, FanID: f.ID.String(), Alias: f.Alias, Ts: time.Now().UnixMilli()}); err != nil {
		s.a.Log.Warn("hito a la sala", "err", err)
	}
	ev := events.New(ctx, "chat.hito", map[string]any{"fanId": f.ID.String(), "alias": f.Alias, "dia": dia, "mensajes": n},
		events.Competition(cid.String()), events.Audience(events.Internal), events.Subject("fan:"+f.ID.String()))
	// transacción mínima: only this INSERT (the relay publishes it to grcup:events)
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return events.Enqueue(ctx, tx, ev) }); err != nil {
		s.a.Log.Warn("chat.hito", "err", err)
	}
}
