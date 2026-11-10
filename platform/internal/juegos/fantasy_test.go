package juegos

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// The clausulazo race the client asked for (contract §12): 50 simultaneous clausulazos of the same athlete from
// 50 fans. Exactly one wins, the protection blocks the rest and the coins are conserved.
func TestClausulazosConcurrentes(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	dueno := uuid.Must(uuid.NewV7())
	if _, err := abrirCarteraTx(ctx, pdb, j, dueno, Fantasy); err != nil {
		t.Fatal(err)
	}
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, &dueno, true, 200000)

	const n = 50
	fans := make([]uuid.UUID, n)
	for i := range fans {
		fans[i] = uuid.Must(uuid.NewV7())
		if _, err := abrirCarteraTx(ctx, pdb, j, fans[i], Fantasy); err != nil {
			t.Fatal(err)
		}
	}

	var ganados atomic.Int64
	var wg sync.WaitGroup
	for _, f := range fans {
		wg.Add(1)
		go func(fan uuid.UUID) {
			defer wg.Done()
			e := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
				return s.clausulazoTx(ctx, tx, cid, j, cfg, fan, "fan"+fan.String()[:6], aid)
			})
			if e == nil {
				ganados.Add(1)
			} else {
				var p *problem.Error
				if !errors.As(e, &p) {
					t.Errorf("clausulazo fallido sin código estable: %v", e)
				}
			}
		}(f)
	}
	wg.Wait()

	if ganados.Load() != 1 {
		t.Fatalf("clausulazos ganados = %d; quería exactamente 1", ganados.Load())
	}
	var duenoActual uuid.UUID
	if err := pdb.QueryRow(ctx, `SELECT dueno_fan_id FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, aid).Scan(&duenoActual); err != nil {
		t.Fatal(err)
	}
	protegido := false
	if err := pdb.QueryRow(ctx, `SELECT protegido_hasta > now() FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, aid).Scan(&protegido); err != nil {
		t.Fatal(err)
	}
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

// The limits of the clausulazo: protection window, max per fan and jornada (coordinator: 3 configurable) and no
// clausulazo with a full squad (contract §6.3).
func TestClausulazoLimites(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("protección", func(t *testing.T) {
		dueno := uuid.Must(uuid.NewV7())
		retador := uuid.Must(uuid.NewV7())
		for _, f := range []uuid.UUID{dueno, retador} {
			if _, err := abrirCarteraTx(ctx, pdb, j, f, Fantasy); err != nil {
				t.Fatal(err)
			}
		}
		aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, &dueno, true, 200000)
		if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			return s.clausulazoTx(ctx, tx, cid, j, cfg, retador, "retador", aid)
		}); err != nil {
			t.Fatalf("primer clausulazo: %v", err)
		}
		otro := uuid.Must(uuid.NewV7())
		if _, err := abrirCarteraTx(ctx, pdb, j, otro, Fantasy); err != nil {
			t.Fatal(err)
		}
		err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			return s.clausulazoTx(ctx, tx, cid, j, cfg, otro, "otro", aid)
		})
		var p *problem.Error
		if !errors.As(err, &p) || p.Code != "ATLETA_PROTEGIDO" {
			t.Fatalf("segundo clausulazo = %v; quería ATLETA_PROTEGIDO", err)
		}
	})

	t.Run("máximo 3 clausulazos", func(t *testing.T) {
		victima := uuid.Must(uuid.NewV7())
		cazador := uuid.Must(uuid.NewV7())
		for _, f := range []uuid.UUID{victima, cazador} {
			if _, err := abrirCarteraTx(ctx, pdb, j, f, Fantasy); err != nil {
				t.Fatal(err)
			}
		}
		for i := 0; i < 4; i++ {
			// A fresh owned athlete for each round; the hunter pays the clause.
			aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, &victima, true, 50000)
			err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
				return s.clausulazoTx(ctx, tx, cid, j, cfg, cazador, "cazador", aid)
			})
			if i < 3 && err != nil {
				t.Fatalf("clausulazo %d: %v", i+1, err)
			}
			if i == 3 {
				var p *problem.Error
				if !errors.As(err, &p) || p.Code != "MAX_CLAUSULAZOS" {
					t.Fatalf("clausulazo 4 = %v; quería MAX_CLAUSULAZOS", err)
				}
			}
		}
	})

	t.Run("plantilla llena", func(t *testing.T) {
		dueno := uuid.Must(uuid.NewV7())
		retador := uuid.Must(uuid.NewV7())
		if _, err := abrirCarteraTx(ctx, pdb, j, retador, Fantasy); err != nil {
			t.Fatal(err)
		}
		// A full squad (plantilla_max owned athletes).
		for i := 0; i < cfg.PlantillaMax; i++ {
			atletaFantasiaDePrueba(t, pdb, cid, j.ID, &retador, false, 50000)
		}
		aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, &dueno, true, 50000)
		err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			return s.clausulazoTx(ctx, tx, cid, j, cfg, retador, "retador", aid)
		})
		var p *problem.Error
		if !errors.As(err, &p) || p.Code != "PLANTILLA_LLENA" {
			t.Fatalf("clausulazo con plantilla llena = %v; quería PLANTILLA_LLENA", err)
		}
	})
}

