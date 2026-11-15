package juegos

import (
	"context"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// svcDePrueba builds the minimum service the worker handlers need (only the DB pool).
func svcDePrueba(pdb *pgxpool.Pool) *Svc {
	return &Svc{a: &app.App{DB: pdb, Log: slog.Default()}}
}

func datoJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// Duplicate rewards (contract §12): the same event twice credits once (refs hito:<j>:<fan>:<N>:<moneda>).
func TestRecompensaHitoDuplicada(t *testing.T) {
	pdb := testDB(t)
	s := svcDePrueba(pdb)
	cid, j := nuevaJornada(t, pdb, "abierta")
	fan := uuid.Must(uuid.NewV7())
	dato := datoJSON(t, datoHito{FanID: fan, Dia: j.Dia, Mensajes: 5, Alias: "pepe"})
	for i := 0; i < 2; i++ {
		if err := s.recompensaHito(context.Background(), cid, dato); err != nil {
			t.Fatalf("hito: %v", err)
		}
	}
	if got := saldoDe(t, pdb, j.ID, fan, Porra); got != SaldoAlta(Porra)+100 {
		t.Fatalf("porra = %d; quería %d", got, SaldoAlta(Porra)+100)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got != SaldoAlta(Fantasy)+10000 {
		t.Fatalf("fantasy = %d; quería %d", got, SaldoAlta(Fantasy)+10000)
	}
	// The alias arrives with the reward and stays in the wallet (for the ranking).
	var alias string
	if err := pdb.QueryRow(context.Background(), `SELECT alias FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'porra'`, j.ID, fan).Scan(&alias); err != nil {
		t.Fatal(err)
	}
	if alias != "pepe" {
		t.Fatalf("alias no guardado: %q", alias)
	}
}

// The milestone of 10 adds to the one of 5 (contract §6.4): +600 porra and +60.000 fantasy in total.
func TestRecompensaHito10Suma(t *testing.T) {
	pdb := testDB(t)
	s := svcDePrueba(pdb)
	cid, j := nuevaJornada(t, pdb, "abierta")
	fan := uuid.Must(uuid.NewV7())
	dato := datoJSON(t, datoHito{FanID: fan, Dia: j.Dia, Mensajes: 10})
	if err := s.recompensaHito(context.Background(), cid, dato); err != nil {
		t.Fatal(err)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Porra); got != SaldoAlta(Porra)+600 {
		t.Fatalf("porra = %d; quería %d (+100 del múltiplo de 5 y +500 del de 10)", got, SaldoAlta(Porra)+600)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got != SaldoAlta(Fantasy)+60000 {
		t.Fatalf("fantasy = %d; quería %d", got, SaldoAlta(Fantasy)+60000)
	}
}

// A donation credits fantasy (never porra) and the refund withdraws up to the balance, once.
func TestDonacionYReembolso(t *testing.T) {
	pdb := testDB(t)
	s := svcDePrueba(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")
	fan := uuid.Must(uuid.NewV7())
	donacion := uuid.Must(uuid.NewV7())

	// 5 € = 500 cents → 50.000 fantasy coins.
	dato := datoJSON(t, datoDonacion{DonacionID: donacion, FanID: fan, Importe: 500, Alias: "donante", Dia: j.Dia})
	if err := s.recompensaDonacion(ctx, cid, dato); err != nil {
		t.Fatal(err)
	}
	if err := s.recompensaDonacion(ctx, cid, dato); err != nil { // duplicated webhook: nothing
		t.Fatal(err)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got != SaldoAlta(Fantasy)+50_000 {
		t.Fatalf("fantasy = %d; quería %d", got, SaldoAlta(Fantasy)+50_000)
	}
	// The porra never receives money from donations: not even its wallet is opened.
	var n int
	if err := pdb.QueryRow(ctx, `SELECT count(*) FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'porra'`, j.ID, fan).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("la porra no debe tener cartera tras una donación (filas: %d)", n)
	}

	// Refund: withdraw the 50.000 credited (the balance allows it).
	reembolso := datoJSON(t, datoDonacion{DonacionID: donacion, FanID: fan, Importe: 500})
	if err := s.reembolsoDonacion(ctx, cid, reembolso); err != nil {
		t.Fatal(err)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got != SaldoAlta(Fantasy) {
		t.Fatalf("fantasy tras reembolso = %d; quería %d", got, SaldoAlta(Fantasy))
	}
	// A second refund does not withdraw anything (idempotent by ref reembolso:donacion:<id>).
	if err := s.reembolsoDonacion(ctx, cid, reembolso); err != nil {
		t.Fatal(err)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got != SaldoAlta(Fantasy) {
		t.Fatalf("el reembolso duplicado retiró dos veces: %d", got)
	}

	// Refund when the wallet cannot pay it all: only what there is (contract §5).
	donacion2 := uuid.Must(uuid.NewV7())
	dato2 := datoJSON(t, datoDonacion{DonacionID: donacion2, FanID: fan, Importe: 30000}) // 300 € → 3.000.000
	if err := s.recompensaDonacion(ctx, cid, dato2); err != nil {
		t.Fatal(err)
	}
	// The wallet spends more than its welcome balance: 4.000.000 − 1.500.000 = 2.500.000 < 3.000.000 credited.
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		return gastarTx(ctx, tx, j, fan, Fantasy, 1_500_000, "compra", "compra:test:"+uuid.NewString(), "")
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.reembolsoDonacion(ctx, cid, datoJSON(t, datoDonacion{DonacionID: donacion2})); err != nil {
		t.Fatal(err)
	}
	if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got != 0 {
		t.Fatalf("fantasy tras reembolso parcial = %d; quería 0 (nunca negativo)", got)
	}
}
