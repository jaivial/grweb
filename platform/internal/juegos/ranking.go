// ranking.go: the live classification of the porra (contract §6.2): saldo of the jornada, tie-break by who
// reached it first (older updated_at). The fantasy is classified per room (salas_vista.go). Read models cached 2–5 s in Redis; the public event
// juegos.clasificacion goes out at most once every 5 s per jornada.
package juegos

import (
	"context"
	"golang.org/x/sync/singleflight"
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

// rankingPorra returns the top 50 of the porra (cached 3 s, one loader per pod and jornada) and the fan's own place.
func (s *Svc) rankingPorra(ctx context.Context, j jornada, fanID uuid.UUID) ([]filaPorra, int) {
	key := "rank:porra:" + j.ID.String()
	var top []filaPorra
	if s.cache.Get(ctx, key, &top) {
		return top, s.miPuesto(ctx, j, fanID, Porra)
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
	return v.([]filaPorra), s.miPuesto(ctx, j, fanID, Porra)
}

// rankingVuelo collapses concurrent loads of the same top (ST2-R1-1: no singleflight meant N identical queries).
var rankingVuelo singleflight.Group

// miPuesto is the fan's place in the whole ranking (same order and ties as rank() in the top): 1 + the wallets
// strictly ahead, counted as two index-only ranges of saldos_orden instead of sorting every wallet (ST2-R1-1).
func (s *Svc) miPuesto(ctx context.Context, j jornada, fanID uuid.UUID, m Moneda) int {
	if fanID == uuid.Nil {
		return 0
	}
	var puesto int
	if err := s.a.DB.QueryRow(ctx, `SELECT 1
			+ (SELECT count(*) FROM saldos s WHERE s.jornada_id = $1 AND s.moneda = $2 AND s.saldo > m.saldo)
			+ (SELECT count(*) FROM saldos s WHERE s.jornada_id = $1 AND s.moneda = $2 AND s.saldo = m.saldo AND s.updated_at < m.updated_at)
		FROM saldos m WHERE m.jornada_id = $1 AND m.fan_id = $3 AND m.moneda = $2`, j.ID, m, fanID).Scan(&puesto); err != nil {
		return 0
	}
	return puesto
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
