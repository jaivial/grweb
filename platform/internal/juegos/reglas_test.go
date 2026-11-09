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
		pct      int
		esperada int64
		delta    int64
	}{
		{"intento válido +5 %", 200000, 5, 210000, 10000},
		{"intento nulo −4 %", 200000, -4, 192000, -8000},
		{"blanqueo −30 %", 200000, -30, 140000, -60000},
		{"demanda +3 %", 200000, 3, 206000, 6000},
		{"puesto 1.º +25 %", 200000, 25, 250000, 50000},
		{"puesto 2.º +15 %", 200000, 15, 230000, 30000},
		{"puesto 3.º +8 %", 200000, 8, 216000, 16000},
		{"redondeo a 1.000", 50500, 5, 53000, 2500}, // 53.025 → 53.000
		{"mínimo 50.000", 50500, -4, 50000, -500},   // 48.480 → 50.000 (tope)
		{"máximo 5.000.000", 4900000, 25, 5000000, 100000},
		{"sin cambio", 200000, 0, 200000, 0},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			nueva, delta := variarClausula(c.clausula, c.pct, min, max)
			if nueva != c.esperada || delta != c.delta {
				t.Fatalf("variarClausula(%d, %d) = (%d, %d); quería (%d, %d)", c.clausula, c.pct, nueva, delta, c.esperada, c.delta)
			}
		})
	}
}

// ---- pure rules: points table (contract §6.3; «Pleno 9/9» +5 per coordinator) ----

func TestPuntosPuestos(t *testing.T) {
	p := puntosPorDefecto()
	if p.IntentoValido != 3 || p.Pleno != 5 || p.Blanqueo != -15 {
		t.Fatalf("tabla por defecto incorrecta: %+v", p)
	}
	cats := map[int]int{1: 20, 2: 14, 3: 10, 4: 5, 5: 5, 6: 2, 9: 2, 0: 0}
	for puesto, esperado := range cats {
		if got := puntosPuestoCat(p, puesto); got != esperado {
			t.Fatalf("puntosPuestoCat(%d) = %d; quería %d", puesto, got, esperado)
		}
	}
	gls := map[int]int{1: 25, 2: 18, 3: 12, 4: 4, 10: 4, 11: 0, 0: 0}
	for puesto, esperado := range gls {
		if got := puntosPuestoGL(p, puesto); got != esperado {
			t.Fatalf("puntosPuestoGL(%d) = %d; quería %d", puesto, got, esperado)
		}
	}
	movs := map[int]int{1: 10, 2: 6, 3: 3, 4: 0, 0: 0}
	for puesto, esperado := range movs {
		if got := puntosPuestoMov(p, puesto); got != esperado {
			t.Fatalf("puntosPuestoMov(%d) = %d; quería %d", puesto, got, esperado)
		}
	}
	if puntosIntento(p, "valido") != 3 || puntosIntento(p, "nulo") != 0 || puntosIntento(p, "renuncia") != 0 {
		t.Fatalf("puntosIntento incorrecto")
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
