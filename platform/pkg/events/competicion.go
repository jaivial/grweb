package events

import (
	"encoding/json"

	"github.com/google/uuid"
)

// Lifecycle facts of a competition handled by every service that holds its data (Sistema, Figma 64).
const (
	CompeticionCreada       = "competition.creada"
	AnonimizacionSolicitada = "competition.anonimizacion_solicitada"
	CompeticionAnonimizada  = "competition.anonimizada" // one per service, data {"servicio", "filas"}
	CompeticionEliminada    = "competition.eliminada"
)

// Clonado reads competition.creada: the edition it was cloned from and what to copy («legal», «plantillas», «faq»,
// «patrocinadores», «roles»). ok is false for a competition created from scratch.
func Clonado(e Event) (desde uuid.UUID, copiar map[string]bool, ok bool) {
	var d struct {
		ClonadaDe string   `json:"clonadaDe"`
		Copiar    []string `json:"copiar"`
	}
	if json.Unmarshal(e.Data, &d) != nil {
		return uuid.Nil, nil, false
	}
	desde, err := uuid.Parse(d.ClonadaDe)
	if err != nil {
		return uuid.Nil, nil, false
	}
	copiar = map[string]bool{}
	for _, c := range d.Copiar {
		copiar[c] = true
	}
	return desde, copiar, true
}
