package juegos

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
	etag        string // weak validator of ms (ST1-R3-1: a 304 skips the 87 KB body)
	refrescando bool // a background refresh is running (singleflight per jornada and pod)
}

var mercadosCache sync.Map // jornada id → *mercadosEntrada

// etagMercados hashes the view once per refresh (at most 1/s and pod), not per request.
func etagMercados(j *jornada, ms []mercadoVista) string {
	b, _ := json.Marshal(ms)
	h := sha256.New()
	h.Write([]byte(j.ID.String() + j.Estado))
	h.Write(b)
	return `W/"` + hex.EncodeToString(h.Sum(nil)[:12]) + `"`
}

type jornadaEntrada struct {
	j   jornada
	exp time.Time
}

var jornadasCache sync.Map // cid+jid → *jornadaEntrada

// jornadaPublicaCache memoizes jornadaPublica for mercadosTTL: the GET of mercados ran one jornada query per call.
func (s *Svc) jornadaPublicaCache(ctx context.Context, cid, jid uuid.UUID) (*jornada, error) {
	k := cid.String() + jid.String()
	if v, ok := jornadasCache.Load(k); ok {
		if e := v.(*jornadaEntrada); time.Now().Before(e.exp) {
			j := e.j
			return &j, nil
		}
	}
	j, err := s.jornadaPublica(ctx, cid, jid)
	if err != nil {
		return nil, err
	}
	jornadasCache.Store(k, &jornadaEntrada{j: *j, exp: time.Now().Add(mercadosTTL)})
	return j, nil
}

// mercadosVistaCache serves the public GET /porra/mercados: the pots aggregate every bet of the jornada, so under
// load (80 bets/s, each preceded by this GET) it is recomputed at most once per second and pod. Stale-while-
// revalidate (ST1-R2-2): once loaded, a request never waits for the aggregate — an expired entry is served as is
// while one goroutine refreshes it (no stampede of waiters at each expiry).
func (s *Svc) mercadosVistaCache(ctx context.Context, cid uuid.UUID, j *jornada) ([]mercadoVista, string, error) {
	v, _ := mercadosCache.LoadOrStore(j.ID, &mercadosEntrada{})
	e := v.(*mercadosEntrada)
	e.mu.Lock()
	if !e.exp.IsZero() {
		ms, etag := e.ms, e.etag
		if !e.refrescando && !time.Now().Before(e.exp) {
			e.refrescando = true
			go s.refrescarMercados(e, cid, *j)
		}
		e.mu.Unlock()
		return ms, etag, nil
	}
	defer e.mu.Unlock()
	ms, err := s.mercadosVista(ctx, cid, j)
	if err != nil {
		return nil, "", err
	}
	e.ms, e.etag, e.exp = ms, etagMercados(j, ms), time.Now().Add(mercadosTTL)
	return ms, e.etag, nil
}

func (s *Svc) refrescarMercados(e *mercadosEntrada, cid uuid.UUID, j jornada) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ms, err := s.mercadosVista(ctx, cid, &j)
	etag := ""
	if err == nil {
		etag = etagMercados(&j, ms)
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.refrescando = false
	if err == nil {
		e.ms, e.etag, e.exp = ms, etag, time.Now().Add(mercadosTTL)
	}
}
