package juegos

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestMejoresPorCategoria(t *testing.T) {
	t0 := time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC)
	h := func(min int) *time.Time { x := t0.Add(time.Duration(min) * time.Minute); return &x }
	a, b, c := uuid.New(), uuid.New(), uuid.New()
	m := &Marcador{Atletas: []MarcadorAtleta{
		{AtletaID: a, NombrePublico: "Ana", Sexo: "F", Categoria: "-63", Intentos: map[string][]MarcadorIntento{
			"sq": {{N: 1, Peso: 100, Resultado: "valido", JuzgadoAt: h(0)}, {N: 2, Peso: 110, Resultado: "valido", JuzgadoAt: h(10)}, {N: 3, Peso: 120, Resultado: "nulo", JuzgadoAt: h(20)}},
			"bp": {{N: 1, Peso: 60, Resultado: "valido", JuzgadoAt: h(30)}},
		}},
		{AtletaID: b, NombrePublico: "Bea", Sexo: "F", Categoria: "-63", Intentos: map[string][]MarcadorIntento{
			"sq": {{N: 1, Peso: 110, Resultado: "valido", JuzgadoAt: h(5)}}, // same kg, judged earlier: keeps the best
			"bp": {{N: 1, Peso: 70, Resultado: "pendiente"}},
		}},
		{AtletaID: c, NombrePublico: "Carlos", Sexo: "M", Categoria: "-83", Intentos: map[string][]MarcadorIntento{
			"dl": {{N: 1, Peso: 250, Resultado: "nulo"}},
		}},
	}}
	got := mejoresPorCategoria(m)
	if len(got) != 2 || got[0].Sexo != "F" || got[0].Categoria != "-63" || got[1].Categoria != "-83" {
		t.Fatalf("categorías: %+v", got)
	}
	f := got[0]
	if f.SQ == nil || f.SQ.Kg != 110 || f.SQ.AtletaID != b || f.SQ.N != 1 {
		t.Fatalf("sentadilla -63: %+v (quería 110 de Bea: empate, juzgada antes; el nulo de 120 no cuenta)", f.SQ)
	}
	if f.BP == nil || f.BP.Kg != 60 || f.BP.AtletaID != a || f.DL != nil {
		t.Fatalf("banca/peso muerto -63: %+v / %+v (el pendiente de 70 no cuenta)", f.BP, f.DL)
	}
	if got[1].SQ != nil || got[1].BP != nil || got[1].DL != nil {
		t.Fatalf("-83 sin válidos: %+v", got[1])
	}
}
