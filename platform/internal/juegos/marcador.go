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
	N         int     `json:"n"`
	Peso      float64 `json:"peso"`
	Resultado string  `json:"resultado"`
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

// marcador fetches the scoreboard of one competition day (cached 1 s per pod: the worker reloads at most once
// per second and jornada, and the admin buttons reuse it).
func (s *Svc) marcador(ctx context.Context, cid uuid.UUID, dia string) (*Marcador, error) {
	k := cid.String() + ":" + dia
	s.marcMu.Lock()
	if e, ok := s.marc[k]; ok && time.Now().Before(e.exp) {
		s.marcMu.Unlock()
		return e.m, nil
	}
	s.marcMu.Unlock()
	var m Marcador
	if err := s.live.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/marcador?dia="+dia, nil, &m); err != nil {
		return nil, err
	}
	s.marcMu.Lock()
	if len(s.marc) > 64 {
		s.marc = map[string]marcEntrada{}
	}
	s.marc[k] = marcEntrada{m: &m, exp: time.Now().Add(time.Second)}
	s.marcMu.Unlock()
	return &m, nil
}
