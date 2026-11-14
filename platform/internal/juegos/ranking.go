// ranking.go: the live classification of the porra (contract §6.2): saldo of the jornada, tie-break by who
// reached it first (older updated_at). The fantasy is classified per room (salas_vista.go). Read models cached 2–5 s in Redis; the public event
// juegos.clasificacion goes out at most once every 5 s per jornada.
package juegos

import (
	"context"
	"golang.org/x/sync/singleflight"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/events"
)

// filaPorra is one row of the porra ranking (it keeps the fan id: only the admin view uses it).
type filaPorra struct {
	Puesto int       `json:"puesto"`
	FanID  uuid.UUID `json:"fanId"`
	Alias  string    `json:"alias"`
	Saldo  int64     `json:"saldo"`
}

// filaPorraPublic is one row of the public porra ranking: alias and balance, never the fan id (the internal
// identifier of the fan is personal data and does not travel in the public views, contract §6.6).
type filaPorraPublic struct {
	Puesto int    `json:"puesto"`
	Alias  string `json:"alias"`
	Saldo  int64  `json:"saldo"`
}

// publicaPorra strips the fan ids of the porra ranking (public view).
func publicaPorra(filas []filaPorra) []filaPorraPublic {
	out := make([]filaPorraPublic, 0, len(filas))
	for _, f := range filas {
		alias := f.Alias
		if alias == "" {
			alias = "Jugador " + itoa(f.Puesto) // fans without alias yet (never empty in the public ranking)
		}
		out = append(out, filaPorraPublic{Puesto: f.Puesto, Alias: alias, Saldo: f.Saldo})
	}
	return out
}

// rankingPorra returns the top 50 of the porra (cached 3 s, one loader per pod and jornada) and the fan's own
// place and balance (one query, ST2-R2-2).
func (s *Svc) rankingPorra(ctx context.Context, j jornada, fanID uuid.UUID) ([]filaPorra, int, int64) {
	key := "rank:porra:" + j.ID.String()
	// ST2-R7-1/R7-3: pod-local copy for 1 s, so a hot jornada skips the Redis round trip and the JSON decode of
	// the top 50 on every request (the Redis entry still shares one load across pods).
	if v, ok := topLocal.Load(key); ok {
		if e := v.(*topEntrada); time.Now().Before(e.exp) {
			p, saldo := s.puestoPorra(ctx, j, e.top, fanID)
			return e.top, p, saldo
		}
	}
	var top []filaPorra
	if s.cache.Get(ctx, key, &top) {
		topLocal.Store(key, &topEntrada{top: top, exp: time.Now().Add(time.Second)})
		p, saldo := s.puestoPorra(ctx, j, top, fanID)
		return top, p, saldo
	}
	v, _, _ := rankingVuelo.Do(key, func() (any, error) {
		var top []filaPorra
		if s.cache.Get(ctx, key, &top) { // another pod or flight filled it meanwhile
			return top, nil
		}
		// wallets opened before the alias was stored have it empty: borrow it from another wallet of the same fan
		rows, err := s.a.DB.Query(ctx, `SELECT s.fan_id,
				COALESCE(NULLIF(s.alias, ''), (SELECT o.alias FROM saldos o WHERE o.fan_id = s.fan_id AND o.alias <> '' ORDER BY o.updated_at DESC LIMIT 1), ''),
				s.saldo, rank() OVER (ORDER BY s.saldo DESC, s.updated_at ASC)
			FROM saldos s WHERE s.jornada_id = $1 AND s.moneda = 'porra' ORDER BY s.saldo DESC, s.updated_at ASC LIMIT 50`, j.ID)
		if err != nil {
			return []filaPorra{}, err
		}
		defer rows.Close()
		top = []filaPorra{}
		for rows.Next() {
			var f filaPorra
			if err := rows.Scan(&f.FanID, &f.Alias, &f.Saldo, &f.Puesto); err == nil {
				top = append(top, f)
			}
		}
		s.cache.Set(ctx, key, top, 3*time.Second)
		return top, nil
	})
	top = v.([]filaPorra)
	topLocal.Store(key, &topEntrada{top: top, exp: time.Now().Add(time.Second)})
	p, saldo := s.puestoPorra(ctx, j, top, fanID)
	return top, p, saldo
}

type topEntrada struct {
	top []filaPorra
	exp time.Time
}

var topLocal sync.Map // "rank:porra:"+jornada → *topEntrada (read-only slices, never mutated)

// puestoPorra reads the fan's place from the cached top when they are in it, else from a 3 s per-fan cache, so
// the place matches the snapshot shown and the two count ranges no longer run on every request under writes (ST2-R3-2).
func (s *Svc) puestoPorra(ctx context.Context, j jornada, top []filaPorra, fanID uuid.UUID) (int, int64) {
	if fanID == uuid.Nil {
		return 0, 0
	}
	for _, f := range top {
		if f.FanID == fanID {
			return f.Puesto, f.Saldo
		}
	}
	key := "rank:porra:fan:" + j.ID.String() + ":" + fanID.String()
	var c [2]int64
	if s.cache.Get(ctx, key, &c) {
		return int(c[0]), c[1]
	}
	p, saldo := s.miPuesto(ctx, j, fanID, Porra)
	s.cache.Set(ctx, key, [2]int64{int64(p), saldo}, 3*time.Second)
	return p, saldo
}

