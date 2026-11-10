package juegos

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// abierto is a day with clausulazos open (the cutoff has its own test).
var abierto = clausulazoVista{Abierto: true}

func duenoEnSala(t *testing.T, q querier, sala, aid uuid.UUID) (dueno uuid.UUID, protegido bool) {
	t.Helper()
	var d *uuid.UUID
	if err := q.QueryRow(context.Background(), `SELECT dueno_fan_id, COALESCE(protegido_hasta > now(), false) FROM sala_atletas WHERE sala_id = $1 AND atleta_id = $2`, sala, aid).Scan(&d, &protegido); err != nil {
		t.Fatal(err)
	}
	if d != nil {
		dueno = *d
	}
	return
}

// The clausulazo race the client asked for (contract §12): 50 simultaneous clausulazos of the same athlete from
// 50 players of the room. Exactly one wins, the protection blocks the rest and the coins are conserved.
func TestClausulazosConcurrentes(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	dueno := nuevoFan()
	sala := salaDePrueba(t, pdb, cid, j, 10, dueno)
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &dueno, 200000)

	const n = 50
	fans := make([]uuid.UUID, n)
	for i := range fans {
		fans[i] = nuevoFan()
	}
	sociosDePrueba(t, pdb, j, sala, fans...)

	var ganados atomic.Int64
	var wg sync.WaitGroup
	for _, f := range fans {
		wg.Add(1)
		go func(fan uuid.UUID) {
			defer wg.Done()
			e := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
				return s.clausulazoTx(ctx, tx, cid, j, cfg, abierto, sala, fan, "fan"+fan.String()[:6], aid)
			})
			if e == nil {
				ganados.Add(1)
			} else if c := codigoDe(t, e); c != "ATLETA_PROTEGIDO" {
				t.Errorf("clausulazo fallido con código inesperado: %s", c)
			}
		}(f)
	}
	wg.Wait()

	if ganados.Load() != 1 {
		t.Fatalf("clausulazos ganados = %d; quería exactamente 1", ganados.Load())
	}
	duenoActual, protegido := duenoEnSala(t, pdb, sala, aid)
	if !protegido {
		t.Fatal("el atleta debería estar protegido tras el clausulazo")
	}
	// Conservation: every wallet started at 1.000.000. The winner paid 200.000 to the owner: the total must hold.
	var suma int64
	if err := pdb.QueryRow(ctx, `SELECT coalesce(sum(saldo),0) FROM saldos WHERE jornada_id = $1 AND moneda = 'fantasy'`, j.ID).Scan(&suma); err != nil {
		t.Fatal(err)
	}
	if esperado := int64(n+1) * 1_000_000; suma != esperado {
		t.Fatalf("suma de monedas = %d; quería %d (se conserva)", suma, esperado)
	}
	if saldoDe(t, pdb, j.ID, dueno, Fantasy) != 1_200_000 {
		t.Fatalf("el dueño anterior debía cobrar la cláusula; saldo %d", saldoDe(t, pdb, j.ID, dueno, Fantasy))
	}
	if saldoDe(t, pdb, j.ID, duenoActual, Fantasy) != 800_000 {
		t.Fatalf("el ganador debía gastar la cláusula; saldo %d", saldoDe(t, pdb, j.ID, duenoActual, Fantasy))
	}
}

