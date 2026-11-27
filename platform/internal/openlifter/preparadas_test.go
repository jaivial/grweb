package openlifter

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

// Alias del horario publicado, para montar los días de la prueba con los tipos reales de horarioPublicado.
type (
	atletaHorario = struct {
		ID   uuid.UUID `json:"id"`
		Lote int       `json:"lote"`
	}
	sesionHorario = struct {
		Prueba  string          `json:"prueba"`
		Inicio  time.Time       `json:"inicio"`
		Atletas []atletaHorario `json:"atletas"`
	}
	diaHorario = struct {
		Fecha    string          `json:"fecha"`
		Sesiones []sesionHorario `json:"sesiones"`
	}
)

// diaAep2 es un día del horario publicado con una sesión de AEP 2 y el atleta indicado.
func diaAep2(fecha string, hora int, id uuid.UUID, lote int) diaHorario {
	d, _ := time.Parse("2006-01-02", fecha)
	return diaHorario{Fecha: fecha, Sesiones: []sesionHorario{{
		Prueba: "aep2", Inicio: d.Add(time.Duration(hora) * time.Hour), Atletas: []atletaHorario{{ID: id, Lote: lote}},
	}}}
}

// entradasDeAnaYBea: dos entradas de OpenLifter vinculadas con dos atletas.
func entradasDeAnaYBea() ([]map[string]any, map[int]uuid.UUID, uuid.UUID, uuid.UUID) {
	ana, bea := uuid.New(), uuid.New()
	entradas := []map[string]any{{"id": float64(1), "name": "Ana"}, {"id": float64(2), "name": "Bea"}}
	return entradas, map[int]uuid.UUID{1: ana, 2: bea}, ana, bea
}

func TestAsignarHorarioNivelEnVariosDias(t *testing.T) {
	entradas, links, ana, bea := entradasDeAnaYBea()
	// el horario publica el segundo día primero: el día sale de la fecha, no del orden de los días
	sn := &horarioPublicado{Numero: 9, Dias: []diaHorario{
		diaAep2("2026-12-19", 9, bea, 2),
		diaAep2("2026-12-18", 9, ana, 1),
	}}
	meet := map[string]any{"name": "AEP 2 - GR STRENGTH CUP II", "date": "2026-12-18", "lengthDays": float64(2)}
	h := asignarHorario(meet, entradas, links, sn, niveles{1: "aep2", 2: "aep2"}, "aep2 · AEP 2 - GR STRENGTH CUP II · 2026-12-18")
	if !h.Publicado || h.Sesiones != 2 || h.Asignadas != 2 || h.SinSesion != 0 {
		t.Fatalf("horario: %+v, quiero 2 sesiones, 2 asignadas y ninguna sin sesión", h)
	}
	for i, dia := range []int{1, 2} {
		if d, _ := entradas[i]["day"].(int); d != dia {
			t.Errorf("%s: día %d, quiero %d", entradas[i]["name"], d, dia)
		}
	}
}

func TestAsignarHorarioFechaExtraEnElUltimoDia(t *testing.T) {
	entradas, links, ana, bea := entradasDeAnaYBea()
	carla := uuid.New()
	entradas = append(entradas, map[string]any{"id": float64(3), "name": "Carla"})
	links[3] = carla
	// tres fechas de AEP 2 para dos días del meet: la tercera va al último día del nivel
	sn := &horarioPublicado{Numero: 10, Dias: []diaHorario{
		diaAep2("2026-12-18", 9, ana, 1),
		diaAep2("2026-12-19", 9, bea, 2),
		diaAep2("2026-12-20", 9, carla, 3),
	}}
	meet := map[string]any{"date": "2026-12-18", "lengthDays": float64(2)}
	asignarHorario(meet, entradas, links, sn, niveles{1: "aep2", 2: "aep2"}, "")
	for i, dia := range []int{1, 2, 2} {
		if d, _ := entradas[i]["day"].(int); d != dia {
			t.Errorf("%s: día %d, quiero %d", entradas[i]["name"], d, dia)
		}
	}
}

func TestAsignarHorarioUnNivelPorDia(t *testing.T) {
	entradas, links, ana, bea := entradasDeAnaYBea()
	// un nivel por día: cada sesión va al día de su nivel, aunque su fecha sea otra
	sn := &horarioPublicado{Numero: 11, Dias: []diaHorario{
		diaAep2("2026-12-19", 9, ana, 1),
		{Fecha: "2026-12-21", Sesiones: []sesionHorario{{
			Prueba: "aep3", Inicio: time.Date(2026, 12, 21, 9, 0, 0, 0, time.UTC), Atletas: []atletaHorario{{ID: bea, Lote: 2}},
		}}},
	}}
	meet := map[string]any{"date": "2026-12-18", "lengthDays": float64(2)}
	asignarHorario(meet, entradas, links, sn, niveles{1: "aep2", 2: "aep3"}, "")
	for i, dia := range []int{1, 2} {
		if d, _ := entradas[i]["day"].(int); d != dia {
			t.Errorf("%s: día %d, quiero %d", entradas[i]["name"], d, dia)
		}
	}
}
