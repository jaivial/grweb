package openlifter

import (
	"testing"

	"github.com/google/uuid"
)

func TestAsignacionesDeHorario(t *testing.T) {
	ana, bea, juzgada := uuid.New(), uuid.New(), uuid.New()
	filas := []*fila{
		{EntryID: 1, AtletaID: &ana, Vinculo: "auto", Datos: Entrada{Name: "Ana"}},
		{EntryID: 2, AtletaID: &bea, Vinculo: "confirmado", Datos: Entrada{Name: "Bea"}},
		{EntryID: 3, AtletaID: &juzgada, Vinculo: "confirmado", Datos: Entrada{Name: "Juzgada", SquatStatus: []int{1}}},
		{EntryID: 4, Vinculo: "sin_coincidencia", Datos: Entrada{Name: "Sin atleta"}},
	}
	links := map[int]uuid.UUID{1: ana, 2: bea, 3: juzgada}
	// el horario publica el segundo día primero: el día sale de la fecha
	sn := &horarioPublicado{Numero: 9, Dias: []diaHorario{
		diaAep2("2026-12-19", 9, bea, 2),
		diaAep2("2026-12-18", 9, ana, 1),
	}}
	meet := map[string]any{"date": "2026-12-18", "lengthDays": float64(2)}
	got := asignacionesDeHorario(meet, filas, links, sn, niveles{1: "aep2", 2: "aep2"}, "aep2 · AEP 2 - GR STRENGTH CUP II · 2026-12-18")

	quiero := map[int]asignacionHorario{
		1: {EntryID: 1, Day: 1, Platform: 1, Flight: "A", Lot: 1},
		2: {EntryID: 2, Day: 2, Platform: 1, Flight: "A", Lot: 2},
	}
	if len(got) != len(quiero) {
		t.Fatalf("asignaciones = %v, quiero %d (la juzgada y la sin atleta no se mueven)", got, len(quiero))
	}
	for _, a := range got {
		if q, ok := quiero[a.EntryID]; !ok || a != q {
			t.Errorf("entrada %d: %+v, quiero %+v", a.EntryID, a, quiero[a.EntryID])
		}
	}
}

func TestAsignacionesDeHorarioSinHorario(t *testing.T) {
	ana := uuid.New()
	filas := []*fila{{EntryID: 1, AtletaID: &ana, Vinculo: "auto", Datos: Entrada{Name: "Ana"}}}
	if got := asignacionesDeHorario(map[string]any{"date": "2026-12-18", "lengthDays": float64(1)}, filas, map[int]uuid.UUID{1: ana}, nil, niveles{1: "aep2"}, ""); len(got) != 0 {
		t.Errorf("sin horario publicado no hay asignaciones: %v", got)
	}
}
