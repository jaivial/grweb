package juegos

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// mercadoDePrueba inserts one open market with three athlete options.
func mercadoDePrueba(t *testing.T, pdb *pgxpool.Pool, cid, jid uuid.UUID) (uuid.UUID, []uuid.UUID) {
	t.Helper()
	mid := uuid.Must(uuid.NewV7())
	ops := []uuid.UUID{uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())}
	if _, err := pdb.Exec(context.Background(), `INSERT INTO mercados (id, competition_id, jornada_id, tipo, sexo, categoria, movimiento, titulo, opciones)
		VALUES ($1,$2,$3,'categoria','M','-93','','Ganador M −93',$4)`, mid, cid, jid, ops); err != nil {
		t.Fatalf("mercado de prueba: %v", err)
	}
	return mid, ops
}

// apostarDePrueba gives the bet directly (the spend path is covered by the wallet tests; here we need settled
// pots).
func apostarDePrueba(t *testing.T, pdb *pgxpool.Pool, j jornada, mid, fanID, atletaID uuid.UUID, importe int64) {
	t.Helper()
	if err := db.Tx(context.Background(), pdb, func(tx pgx.Tx) error {
		return gastarTx(context.Background(), tx, j, fanID, Porra, importe, "apuesta", "apuesta:"+uuid.NewString(), "fan")
	}); err != nil {
		t.Fatalf("apuesta de prueba: %v", err)
	}
	if _, err := pdb.Exec(context.Background(), `INSERT INTO apuestas (id, competition_id, jornada_id, mercado_id, fan_id, atleta_id, importe)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, uuid.Must(uuid.NewV7()), j.CompetitionID, j.ID, mid, fanID, atletaID, importe); err != nil {
		t.Fatalf("apuesta de prueba: %v", err)
	}
}

// mercadoRowDe reads one market row for the settlement.
func mercadoRowDe(t *testing.T, pdb *pgxpool.Pool, mid uuid.UUID) mercadoRow {
	t.Helper()
	var mc mercadoRow
	if err := pdb.QueryRow(context.Background(), `SELECT id, tipo, sexo, categoria, movimiento, estado, opciones FROM mercados WHERE id = $1`, mid).
		Scan(&mc.ID, &mc.Tipo, &mc.Sexo, &mc.Categoria, &mc.Movimiento, &mc.Estado, &mc.Opciones); err != nil {
		t.Fatal(err)
	}
	return mc
}

// The parimutuel settlement against PostgreSQL: proportional payout, tie and nobody hit, with idempotency.
// Each subtest gets its own jornada (the market key is unique per jornada).
func TestLiquidacionParimutuel(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	liquidar := func(cid uuid.UUID, j jornada, mc mercadoRow, ganadores []uuid.UUID) {
		t.Helper()
		cfg, err := configJuegos(ctx, pdb, cid)
		if err != nil {
			t.Fatal(err)
		}
		if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			return liquidarMercadoTx(ctx, tx, cid, j, cfg, &mc, resultadoMercado{definitivo: true, ganadores: ganadores})
		}); err != nil {
			t.Fatalf("liquidación: %v", err)
		}
	}

	t.Run("proporcional", func(t *testing.T) {
		cid, j := nuevaJornada(t, pdb, "en_juego")
		mid, ops := mercadoDePrueba(t, pdb, cid, j.ID)
		f1, f2, f3 := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
		for _, f := range []uuid.UUID{f1, f2, f3} {
			if _, err := abrirCarteraTx(ctx, pdb, j, f, Porra); err != nil {
				t.Fatal(err)
			}
		}
		apostarDePrueba(t, pdb, j, mid, f1, ops[0], 1000)
		apostarDePrueba(t, pdb, j, mid, f2, ops[1], 1000)
		apostarDePrueba(t, pdb, j, mid, f3, ops[0], 1000)
		// Winner ops[0]: pot 3.000, 2.000 bet on the winner → 1.500 each (99.000 + 1.500).
		mc := mercadoRowDe(t, pdb, mid)
		liquidar(cid, j, mc, []uuid.UUID{ops[0]})
		if saldoDe(t, pdb, j.ID, f1, Porra) != 100_500 || saldoDe(t, pdb, j.ID, f3, Porra) != 100_500 {
			t.Fatalf("premios incorrectos: %d y %d", saldoDe(t, pdb, j.ID, f1, Porra), saldoDe(t, pdb, j.ID, f3, Porra))
		}
		if saldoDe(t, pdb, j.ID, f2, Porra) != 99_000 {
			t.Fatalf("el perdedor no debe cobrar: %d", saldoDe(t, pdb, j.ID, f2, Porra))
		}
		// Idempotent: settling again changes nothing.
		liquidar(cid, j, mc, []uuid.UUID{ops[0]})
		if saldoDe(t, pdb, j.ID, f1, Porra) != 100_500 {
			t.Fatalf("la liquidación repetida pagó dos veces: %d", saldoDe(t, pdb, j.ID, f1, Porra))
		}
	})

	t.Run("empate", func(t *testing.T) {
		cid, j := nuevaJornada(t, pdb, "en_juego")
		mid, ops := mercadoDePrueba(t, pdb, cid, j.ID)
		f1, f2 := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
		for _, f := range []uuid.UUID{f1, f2} {
			if _, err := abrirCarteraTx(ctx, pdb, j, f, Porra); err != nil {
				t.Fatal(err)
			}
		}
		apostarDePrueba(t, pdb, j, mid, f1, ops[0], 700)
		apostarDePrueba(t, pdb, j, mid, f2, ops[1], 300)
		// Tie ops[0]/ops[1]: the pot (1.000) is shared among the bets to both winners: each one gets his stake back.
		liquidar(cid, j, mercadoRowDe(t, pdb, mid), []uuid.UUID{ops[0], ops[1]})
		if saldoDe(t, pdb, j.ID, f1, Porra) != 100_000 || saldoDe(t, pdb, j.ID, f2, Porra) != 100_000 {
			t.Fatalf("reparto con empate incorrecto: %d y %d", saldoDe(t, pdb, j.ID, f1, Porra), saldoDe(t, pdb, j.ID, f2, Porra))
		}
	})

	t.Run("nadie acierta", func(t *testing.T) {
		cid, j := nuevaJornada(t, pdb, "en_juego")
		mid, ops := mercadoDePrueba(t, pdb, cid, j.ID)
		f1 := uuid.Must(uuid.NewV7())
		if _, err := abrirCarteraTx(ctx, pdb, j, f1, Porra); err != nil {
			t.Fatal(err)
		}
		apostarDePrueba(t, pdb, j, mid, f1, ops[0], 900)
		liquidar(cid, j, mercadoRowDe(t, pdb, mid), []uuid.UUID{ops[1]}) // nobody bet on the winner
		if saldoDe(t, pdb, j.ID, f1, Porra) != 100_000 {
			t.Fatalf("devolución incorrecta: %d", saldoDe(t, pdb, j.ID, f1, Porra))
		}
	})
}
