package juegos

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// mercadosTTL bounds how stale the public odds may be: the live changes still arrive at once over porra.mercado.
const mercadosTTL = time.Second

type mercadosEntrada struct {
	mu          sync.Mutex // guards the fields; only the first load ever computes while holding it
	exp         time.Time
	cuerpo      []byte // ST1-R4-1: response body serialized once per refresh, not per request
	gz          []byte // the same body gzipped (87 KB → a few KB on the wire)
	etag        string // weak validator of cuerpo (ST1-R3-1: a 304 skips the body)
	refrescando bool   // a background refresh is running (singleflight per jornada and pod)
}

var mercadosCache sync.Map // jornada id → *mercadosEntrada

// etagCoincide applies weak comparison to an If-None-Match list (ST1-R6-1): proxies may strip W/ or the
// gzip layer may append "-gzip", and a miss there re-downloads the whole body on every bet.
func etagCoincide(inm, etag string) bool {
	if inm == "" {
		return false
	}
	base := strings.TrimPrefix(etag, "W/")
	for _, t := range strings.Split(inm, ",") {
		t = strings.TrimPrefix(strings.TrimSpace(t), "W/")
		if t == "*" || t == base || strings.Replace(t, "-gzip\"", "\"", 1) == base {
			return true
		}
	}
	return false
}

// serializarMercados builds body, gzip and ETag once per refresh (at most 1/s and pod), not per request.
func serializarMercados(j *jornada, ms []mercadoVista) (cuerpo, gz []byte, etag string, err error) {
	jo := j.out()
	cuerpo, err = json.Marshal(struct {
		Jornada  *jornadaOut    `json:"jornada,omitempty"`
		Mercados []mercadoVista `json:"mercados"`
	}{&jo, ms})
	if err != nil {
		return nil, nil, "", err
	}
	var buf bytes.Buffer
	// ST1-R6-1: compressed at most 1/s and pod, so max compression is free CPU-wise and trims every response.
	w, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	_, _ = w.Write(cuerpo)
	_ = w.Close()
	h := sha256.Sum256(cuerpo)
	return cuerpo, buf.Bytes(), `W/"` + hex.EncodeToString(h[:12]) + `"`, nil
}

type jornadaEntrada struct {
	j   jornada
	exp time.Time
}

var jornadasCache sync.Map // cid+jid → *jornadaEntrada

// jornadaPublicaCache memoizes jornadaPublica for mercadosTTL for the read-only GETs (mercados, clasificación,
// mis-apuestas, cartera: one jornada query per call, ST2-R2-2); writes keep re-reading it in their transaction.
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
// It returns the cached JSON body, its gzip and the ETag.
func (s *Svc) mercadosVistaCache(ctx context.Context, cid uuid.UUID, j *jornada) (cuerpo, gz []byte, etag string, err error) {
	v, _ := mercadosCache.LoadOrStore(j.ID, &mercadosEntrada{})
	e := v.(*mercadosEntrada)
	e.mu.Lock()
	// ST2-R1-7: stale-while-revalidate only within 2 × TTL; an older entry (idle jornada) is recomputed inline
	if !e.exp.IsZero() && time.Now().Before(e.exp.Add(mercadosTTL)) {
		cuerpo, gz, etag = e.cuerpo, e.gz, e.etag
		if !e.refrescando && !time.Now().Before(e.exp) {
			e.refrescando = true
			go s.refrescarMercados(e, cid, *j)
		}
		e.mu.Unlock()
		return cuerpo, gz, etag, nil
	}
	defer e.mu.Unlock()
	ms, err := s.mercadosVista(ctx, cid, j)
	if err != nil {
		return nil, nil, "", err
	}
	if cuerpo, gz, etag, err = serializarMercados(j, ms); err != nil {
		return nil, nil, "", err
	}
	e.cuerpo, e.gz, e.etag, e.exp = cuerpo, gz, etag, time.Now().Add(mercadosTTL)
	return cuerpo, gz, etag, nil
}

func (s *Svc) refrescarMercados(e *mercadosEntrada, cid uuid.UUID, j jornada) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ms, err := s.mercadosVista(ctx, cid, &j)
	var cuerpo, gz []byte
	var etag string
	if err == nil {
		cuerpo, gz, etag, err = serializarMercados(&j, ms)
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.refrescando = false
	if err == nil {
		e.cuerpo, e.gz, e.etag, e.exp = cuerpo, gz, etag, time.Now().Add(mercadosTTL)
	}
}
