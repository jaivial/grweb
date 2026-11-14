// marcador.go: client of the internal scoreboard of `live` (contract §8) with a one-second in-process cache, so
// the worker's debounced reloads and the admin buttons share the same fetch.
package juegos

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// MarcadorIntento mirrors one attempt of the live scoreboard.
type MarcadorIntento struct {
	N         int        `json:"n"`
	Peso      float64    `json:"peso"`
	Resultado string     `json:"resultado"`
	JuzgadoAt *time.Time `json:"juzgadoAt,omitempty"`
}

// MarcadorAtleta mirrors one athlete of the live scoreboard.
type MarcadorAtleta struct {
	AtletaID         uuid.UUID                    `json:"atletaId"`
	NombrePublico    string                       `json:"nombrePublico"`
	FotoURL          string                       `json:"fotoUrl,omitempty"`
	Sexo             string                       `json:"sexo"`
	Categoria        string                       `json:"categoria"`
	FlightID         uuid.UUID                    `json:"flightId"`
	FlightEnCurso    bool                         `json:"flightEnCurso"`
	Intentos         map[string][]MarcadorIntento `json:"intentos"`
	Mejor            map[string]*float64          `json:"mejor"`
	Total            *float64                     `json:"total"`
	GL               *float64                     `json:"gl"`
	PuestoCategoria  int                          `json:"puestoCategoria"`
	PuestoGL         int                          `json:"puestoGL"`
	PuestoMovimiento map[string]int               `json:"puestoMovimiento"`
	Blanqueo         map[string]bool              `json:"blanqueo"`
	Terminado        bool                         `json:"terminado"`
}

// Marcador mirrors the response of GET /internal/competiciones/{cid}/marcador.
type Marcador struct {
	Fase                 string           `json:"fase"`
	FlightEnCurso        string           `json:"flightEnCurso"`
	Atletas              []MarcadorAtleta `json:"atletas"`
	CategoriasPublicadas []string         `json:"categoriasPublicadas"`
}

// marcadorStale is how long the last good scoreboard keeps being served while live is down (ST3-R2-2).
const marcadorStale = 10 * time.Minute

// marcador fetches the scoreboard of one competition day (cached 1 s per pod: the worker reloads at most once
// per second and jornada, and the admin buttons reuse it). One call per key at a time (singleflight), 2 s budget
// detached from the caller; on error it serves the last good scoreboard (up to 10 min) and retries at most every
// 2 s, so a live/schedule outage never holds requests for the 10 s of the svcclient.
func (s *Svc) marcador(_ context.Context, cid uuid.UUID, dia string) (*Marcador, error) {
	k := cid.String() + ":" + dia
	s.marcMu.Lock()
	e, ok := s.marc[k]
	s.marcMu.Unlock()
	if ok && time.Now().Before(e.exp) {
		return e.m, e.err
	}
	if ok && e.caido {
		// live is failing: answer now with what we have and retry in the background (one call at a time).
		go s.marcSF.Do(k, func() (any, error) { return s.cargarMarcador(cid, dia, k, e, ok), nil })
		return e.m, e.err
	}
	v, _, _ := s.marcSF.Do(k, func() (any, error) { return s.cargarMarcador(cid, dia, k, e, ok), nil })
	n := v.(marcEntrada)
	return n.m, n.err
}

func (s *Svc) cargarMarcador(cid uuid.UUID, dia, k string, prev marcEntrada, hayPrev bool) marcEntrada {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var m Marcador
	n := marcEntrada{m: &m, ok: time.Now(), exp: time.Now().Add(time.Second)}
	if err := s.live.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/marcador?dia="+dia, nil, &m); err != nil {
		s.a.Log.Warn("marcador no disponible", "cid", cid, "dia", dia, "err", err)
		n = marcEntrada{err: err, caido: true, exp: time.Now().Add(2 * time.Second)}
		if hayPrev && prev.m != nil && time.Since(prev.ok) < marcadorStale {
			n.m, n.ok, n.err = prev.m, prev.ok, nil // stale but last known good
		}
	}
	s.marcMu.Lock()
	if len(s.marc) > 64 {
		s.marc = map[string]marcEntrada{}
	}
	s.marc[k] = n
	s.marcMu.Unlock()
	return n
}
