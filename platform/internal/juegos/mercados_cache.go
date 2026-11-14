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
	mu          sync.Mutex // guards the fields; only the first load ever computes while holding it
	exp         time.Time
	ms          []mercadoVista
	refrescando bool // a background refresh is running (singleflight per jornada and pod)
}

var mercadosCache sync.Map // jornada id → *mercadosEntrada

// mercadosVistaCache serves the public GET /porra/mercados: the pots aggregate every bet of the jornada, so under
// load (80 bets/s, each preceded by this GET) it is recomputed at most once per second and pod. Stale-while-
// revalidate (ST1-R2-2): once loaded, a request never waits for the aggregate — an expired entry is served as is
// while one goroutine refreshes it (no stampede of waiters at each expiry).
func (s *Svc) mercadosVistaCache(ctx context.Context, cid uuid.UUID, j *jornada) ([]mercadoVista, error) {
	v, _ := mercadosCache.LoadOrStore(j.ID, &mercadosEntrada{})
	e := v.(*mercadosEntrada)
	e.mu.Lock()
	if !e.exp.IsZero() {
		ms := e.ms
		if !e.refrescando && !time.Now().Before(e.exp) {
			e.refrescando = true
			go s.refrescarMercados(e, cid, *j)
		}
		e.mu.Unlock()
		return ms, nil
	}
	defer e.mu.Unlock()
	ms, err := s.mercadosVista(ctx, cid, j)
	if err != nil {
		return nil, err
	}
	e.ms, e.exp = ms, time.Now().Add(mercadosTTL)
	return ms, nil
}

func (s *Svc) refrescarMercados(e *mercadosEntrada, cid uuid.UUID, j jornada) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ms, err := s.mercadosVista(ctx, cid, &j)
	e.mu.Lock()
	defer e.mu.Unlock()
	e.refrescando = false
	if err == nil {
		e.ms, e.exp = ms, time.Now().Add(mercadosTTL)
	}
}
