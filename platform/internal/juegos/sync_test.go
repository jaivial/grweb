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
		ats, err := cargarFantasyTx(context.Background(), tx, j.ID)
		if err != nil {
			return err
		}
		vistos, err := cargarVistosTx(context.Background(), tx, j.ID)
		if err != nil {
			return err
		}
		if err := aplicarIntentosTx(context.Background(), tx, cid, j, cfg, m, ats, vistos); err != nil {
			return err
		}
		mercados, err := cargarMercadosTx(context.Background(), tx, j.ID)
		if err != nil {
			return err
		}
		if err := cerrarMercadosTx(context.Background(), tx, cid, j, m, mercados); err != nil {
			return err
		}
		return s.aplicarPublicacionesTx(context.Background(), tx, cid, j, cfg, m, ats, mercados)
	}); err != nil {
		t.Fatalf("aplicar marcador: %v", err)
	}
}

// The scoreboard diff (contract §6.3): new verdicts pay points to the owner titular at the verdict moment and
// move the clause; a replay changes nothing; a correction rewrites the points without changing the owner.
func TestSincronizarIntentos(t *testing.T) {
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
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, &fan, true, 200000)

	m := &Marcador{Atletas: []MarcadorAtleta{{
		AtletaID: aid, NombrePublico: "Atleta de prueba", Sexo: "M", Categoria: "-93",
		Intentos: map[string][]MarcadorIntento{"sq": {{N: 1, Peso: 200, Resultado: "valido"}}},
	}}}
	aplicar(t, s, cid, j, cfg, m)

	if got := clausulaDe(t, pdb, j.ID, aid); got != 210000 {
		t.Fatalf("cláusula tras intento válido = %d; quería 210.000 (+5 %%%%)", got)
	}
	if got := puntosDe(t, pdb, j.ID, fan); got != 3 {
		t.Fatalf("puntos = %d; quería 3", got)
	}
	var duenoVisto uuid.UUID
	var titular bool
	if err := pdb.QueryRow(ctx, `SELECT dueno_fan_id, titular FROM intentos_vistos WHERE jornada_id = $1 AND atleta_id = $2 AND mov = 'sq' AND numero = 1`, j.ID, aid).Scan(&duenoVisto, &titular); err != nil {
		t.Fatalf("intentos_vistos: %v", err)
	}
	if duenoVisto != fan || !titular {
		t.Fatalf("atribución del veredicto incorrecta: dueno=%v titular=%v", duenoVisto, titular)
	}

	// Replay of the same scoreboard: nothing changes (idempotencia).
	aplicar(t, s, cid, j, cfg, m)
	if got := clausulaDe(t, pdb, j.ID, aid); got != 210000 {
		t.Fatalf("la repetición cambió la cláusula: %d", got)
	}
	if got := puntosDe(t, pdb, j.ID, fan); got != 3 {
		t.Fatalf("la repetición pagó dos veces: %d puntos", got)
	}

	// Correction: válido → nulo. The owner stays (the frozen attribution), the points row disappears and the
	// clause reverses (+5 % back) and applies −4 % (contract §6.3).
	m.Atletas[0].Intentos["sq"][0].Resultado = "nulo"
	aplicar(t, s, cid, j, cfg, m)
	if got := clausulaDe(t, pdb, j.ID, aid); got != 192000 {
		t.Fatalf("cláusula tras corrección = %d; quería 192.000", got)
	}
	if got := puntosDe(t, pdb, j.ID, fan); got != 0 {
		t.Fatalf("la corrección dejó puntos: %d", got)
	}
	var duenoTras uuid.UUID
	var resultado string
	if err := pdb.QueryRow(ctx, `SELECT dueno_fan_id, resultado FROM intentos_vistos WHERE jornada_id = $1 AND atleta_id = $2 AND mov = 'sq' AND numero = 1`, j.ID, aid).Scan(&duenoTras, &resultado); err != nil {
		t.Fatal(err)
	}
	if duenoTras != fan || resultado != "nulo" {
		t.Fatalf("la corrección cambió el dueño o el resultado: %v %s", duenoTras, resultado)
	}

	// Bomb-out in banca (3 nulos): each null −4 % and the bomb-out −30 % once; −15 points once (contract §6.3).
	// 192.000 → 184.000 → 177.000 → 170.000 (three nulls) → 119.000 (blanqueo −30 %).
	m.Atletas[0].Intentos["bp"] = []MarcadorIntento{{N: 1, Peso: 220, Resultado: "nulo"}, {N: 2, Peso: 220, Resultado: "nulo"}, {N: 3, Peso: 220, Resultado: "nulo"}}
	m.Atletas[0].Blanqueo = map[string]bool{"bp": true}
	aplicar(t, s, cid, j, cfg, m)
	if got := clausulaDe(t, pdb, j.ID, aid); got != 119000 {
		t.Fatalf("cláusula tras blanqueo = %d; quería 119.000", got)
	}
	if got := puntosDe(t, pdb, j.ID, fan); got != -15 {
		t.Fatalf("puntos tras blanqueo = %d; quería −15", got)
	}
	aplicar(t, s, cid, j, cfg, m) // replay: the bomb-out is not applied twice
	if got := clausulaDe(t, pdb, j.ID, aid); got != 119000 || puntosDe(t, pdb, j.ID, fan) != -15 {
		t.Fatalf("el blanqueo se aplicó dos veces: cláusula %d, puntos %d", got, puntosDe(t, pdb, j.ID, fan))
	}
}

// Publication of results (contract §6.2–6.3): category points and clause by place, liquidation of the category
// market, and per-sex points (GL and movements) once every category is published.
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
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, &fan, true, 200000)

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

	// Points: cat 20 (1.º) + gl 25 (1.º) + mov sq 10 + mov bp 6 + mov dl 3 = 64.
	if got := puntosDe(t, pdb, j.ID, fan); got != 64 {
		t.Fatalf("puntos tras publicación = %d; quería 64", got)
	}
	// Clause: +25 % for the 1st place: 200.000 → 250.000.
	if got := clausulaDe(t, pdb, j.ID, aid); got != 250000 {
		t.Fatalf("cláusula tras publicación = %d; quería 250.000", got)
	}
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

	// Replay: publication is not applied twice.
	aplicar(t, s, cid, j, cfg, m)
	if got := puntosDe(t, pdb, j.ID, fan); got != 64 || clausulaDe(t, pdb, j.ID, aid) != 250000 {
		t.Fatalf("la publicación repetida pagó dos veces: puntos %d cláusula %d", got, clausulaDe(t, pdb, j.ID, aid))
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

func puntosDe(t *testing.T, pdb *pgxpool.Pool, jid, fanID uuid.UUID) int {
	t.Helper()
	var n *int
	if err := pdb.QueryRow(context.Background(), `SELECT sum(puntos) FROM puntos WHERE jornada_id = $1 AND fan_id = $2`, jid, fanID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n == nil {
		return 0
	}
	return *n
}
