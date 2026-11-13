package juegos

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// The concurrency test the client asked for (contract §12): 200 bets against one wallet of 100.000. The balance
// never goes negative and the ledger sums exactly.
func TestGastoConcurrente(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	_, j := nuevaJornada(t, pdb, "en_juego")
	fan := uuid.Must(uuid.NewV7())

	if _, err := abrirCarteraTx(ctx, pdb, j, fan, Porra, ""); err != nil {
		t.Fatalf("abrir cartera: %v", err)
	}
	const n, importe = 200, 500 // 200 × 500 = the whole 100.000 welcome balance
	var ok atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
				return gastarTx(ctx, tx, j, fan, Porra, importe, "apuesta", "apuesta:test:"+uuid.NewString(), "")
			})
			if e == nil {
				ok.Add(1)
			}
		}()
	}
	wg.Wait()
	if got := saldoDe(t, pdb, j.ID, fan, Porra); got != 0 {
		t.Fatalf("saldo final = %d; quería 0 (no debe quedar negativo)", got)
	}
	if ok.Load() != n {
		t.Fatalf("apuestas aceptadas = %d; quería %d", ok.Load(), n)
	}
	// The ledger sums exactly: +100.000 of alta minus 200 × 500 of bets.
	var suma int64
	if err := pdb.QueryRow(ctx, `SELECT coalesce(sum(importe),0) FROM movimientos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'porra'`, j.ID, fan).Scan(&suma); err != nil {
		t.Fatal(err)
	}
	if suma != 0 {
		t.Fatalf("la suma del libro no cuadra: %d", suma)
	}

	// And one more bet fails with the stable code, not a negative balance.
	err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		return gastarTx(ctx, tx, j, fan, Porra, 1, "apuesta", "apuesta:test-extra", "")
	})
	p, es := err.(*problem.Error)
	if !es || p.Code != "SALDO_INSUFICIENTE" {
		t.Fatalf("gasto sin saldo = %v; quería SALDO_INSUFICIENTE", err)
	}
}

// The wallet is created lazily once and the welcome balance never repeats (contract §6.1).
func TestAltaPerezosaIdempotente(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	_, j := nuevaJornada(t, pdb, "abierta")
	fan := uuid.Must(uuid.NewV7())
	var primera, segunda int64
	var err error
	err = db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		primera, err = abrirCarteraTx(ctx, tx, j, fan, Fantasy, "")
		return err
	})
	if err != nil || primera != 1_000_000 {
		t.Fatalf("primera alta = %d, err %v; quería 1.000.000", primera, err)
	}
	err = db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		segunda, err = abrirCarteraTx(ctx, tx, j, fan, Fantasy, "")
		return err
	})
	if err != nil || segunda != 1_000_000 {
		t.Fatalf("segunda alta = %d, err %v; quería 1.000.000 (sin duplicar)", segunda, err)
	}
	var altas int
	if err := pdb.QueryRow(ctx, `SELECT count(*) FROM movimientos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'fantasy' AND motivo = 'alta'`, j.ID, fan).Scan(&altas); err != nil {
		t.Fatal(err)
	}
	if altas != 1 {
		t.Fatalf("movimientos de alta = %d; quería 1", altas)
	}
}

// Credits are idempotent by ref: the same event twice pays once (contract §6.4).
func TestAcreditarIdempotente(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	_, j := nuevaJornada(t, pdb, "abierta")
	fan := uuid.Must(uuid.NewV7())
	ref := "hito:" + j.ID.String() + ":" + fan.String() + ":5:porra"
	for i := 0; i < 3; i++ {
		if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			_, err := acreditarTx(ctx, tx, j, fan, Porra, 100, "hito_chat", ref, "")
			return err
		}); err != nil {
			t.Fatalf("acreditar: %v", err)
		}
	}
	if got := saldoDe(t, pdb, j.ID, fan, Porra); got != SaldoAlta(Porra)+100 {
		t.Fatalf("saldo = %d; quería %d (una sola acreditación)", got, SaldoAlta(Porra)+100)
	}
}
