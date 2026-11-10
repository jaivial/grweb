package juegos

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// svcCompleta builds a service with the pool for the sync functions.
func svcCompleta(pdb *pgxpool.Pool) *Svc {
	return &Svc{a: &app.App{DB: pdb, Log: slog.Default()}}
}

// aplicar applies one scoreboard diff in a transaction (the worker's inner steps of sincronizar).
func aplicar(t *testing.T, s *Svc, cid uuid.UUID, j jornada, cfg *Config, m *Marcador) {
	t.Helper()
	if err := db.Tx(context.Background(), s.a.DB, func(tx pgx.Tx) error {
		if err := subirAtletasTx(context.Background(), tx, cid, j, m, cfg); err != nil {
			return err
		}
		if err := aplicarNotasTx(context.Background(), tx, cid, j, cfg, m); err != nil {
			return err
		}
		mercados, err := cargarMercadosTx(context.Background(), tx, j.ID)
		if err != nil {
			return err
		}
		if err := cerrarMercadosTx(context.Background(), tx, cid, j, m, mercados); err != nil {
			return err
		}
		return s.aplicarPublicacionesTx(context.Background(), tx, cid, j, cfg, m, mercados)
	}); err != nil {
		t.Fatalf("aplicar marcador: %v", err)
	}
}