// The limits of the clausulazo: protection window, max per fan and jornada (3, configurable), no clausulazo with a
// full lineup, closed from the last session of the day, and only inside the fan's own room.
func TestClausulazoLimites(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	clausular := func(cierre clausulazoVista, sala, fan, aid uuid.UUID) error {
		return db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			return s.clausulazoTx(ctx, tx, cid, j, cfg, cierre, sala, fan, "fan", aid)
		})
	}

	t.Run("protección", func(t *testing.T) {
		dueno, retador, otro := nuevoFan(), nuevoFan(), nuevoFan()
		sala := salaDePrueba(t, pdb, cid, j, 10, dueno, retador, otro)
		aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &dueno, 200000)
		if err := clausular(abierto, sala, retador, aid); err != nil {
			t.Fatalf("primer clausulazo: %v", err)
		}
		if c := codigoDe(t, clausular(abierto, sala, otro, aid)); c != "ATLETA_PROTEGIDO" {
			t.Fatalf("segundo clausulazo = %s; quería ATLETA_PROTEGIDO", c)
		}
	})

	t.Run("máximo 3 clausulazos", func(t *testing.T) {
		victima, cazador := nuevoFan(), nuevoFan()
		sala := salaDePrueba(t, pdb, cid, j, 10, victima, cazador)
		for i := 0; i < 4; i++ {
			// A fresh owned athlete for each round; the hunter pays the clause.
			aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &victima, 50000)
			err := clausular(abierto, sala, cazador, aid)
			if i < 3 && err != nil {
				t.Fatalf("clausulazo %d: %v", i+1, err)
			}
			if i == 3 && codigoDe(t, err) != "MAX_CLAUSULAZOS" {
				t.Fatalf("clausulazo 4 = %v; quería MAX_CLAUSULAZOS", err)
			}
		}
	})

	t.Run("alineación llena", func(t *testing.T) {
		dueno, retador := nuevoFan(), nuevoFan()
		sala := salaDePrueba(t, pdb, cid, j, 10, dueno, retador)
		for i := 0; i < cfg.PlantillaMax; i++ {
			atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &retador, 50000)
		}
		aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &dueno, 50000)
		if c := codigoDe(t, clausular(abierto, sala, retador, aid)); c != "PLANTILLA_LLENA" {
			t.Fatalf("clausulazo con alineación llena = %s; quería PLANTILLA_LLENA", c)
		}
	})

	t.Run("cerrado desde la última sesión y sin horario", func(t *testing.T) {
		dueno, retador := nuevoFan(), nuevoFan()
		sala := salaDePrueba(t, pdb, cid, j, 10, dueno, retador)
		aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &dueno, 50000)
		for _, cierre := range []clausulazoVista{{Motivo: "sin_horario"}, {Motivo: "ultima_sesion"}} {
			if c := codigoDe(t, clausular(cierre, sala, retador, aid)); c != "CLAUSULAZO_CERRADO" {
				t.Fatalf("clausulazo con %s = %s; quería CLAUSULAZO_CERRADO", cierre.Motivo, c)
			}
		}
		if d, _ := duenoEnSala(t, pdb, sala, aid); d != dueno {
			t.Fatal("un clausulazo cerrado cambió el dueño")
		}
	})

	t.Run("solo en mi sala", func(t *testing.T) {
		dueno, forastero := nuevoFan(), nuevoFan()
		sala := salaDePrueba(t, pdb, cid, j, 10, dueno)
		salaDePrueba(t, pdb, cid, j, 10, forastero)
		aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &dueno, 50000)
		if c := codigoDe(t, clausular(abierto, sala, forastero, aid)); c != "SIN_SALA" {
			t.Fatalf("clausulazo desde otra sala = %s; quería SIN_SALA", c)
		}
	})
}

// One owner at most per athlete and room: a second buy in the room fails, but the same athlete is free in another
// room (BIZ-143: each room has its own market).
func TestCompraAtletaLibre(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	fan1, fan2, fan3 := nuevoFan(), nuevoFan(), nuevoFan()
	sala := salaDePrueba(t, pdb, cid, j, 10, fan1, fan2)
	otraSala := salaDePrueba(t, pdb, cid, j, 10, fan3)
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, nil, 200000)
	comprar := func(sala, fan uuid.UUID) error {
		return db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.comprarTx(ctx, tx, cid, j, cfg, sala, fan, "fan", aid) })
	}
	if err := comprar(sala, fan1); err != nil {
		t.Fatalf("compra: %v", err)
	}
	if c := codigoDe(t, comprar(sala, fan2)); c != "YA_CON_DUENO" {
		t.Fatalf("segunda compra = %s; quería YA_CON_DUENO", c)
	}
	// The buy charges the clause and applies the +3 % demand (contract §6.3).
	if saldoDe(t, pdb, j.ID, fan1, Fantasy) != 1_000_000-200_000 {
		t.Fatalf("saldo tras compra = %d; quería 800.000", saldoDe(t, pdb, j.ID, fan1, Fantasy))
	}
	if cl := clausulaDe(t, pdb, j.ID, aid); cl != 206000 { // 200.000 + 3 %, redondeo a 1.000
		t.Fatalf("cláusula tras compra = %d; quería 206.000", cl)
	}
	if err := comprar(otraSala, fan3); err != nil {
		t.Fatalf("el mismo atleta debía estar libre en otra sala: %v", err)
	}
}

// One fan firing 20 purchases of 20 different free athletes at once: the lineup limit holds (never more than 5),
// because the buyer's wallet row serializes his own signings.
func TestComprasConcurrentesMismoFan(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PlantillaMax != 5 {
		t.Fatalf("alineación = %d; quería 5 (sin suplentes)", cfg.PlantillaMax)
	}
	fan := nuevoFan()
	sala := salaDePrueba(t, pdb, cid, j, 10, fan)
	ids := make([]uuid.UUID, 20)
	for i := range ids {
		ids[i] = atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, nil, 50000)
	}
	var wg sync.WaitGroup
	var ok atomic.Int32
	for _, aid := range ids {
		wg.Add(1)
		go func(aid uuid.UUID) {
			defer wg.Done()
			if db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.comprarTx(ctx, tx, cid, j, cfg, sala, fan, "fan", aid) }) == nil {
				ok.Add(1)
			}
		}(aid)
	}
	wg.Wait()
	var total int
	if err := pdb.QueryRow(ctx, `SELECT count(*) FROM sala_atletas WHERE sala_id = $1 AND dueno_fan_id = $2`, sala, fan).Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total != cfg.PlantillaMax || int(ok.Load()) != cfg.PlantillaMax {
		t.Fatalf("alineación = %d (compras ok %d); quería %d", total, ok.Load(), cfg.PlantillaMax)
	}
}
