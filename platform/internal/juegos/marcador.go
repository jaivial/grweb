// marcador.go: client of the internal scoreboard of `live` (contract §8) with a one-second in-process cache, so
// the worker's debounced reloads and the admin buttons share the same fetch.
package juegos

import (
	"context"
	"net/http"
	"net/url"
	"slices"
	"time"

	"github.com/google/uuid"
)

// pruebaDelDia tells live which confirmed athletes without a published sesion belong to the jornada of dia: every
// approved athlete plays from the moment the request is approved, schedule or not. The dates are the ones of the
// schedule (not every jornada: an old jornada that was played stays in the table): with one date per competition
// (AEP-2 the dates before the last one, AEP-3 the last one, as schedule splits them) each one goes to its own day;
// any other date, or a schedule that cannot be read, gets "*" (all of them). Athletes without a competition go to
// every day.
func (s *Svc) pruebaDelDia(ctx context.Context, cid uuid.UUID, dia string) string {
	dias := s.diasDelHorario(ctx, cid)
	i := slices.Index(dias, dia)
	if i < 0 {
		return "*"
	}
	if len(dias) >= 2 && i == len(dias)-1 {
		return "aep3"
	}
	return "aep2"
}

type diasEntrada struct {
	dias []string
	exp  time.Time
}

// diasDelHorario are the dates of the schedule, cached 30 s per pod (the marcador asks for them every second); on a
// schedule error the last known dates are kept for another 30 s.
func (s *Svc) diasDelHorario(ctx context.Context, cid uuid.UUID) []string {
	s.diasMu.Lock()
	e, ok := s.dias[cid]
	s.diasMu.Unlock()
	if ok && time.Now().Before(e.exp) {
		return e.dias
	}
	fechas, okSched := s.fechasSchedule(ctx, cid)
	if !okSched {
		fechas = e.dias
	}
	s.diasMu.Lock()
	if s.dias == nil || len(s.dias) > 64 {
		s.dias = map[uuid.UUID]diasEntrada{}
	}
	s.dias[cid] = diasEntrada{dias: fechas, exp: time.Now().Add(30 * time.Second)}
	s.diasMu.Unlock()
	return fechas
}

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
	SesionID         uuid.UUID                    `json:"sesionId"`
	SesionEnCurso    bool                         `json:"sesionEnCurso"`
	Intentos         map[string][]MarcadorIntento `json:"intentos"`
	Mejor            map[string]*float64          `json:"mejor"`
	Total            *float64                     `json:"total"`
	GL               *float64                     `json:"gl"`
	PuestoCategoria  int                          `json:"puestoCategoria"`
	PuestoGL         int                          `json:"puestoGL"`
	PuestoMovimiento map[string]int               `json:"puestoMovimiento"`
	Blanqueo         map[string]bool              `json:"blanqueo"`
	Terminado        bool                         `json:"terminado"`
	// Dia is set by juegos (marcadorFantasy): the date of the scoreboard the athlete came from.
	Dia string `json:"-"`
}

// Marcador mirrors the response of GET /internal/competiciones/{cid}/marcador.
type Marcador struct {
	Fase                 string           `json:"fase"`
	SesionEnCurso        string           `json:"sesionEnCurso"`
	Atletas              []MarcadorAtleta `json:"atletas"`
	CategoriasPublicadas []string         `json:"categoriasPublicadas"`
	// Degradado: live is serving its own stale plan (schedule/athletes down, up to 24 h old, BIZ-200 R2-S1). The
	// markets must then only grow, like with the stale marcador of a dead live.
	Degradado bool `json:"degradado,omitempty"`
}

// marcadorStale is how long the last good scoreboard keeps being served while live is down (ST3-R2-2).
const marcadorStale = 10 * time.Minute

// marcador fetches the scoreboard of one competition day (cached 1 s per pod: the worker reloads at most once
// per second and jornada, and the admin endpoints reuse it). One call per key at a time (singleflight), 2 s
// budget detached from the caller; on error it serves the last good scoreboard (up to 10 min) and retries at
// most every 2 s, so a live/schedule outage never holds requests for the 10 s of the svcclient. The second
// return reports a degraded scoreboard, the sync may then only create markets and add options, never remove
// options or annul and refund (BIZ-200 R2-5): either live is down and juegos serves the stale last-good one, or
// live itself reports serving its own stale plan (BIZ-200 R2-S1).
func (s *Svc) marcador(_ context.Context, cid uuid.UUID, dia string) (*Marcador, bool, error) {
	k := cid.String() + ":" + dia
	s.marcMu.Lock()
	e, ok := s.marc[k]
	fresca := ok && time.Now().Before(e.exp)
	if ok && !fresca && e.caido {
		// live is failing: answer now with what we have and retry once in the background; the entry stays valid
		// for the retry's 2 s budget so the requests meanwhile do not start more retries.
		s.marc[k] = marcEntrada{m: e.m, err: e.err, ok: e.ok, caido: true, exp: time.Now().Add(2 * time.Second)}
		s.marcMu.Unlock()
		go s.marcSF.Do(k, func() (any, error) { return s.cargarMarcador(cid, dia, k, e, ok), nil })
		return e.m, degradada(e.m, true, e.err), e.err
	}
	s.marcMu.Unlock()
	if fresca {
		return e.m, degradada(e.m, e.caido, e.err), e.err
	}
	v, _, _ := s.marcSF.Do(k, func() (any, error) { return s.cargarMarcador(cid, dia, k, e, ok), nil })
	n := v.(marcEntrada)
	return n.m, degradada(n.m, n.caido, n.err), n.err
}

// degradada reports a scoreboard one may only grow from (see marcador): never with a plain error, where the
// caller aborts on its own.
func degradada(m *Marcador, caido bool, err error) bool {
	if err != nil {
		return false
	}
	return caido || (m != nil && m.Degradado)
}

func (s *Svc) cargarMarcador(cid uuid.UUID, dia, k string, prev marcEntrada, hayPrev bool) marcEntrada {
	prueba := s.pruebaDelDia(context.Background(), cid, dia) // cached; outside the 2 s budget of the live call
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var m Marcador
	n := marcEntrada{m: &m, ok: time.Now(), exp: time.Now().Add(time.Second)}
	if err := s.live.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/marcador?dia="+dia+"&prueba="+url.QueryEscape(prueba), nil, &m); err != nil {
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