// One owner at most per athlete: a second buy fails (contract §6.3).
func TestCompraAtletaLibre(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	fan1 := uuid.Must(uuid.NewV7())
	fan2 := uuid.Must(uuid.NewV7())
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, nil, false, 200000)
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		return s.comprarTx(ctx, tx, cid, j, cfg, fan1, "fan1", aid)
	}); err != nil {
		t.Fatalf("compra: %v", err)
	}
	if _, err := abrirCarteraTx(ctx, pdb, j, fan2, Fantasy); err != nil {
		t.Fatal(err)
	}
	err = db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		return s.comprarTx(ctx, tx, cid, j, cfg, fan2, "fan2", aid)
	})
	var p *problem.Error
	if !errors.As(err, &p) || p.Code != "YA_CON_DUENO" {
		t.Fatalf("segunda compra = %v; quería YA_CON_DUENO", err)
	}
	// The buy charges the clause and applies the +3 % demand (contract §6.3).
	if saldoDe(t, pdb, j.ID, fan1, Fantasy) != 1_000_000-200_000 {
		t.Fatalf("saldo tras compra = %d; quería 800.000", saldoDe(t, pdb, j.ID, fan1, Fantasy))
	}
	var cl int64
	if err := pdb.QueryRow(ctx, `SELECT clausula FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, aid).Scan(&cl); err != nil {
		t.Fatal(err)
	}
	if cl != 206000 { // 200.000 + 3 %, redondeo a 1.000
		t.Fatalf("cláusula tras compra = %d; quería 206.000", cl)
	}
}

// One fan firing 20 purchases of 20 different free athletes at once: the squad limit holds (never more than
// plantilla_max), because the buyer's wallet row serializes his own signings.
func TestComprasConcurrentesMismoFan(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	fan := uuid.Must(uuid.NewV7())
	ids := make([]uuid.UUID, 20)
	for i := range ids {
		ids[i] = atletaFantasiaDePrueba(t, pdb, cid, j.ID, nil, false, 50000)
	}
	var wg sync.WaitGroup
	var ok atomic.Int32
	for _, aid := range ids {
		wg.Add(1)
		go func(aid uuid.UUID) {
			defer wg.Done()
			if db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.comprarTx(ctx, tx, cid, j, cfg, fan, "fan", aid) }) == nil {
				ok.Add(1)
			}
		}(aid)
	}
	wg.Wait()
	var total, titulares int
	if err := pdb.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE titular) FROM fantasy_atletas WHERE jornada_id = $1 AND dueno_fan_id = $2`, j.ID, fan).Scan(&total, &titulares); err != nil {
		t.Fatal(err)
	}
	if total != cfg.PlantillaMax || int(ok.Load()) != cfg.PlantillaMax || titulares != cfg.TitularesMax {
		t.Fatalf("plantilla = %d (compras ok %d, titulares %d); quería %d y %d titulares", total, ok.Load(), titulares, cfg.PlantillaMax, cfg.TitularesMax)
	}
}