// rankingVuelo collapses concurrent loads of the same top (ST2-R1-1: no singleflight meant N identical queries).
var rankingVuelo singleflight.Group

// orden is a snapshot of every wallet of a jornada in ranking order (saldo DESC, updated_at ASC), shared by the
// pod for 3 s. ST2-R4-3: two count ranges per distinct fan scanned O(wallets) each with 1000+ fans; now one
// index-only scan per jornada every 3 s and a binary search per fan.
type orden struct {
	exp   time.Time
	saldo []int64
	upd   []time.Time
}

var (
	ordenMu sync.Mutex
	ordenes = map[string]*orden{}
)

func (s *Svc) ordenJornada(ctx context.Context, j jornada, m Moneda) *orden {
	key := j.ID.String() + ":" + string(m)
	ordenMu.Lock()
	o := ordenes[key]
	ordenMu.Unlock()
	if o != nil && time.Now().Before(o.exp) {
		return o
	}
	v, _, _ := rankingVuelo.Do("orden:"+key, func() (any, error) {
		// shared load: a caller that hangs up must not fail the others waiting on the flight
		qctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		rows, err := s.a.DB.Query(qctx, `SELECT saldo, updated_at FROM saldos WHERE jornada_id = $1 AND moneda = $2
			ORDER BY saldo DESC, updated_at ASC`, j.ID, m)
		if err != nil {
			return o, err
		}
		defer rows.Close()
		n := &orden{exp: time.Now().Add(3 * time.Second)}
		for rows.Next() {
			var sd int64
			var u time.Time
			if rows.Scan(&sd, &u) == nil {
				n.saldo, n.upd = append(n.saldo, sd), append(n.upd, u)
			}
		}
		if rows.Err() != nil {
			return o, rows.Err()
		}
		ordenMu.Lock()
		for k, x := range ordenes { // drop expired jornadas so the map stays bounded
			if time.Since(x.exp) > time.Minute {
				delete(ordenes, k)
			}
		}
		ordenes[key] = n
		ordenMu.Unlock()
		return n, nil
	})
	o, _ = v.(*orden)
	return o
}

// miPuesto is the fan's place in the whole ranking (same order and ties as rank() in the top): 1 + the wallets
// strictly ahead in the jornada snapshot; the fan's own balance is read fresh by primary key.
func (s *Svc) miPuesto(ctx context.Context, j jornada, fanID uuid.UUID, m Moneda) (int, int64) {
	if fanID == uuid.Nil {
		return 0, 0
	}
	var saldo int64
	var upd time.Time
	if err := s.a.DB.QueryRow(ctx, `SELECT saldo, updated_at FROM saldos WHERE jornada_id = $1 AND fan_id = $3 AND moneda = $2`,
		j.ID, m, fanID).Scan(&saldo, &upd); err != nil {
		return 0, 0
	}
	o := s.ordenJornada(ctx, j, m)
	if o == nil {
		return 0, saldo
	}
	ahead := sort.Search(len(o.saldo), func(i int) bool {
		return o.saldo[i] < saldo || (o.saldo[i] == saldo && !o.upd[i].Before(upd))
	})
	return 1 + ahead, saldo
}

// eventoClasificacion emits juegos.clasificacion at most once every 5 s per jornada (contract §6.6), with the
// podium aliases of both rankings as the hook for the SSE clients.
func (s *Svc) eventoClasificacion(ctx context.Context, cid, jid uuid.UUID) {
	k := s.a.Keys.Of("juegos", "clas-ev", jid.String())
	ok, err := s.a.Redis.SetNX(ctx, k, time.Now().Unix(), 5*time.Second).Result()
	if err != nil || !ok {
		return
	}
	porra := s.podium(ctx, jid, Porra)
	fantasy := s.podium(ctx, jid, Fantasy)
	if len(porra) == 0 && len(fantasy) == 0 {
		return
	}
	ev := events.New(ctx, "juegos.clasificacion", map[string]any{"jornadaId": jid.String(), "porra": porra, "fantasy": fantasy},
		events.Competition(cid.String()), events.Audience(events.Public))
	_ = events.Publish(ctx, s.a.Redis, s.a.Stream(), ev)
}

// podium reads the first three aliases of a ranking (cheap, already throttled).
func (s *Svc) podium(ctx context.Context, jid uuid.UUID, m Moneda) []string {
	rows, err := s.a.DB.Query(ctx, `SELECT alias FROM saldos WHERE jornada_id = $1 AND moneda = $2 ORDER BY saldo DESC, updated_at ASC LIMIT 3`, jid, m)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var alias string
		if err := rows.Scan(&alias); err == nil {
			out = append(out, alias)
		}
	}
	return out
}
