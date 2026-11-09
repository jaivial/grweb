// ranking.go: the live classifications (contract §6.2 and §6.3). Porra: saldo of the jornada, tie-break by who
// reached it first (older updated_at). Fantasy: points, tie-break by squad value, then saldo, then who arrived
// first (older wallet — coordinator update). Read models cached 2–5 s in Redis; the public event
// juegos.clasificacion goes out at most once every 5 s per jornada.
package juegos

import (
	"context"
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

// filaFantasy is one row of the fantasy ranking (it keeps the fan id: only the admin view uses it).
type filaFantasy struct {
	Puesto int       `json:"puesto"`
	FanID  uuid.UUID `json:"fanId"`
	Alias  string    `json:"alias"`
	Puntos int       `json:"puntos"`
	Valor  int64     `json:"valor" doc:"Valor de la plantilla (suma de cláusulas)"`
	Saldo  int64     `json:"saldo"`
}

// filaPorraPublic is one row of the public porra ranking: alias and balance, never the fan id (the internal
// identifier of the fan is personal data and does not travel in the public views, contract §6.6).
type filaPorraPublic struct {
	Puesto int    `json:"puesto"`
	Alias  string `json:"alias"`
	Saldo  int64  `json:"saldo"`
}

// filaFantasyPublic is one row of the public fantasy ranking (no fan id, like filaPorraPublic).
type filaFantasyPublic struct {
	Puesto int    `json:"puesto"`
	Alias  string `json:"alias"`
	Puntos int    `json:"puntos"`
	Valor  int64  `json:"valor" doc:"Valor de la plantilla (suma de cláusulas)"`
	Saldo  int64  `json:"saldo"`
}

// publicaPorra strips the fan ids of the porra ranking (public view).
func publicaPorra(filas []filaPorra) []filaPorraPublic {
	out := make([]filaPorraPublic, 0, len(filas))
	for _, f := range filas {
		out = append(out, filaPorraPublic{Puesto: f.Puesto, Alias: f.Alias, Saldo: f.Saldo})
	}
	return out
}

// publicaFantasy strips the fan ids of the fantasy ranking (public view).
func publicaFantasy(filas []filaFantasy) []filaFantasyPublic {
	out := make([]filaFantasyPublic, 0, len(filas))
	for _, f := range filas {
		out = append(out, filaFantasyPublic{Puesto: f.Puesto, Alias: f.Alias, Puntos: f.Puntos, Valor: f.Valor, Saldo: f.Saldo})
	}
	return out
}

const rankFantasyBase = `SELECT s.fan_id, s.alias, s.saldo, COALESCE(p.puntos, 0) AS puntos, COALESCE(v.valor, 0) AS valor, s.created_at
	FROM saldos s
	LEFT JOIN (SELECT fan_id, sum(puntos)::int puntos FROM puntos WHERE jornada_id = $1 GROUP BY fan_id) p ON p.fan_id = s.fan_id
	LEFT JOIN (SELECT dueno_fan_id AS fan_id, sum(clausula) valor FROM fantasy_atletas WHERE jornada_id = $1 AND dueno_fan_id IS NOT NULL GROUP BY dueno_fan_id) v ON v.fan_id = s.fan_id
	WHERE s.jornada_id = $1 AND s.moneda = 'fantasy'`

// rankingPorra returns the top 50 of the porra (cached 3 s) and the fan's own place.
func (s *Svc) rankingPorra(ctx context.Context, j jornada, fanID uuid.UUID) ([]filaPorra, int) {
	key := "rank:porra:" + j.ID.String()
	var top []filaPorra
	if !s.cache.Get(ctx, key, &top) {
		rows, err := s.a.DB.Query(ctx, `SELECT fan_id, alias, saldo, rank() OVER (ORDER BY saldo DESC, updated_at ASC)
			FROM saldos WHERE jornada_id = $1 AND moneda = 'porra' ORDER BY saldo DESC, updated_at ASC LIMIT 50`, j.ID)
		if err != nil {
			return []filaPorra{}, 0
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
	}
	return top, s.miPuesto(ctx, j, fanID, Porra)
}

// rankingFantasy returns the top 50 of the fantasy (cached 3 s) and the fan's own place.
func (s *Svc) rankingFantasy(ctx context.Context, j jornada, fanID uuid.UUID) ([]filaFantasy, int) {
	key := "rank:fantasy:" + j.ID.String()
	var top []filaFantasy
	if !s.cache.Get(ctx, key, &top) {
		rows, err := s.a.DB.Query(ctx, `SELECT fan_id, alias, saldo, puntos, valor, rank() OVER (ORDER BY puntos DESC, valor DESC, saldo DESC, created_at ASC)
			FROM (`+rankFantasyBase+`) r ORDER BY puntos DESC, valor DESC, saldo DESC, created_at ASC LIMIT 50`, j.ID)
		if err != nil {
			return []filaFantasy{}, 0
		}
		defer rows.Close()
		top = []filaFantasy{}
		for rows.Next() {
			var f filaFantasy
			if err := rows.Scan(&f.FanID, &f.Alias, &f.Saldo, &f.Puntos, &f.Valor, &f.Puesto); err == nil {
				top = append(top, f)
			}
		}
		s.cache.Set(ctx, key, top, 3*time.Second)
	}
	return top, s.miPuesto(ctx, j, fanID, Fantasy)
}

// miPuesto is the fan's place in the whole ranking (same order as the top): rank() over all the wallets.
func (s *Svc) miPuesto(ctx context.Context, j jornada, fanID uuid.UUID, m Moneda) int {
	if fanID == uuid.Nil {
		return 0
	}
	var (
		q    string
		args []any
	)
	if m == Fantasy {
		// the base query already filters by jornada ($1): the fan is $2.
		q = `SELECT puesto FROM (SELECT fan_id, rank() OVER (ORDER BY puntos DESC, valor DESC, saldo DESC, created_at ASC) puesto
			FROM (` + rankFantasyBase + `) r) r2 WHERE r2.fan_id = $2`
		args = []any{j.ID, fanID}
	} else {
		q = `SELECT puesto FROM (
			SELECT fan_id, rank() OVER (ORDER BY saldo DESC, updated_at ASC) puesto
			FROM saldos WHERE jornada_id = $1 AND moneda = $2) r WHERE r.fan_id = $3`
		args = []any{j.ID, m, fanID}
	}
	var puesto int
	if err := s.a.DB.QueryRow(ctx, q, args...).Scan(&puesto); err != nil {
		return 0
	}
	return puesto
}

// misPuntos returns the points of the fan in the fantasy ranking. The public ranking does not expose the fan
// id, so «mis puntos» are computed here from the session (contract §6.6).
func (s *Svc) misPuntos(ctx context.Context, j jornada, fanID uuid.UUID) int {
	if fanID == uuid.Nil {
		return 0
	}
	var n int64
	if err := s.a.DB.QueryRow(ctx, `SELECT coalesce(sum(puntos), 0) FROM puntos WHERE jornada_id = $1 AND fan_id = $2`, j.ID, fanID).Scan(&n); err != nil {
		return 0
	}
	return int(n)
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