// The scoreboard diff (BIZ-143): the grade of an athlete moves his clause 4 % per point, a replay changes nothing,
// a jury correction is just another diff and a bomb-out sets the grade to 0 and takes 30 % once.
func TestSincronizarNotas(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	s := svcCompleta(pdb)
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, uuid.Nil, nil, 200000)
	notaDe := func() *float64 {
		var n *float64
		if err := pdb.QueryRow(ctx, `SELECT nota::float8 FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, aid).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	m := &Marcador{Atletas: []MarcadorAtleta{{
		AtletaID: aid, NombrePublico: "Atleta de prueba", Sexo: "M", Categoria: "-93",
		Intentos: map[string][]MarcadorIntento{"sq": {{N: 1, Peso: 200, Resultado: "pendiente"}}},
	}}}
	aplicar(t, s, cid, j, cfg, m)
	if notaDe() != nil || clausulaDe(t, pdb, j.ID, aid) != 200000 {
		t.Fatal("un atleta sin intentos juzgados no tiene nota ni mueve la cláusula")
	}

	// One valid attempt: nota 5 × 1/9 = 0,56 → cláusula +2,24 % → 204.480 → 204.000.
	m.Atletas[0].Intentos["sq"][0].Resultado = "valido"
	for i := 0; i < 2; i++ { // the second pass is a replay: nothing changes
		aplicar(t, s, cid, j, cfg, m)
		if n := notaDe(); n == nil || *n != 0.56 {
			t.Fatalf("nota tras intento válido = %v; quería 0,56", n)
		}
		if got := clausulaDe(t, pdb, j.ID, aid); got != 204000 {
			t.Fatalf("cláusula tras intento válido (pasada %d) = %d; quería 204.000", i+1, got)
		}
	}

	// Correction válido → nulo: nota 0 (−0,3 acotada a 0) → cláusula −2,24 % → 199.000.
	m.Atletas[0].Intentos["sq"][0].Resultado = "nulo"
	aplicar(t, s, cid, j, cfg, m)
	if n := notaDe(); n == nil || *n != 0 {
		t.Fatalf("nota tras corrección = %v; quería 0", n)
	}
	if got := clausulaDe(t, pdb, j.ID, aid); got != 199000 {
		t.Fatalf("cláusula tras corrección = %d; quería 199.000", got)
	}

	// Bomb-out in banca (3 nulos en un movimiento): nota 0 absoluto y −30 % una sola vez: 199.000 → 139.000.
	m.Atletas[0].Intentos["sq"][0].Resultado = "valido"
	m.Atletas[0].Intentos["bp"] = []MarcadorIntento{{N: 1, Peso: 220, Resultado: "nulo"}, {N: 2, Peso: 220, Resultado: "nulo"}, {N: 3, Peso: 220, Resultado: "nulo"}}
	m.Atletas[0].Blanqueo = map[string]bool{"bp": true}
	for i := 0; i < 2; i++ {
		aplicar(t, s, cid, j, cfg, m)
		if n := notaDe(); n == nil || *n != 0 {
			t.Fatalf("nota tras blanqueo = %v; quería 0", n)
		}
		if got := clausulaDe(t, pdb, j.ID, aid); got != 139000 {
			t.Fatalf("cláusula tras blanqueo (pasada %d) = %d; quería 139.000", i+1, got)
		}
	}
}

// Publication of results (contract §6.2): liquidation of the category market, once.
func TestPublicacionResultados(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	s := svcCompleta(pdb)
	cid, j := nuevaJornada(t, pdb, "en_juego")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	fan := uuid.Must(uuid.NewV7())
	if _, err := abrirCarteraTx(ctx, pdb, j, fan, Fantasy); err != nil {
		t.Fatal(err)
	}
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, uuid.Nil, nil, 200000)

	m := &Marcador{Atletas: []MarcadorAtleta{{
		AtletaID: aid, NombrePublico: "Atleta de prueba", Sexo: "M", Categoria: "-93",
		PuestoCategoria: 1, PuestoGL: 1, PuestoMovimiento: map[string]int{"sq": 1, "bp": 2, "dl": 3},
	}}, CategoriasPublicadas: []string{"M-93"}}
	// The category market with a bet on the winner, so the liquidation pays the pot.
	mid := uuid.Must(uuid.NewV7())
	if _, err := pdb.Exec(ctx, `INSERT INTO mercados (id, competition_id, jornada_id, tipo, sexo, categoria, movimiento, titulo, opciones)
		VALUES ($1,$2,$3,'categoria','M','-93','','Ganador M −93',$4)`, mid, cid, j.ID, []uuid.UUID{aid}); err != nil {
		t.Fatal(err)
	}
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		return gastarTx(ctx, tx, j, fan, Porra, 500, "apuesta", "apuesta:"+uuid.NewString(), "")
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := pdb.Exec(ctx, `INSERT INTO apuestas (id, competition_id, jornada_id, mercado_id, fan_id, atleta_id, importe)
		VALUES ($1,$2,$3,$4,$5,$6,500)`, uuid.Must(uuid.NewV7()), cid, j.ID, mid, fan, aid); err != nil {
		t.Fatal(err)
	}

	aplicar(t, s, cid, j, cfg, m)

	// The category market is liquidated with the winner on the podium: pot 500 → back to the only bet.
	if saldoDe(t, pdb, j.ID, fan, Porra) != 100_000 {
		t.Fatalf("bote no devuelto (única apuesta al ganador): %d", saldoDe(t, pdb, j.ID, fan, Porra))
	}
	var estado string
	if err := pdb.QueryRow(ctx, `SELECT estado FROM mercados WHERE id = $1`, mid).Scan(&estado); err != nil {
		t.Fatal(err)
	}
	if estado != "liquidado" {
		t.Fatalf("mercado = %s; quería liquidado", estado)
	}

	// Replay: the publication is not applied twice.
	aplicar(t, s, cid, j, cfg, m)
	if saldoDe(t, pdb, j.ID, fan, Porra) != 100_000 {
		t.Fatalf("la publicación repetida pagó dos veces: %d", saldoDe(t, pdb, j.ID, fan, Porra))
	}
}

func clausulaDe(t *testing.T, pdb *pgxpool.Pool, jid, aid uuid.UUID) int64 {
	t.Helper()
	var cl int64
	if err := pdb.QueryRow(context.Background(), `SELECT clausula FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2`, jid, aid).Scan(&cl); err != nil {
		t.Fatal(err)
	}
	return cl
}
