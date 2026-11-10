package juegos

import (
	"testing"

	"github.com/google/uuid"
)

// ---- pure rules: clause variation (contract §6.3 + coordinator update) ----

func TestVariarClausula(t *testing.T) {
	const min, max = int64(50000), int64(5000000)
	casos := []struct {
		nombre   string
		clausula int64
		pct      float64
		esperada int64
		delta    int64
	}{
		{"un punto de nota +4 %", 200000, 4, 208000, 8000},
		{"un nulo −0,3 → −1,2 %", 200000, -1.2, 198000, -2000},
		{"blanqueo −30 %", 200000, -30, 140000, -60000},
		{"demanda +3 %", 200000, 3, 206000, 6000},
		{"nota +0,56 → +2,24 %", 200000, 2.24, 204000, 4000},
		{"redondeo a 1.000", 50500, 5, 53000, 2500}, // 53.025 → 53.000
		{"mínimo 50.000", 50500, -4, 50000, -500},   // 48.480 → 50.000 (tope)
		{"máximo 5.000.000", 4900000, 25, 5000000, 100000},
		{"sin cambio", 200000, 0, 200000, 0},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			nueva, delta := variarClausula(c.clausula, c.pct, min, max)
			if nueva != c.esperada || delta != c.delta {
				t.Fatalf("variarClausula(%d, %v) = (%d, %d); quería (%d, %d)", c.clausula, c.pct, nueva, delta, c.esperada, c.delta)
			}
		})
	}
}

// ---- pure rules: parimutuel pot split (contract §6.2, including tie and nobody hit) ----

func TestRepartoBote(t *testing.T) {
	A, B, C := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
	b1, b2, b3 := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())

	t.Run("un ganador", func(t *testing.T) {
		// pot 4.000: winner A took 1.000 of 4.000 → he takes the whole pot.
		premios := repartoBote([]apuestaLote{{ID: b1, AtletaID: A, FanID: uuid.Must(uuid.NewV7()), Importe: 1000},
			{ID: b2, AtletaID: B, FanID: uuid.Must(uuid.NewV7()), Importe: 3000}}, []uuid.UUID{A})
		if len(premios) != 1 || premios[0].ApuestaID != b1 || premios[0].Importe != 4000 {
			t.Fatalf("reparto incorrecto: %+v", premios)
		}
	})

	t.Run("proporcional", func(t *testing.T) {
		// pot 4.000, winner bets 1.000+3.000 → floor proportional, no rounding remainder.
		f1, f2 := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
		premios := repartoBote([]apuestaLote{{ID: b1, AtletaID: A, FanID: f1, Importe: 1000},
			{ID: b3, AtletaID: A, FanID: f2, Importe: 3000}}, []uuid.UUID{A})
		if premios[0].Importe != 1000 || premios[1].Importe != 3000 {
			t.Fatalf("reparto proporcional incorrecto: %+v", premios)
		}
	})

	t.Run("empate reparte entre todos", func(t *testing.T) {
		// tied A and B: bets to both share the pot (2.000 winner → 1.000 each).
		f1, f2 := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
		premios := repartoBote([]apuestaLote{{ID: b1, AtletaID: A, FanID: f1, Importe: 1000},
			{ID: b2, AtletaID: B, FanID: f2, Importe: 1000}}, []uuid.UUID{A, B})
		if len(premios) != 2 || premios[0].Importe != 1000 || premios[1].Importe != 1000 {
			t.Fatalf("reparto con empate incorrecto: %+v", premios)
		}
	})

	t.Run("nadie acierta devolución", func(t *testing.T) {
		f1, f2 := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
		premios := repartoBote([]apuestaLote{{ID: b1, AtletaID: A, FanID: f1, Importe: 700},
			{ID: b2, AtletaID: B, FanID: f2, Importe: 300}}, []uuid.UUID{C})
		if len(premios) != 2 {
			t.Fatalf("devolución incompleta: %+v", premios)
		}
		for _, p := range premios {
			esperado := int64(700)
			if p.ApuestaID == b2 {
				esperado = 300
			}
			if p.Importe != esperado {
				t.Fatalf("devolución incorrecta: %+v", premios)
			}
		}
	})
}
