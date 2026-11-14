package juegos

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

// mercadosTTL bounds how stale the public odds may be: the live changes still arrive at once over porra.mercado.
const mercadosTTL = time.Second

type mercadosEntrada struct {
	mu  sync.Mutex // one recompute per jornada and pod at a time; the rest wait and reuse it
	exp time.Time
	ms  []mercadoVista
}

var mercadosCache sync.Map // jornada id → *mercadosEntrada

// mercadosVistaCache serves the public GET /porra/mercados: the pots aggregate every bet of the jornada, so under
// load (80 bets/s, each preceded by this GET) it is recomputed at most once per second and pod.
func (s *Svc) mercadosVistaCache(ctx context.Context, cid uuid.UUID, j *jornada) ([]mercadoVista, error) {
	v, _ := mercadosCache.LoadOrStore(j.ID, &mercadosEntrada{})
	e := v.(*mercadosEntrada)
	e.mu.Lock()
	defer e.mu.Unlock()
	if time.Now().Before(e.exp) {
		return e.ms, nil
	}
	ms, err := s.mercadosVista(ctx, cid, j)
	if err != nil {
		return nil, err
	}
	e.ms, e.exp = ms, time.Now().Add(mercadosTTL)
	return ms, nil
}
