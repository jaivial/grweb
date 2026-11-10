package juegos

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// BIZ-143 round 3: a buy-and-sell loop inside a room never mints coins. The sale pays the clause of the jornada,
// not the +3 % demand the fan's own signing added to the room.
func TestComprarVenderNoDaMonedas(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	fan := nuevoFan()
	sala := salaDePrueba(t, pdb, cid, j, 4, fan)
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, uuid.Nil, nil, 200000)
	inicial := saldoDe(t, pdb, j.ID, fan, Fantasy)
	for i := 0; i < 10; i++ {
		if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.comprarTx(ctx, tx, cid, j, cfg, sala, fan, "fan", aid) }); err != nil {
			t.Fatalf("compra %d: %v", i, err)
		}
		if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.venderTx(ctx, tx, cid, j, cfg, sala, fan, "fan", aid) }); err != nil {
			t.Fatalf("venta %d: %v", i, err)
		}
		if got := saldoDe(t, pdb, j.ID, fan, Fantasy); got > inicial {
			t.Fatalf("vuelta %d: saldo %d > inicial %d: el bucle compra-venta da monedas", i, got, inicial)
		}
		// The protection window after a sale would stop the next buy of the loop.
		if _, err := pdb.Exec(ctx, `UPDATE sala_atletas SET protegido_hasta = NULL WHERE sala_id = $1`, sala); err != nil {
			t.Fatal(err)
		}
	}
	// First round trip is neutral: bought and sold at the clause of the jornada.
	var primera int64
	if err := pdb.QueryRow(ctx, `SELECT precio FROM fichajes WHERE sala_id = $1 AND tipo = 'venta' ORDER BY created_at LIMIT 1`, sala).Scan(&primera); err != nil {
		t.Fatal(err)
	}
	if primera != 200000 {
		t.Fatalf("primera venta = %d; quería 200.000 (la cláusula de la jornada)", primera)
	}
}

// BIZ-143 round 3: the host blocks the requests from the lobby (the link still lets people in) and hands the role
// to another member; a room that is not public never publishes its id on the public stream.
func TestBloquearTransferirYEventosPrivados(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")
	anfitrion, socio, ajeno := nuevoFan(), nuevoFan(), nuevoFan()
	sala, err := crearSalaPrueba(ctx, pdb, cid, j, anfitrion, "Bloqueada")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pdb.Exec(ctx, `UPDATE salas SET admite_solicitudes = false WHERE id = $1`, sala.ID); err != nil {
		t.Fatal(err)
	}
	err = db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		_, err := solicitarTx(ctx, tx, cid, j, sala.ID, ajeno, "ajeno")
		return err
	})
	if codigoDe(t, err) != "SOLICITUDES_BLOQUEADAS" {
		t.Fatalf("solicitar con la sala bloqueada = %v; quería SOLICITUDES_BLOQUEADAS", err)
	}
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		_, err := unirsePorCodigoTx(ctx, tx, cid, j, socio, "socio", sala.Codigo)
		return err
	}); err != nil {
		t.Fatalf("el enlace debía seguir entrando directo: %v", err)
	}
	var miembroSocio uuid.UUID
	if err := pdb.QueryRow(ctx, `SELECT miembro_id FROM sala_miembros WHERE sala_id = $1 AND fan_id = $2`, sala.ID, socio).Scan(&miembroSocio); err != nil {
		t.Fatal(err)
	}
	transferir := func(quien, a uuid.UUID) error {
		return db.Tx(ctx, pdb, func(tx pgx.Tx) error { return transferirTx(ctx, tx, cid, j, sala.ID, quien, a) })
	}
	if err := transferir(socio, miembroSocio); err == nil {
		t.Fatal("un jugador que no es anfitrión no puede transferir el rol")
	}
	if err := transferir(anfitrion, uuid.Must(uuid.NewV7())); err == nil {
		t.Fatal("no se puede transferir a quien no está en la sala")
	}
	// Also with the room in play.
	if _, err := pdb.Exec(ctx, `UPDATE salas SET estado = 'en_juego' WHERE id = $1`, sala.ID); err != nil {
		t.Fatal(err)
	}
	if err := transferir(anfitrion, miembroSocio); err != nil {
		t.Fatalf("transferir: %v", err)
	}
	if _, _, a := estadoSala(t, pdb, sala.ID); a != socio {
		t.Fatalf("anfitrión = %s; quería al socio", a)
	}
	if err := transferir(anfitrion, miembroSocio); err == nil {
		t.Fatal("el antiguo anfitrión ya no puede transferir")
	}

	// Private room: no event of the public stream carries its id.
	var privada *salaRow
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) (err error) {
		privada, err = crearSalaTx(ctx, tx, cid, j, ajeno, "alias", "Solo enlace r3", false, 4)
		return
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return salirTx(ctx, tx, cid, j, privada.ID, ajeno) }); err != nil {
		t.Fatal(err)
	}
	var filtrados, avisos int
	if err := pdb.QueryRow(ctx, `SELECT count(*) FILTER (WHERE payload::text LIKE '%' || $1 || '%'),
			count(*) FILTER (WHERE type = 'fantasy.sala' AND payload::text LIKE '%privada%' AND payload::text LIKE '%' || $2 || '%')
		FROM outbox`, privada.ID.String(), j.ID.String()).Scan(&filtrados, &avisos); err != nil {
		t.Fatal(err)
	}
	if filtrados != 0 {
		t.Fatalf("%d eventos públicos llevan el id de la sala privada", filtrados)
	}
	if avisos == 0 {
		t.Fatal("la sala privada debía avisar con fantasy.sala {privada: true}")
	}
}

// The judged attempts of an athlete, in the order they were judged, with what each one did to the grade.
func TestEventosNota(t *testing.T) {
	p := puntosPorDefecto()
	t0 := time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC)
	hora := func(min int) *time.Time { h := t0.Add(time.Duration(min) * time.Minute); return &h }
	ma := &MarcadorAtleta{Intentos: map[string][]MarcadorIntento{
		"sq": {{N: 1, Peso: 100, Resultado: "valido", Votos: "BBR", JuzgadoAt: hora(0)}, {N: 2, Peso: 110, Resultado: "nulo", Votos: "RRB", JuzgadoAt: hora(5)}, {N: 3, Peso: 110, Resultado: "pendiente"}},
		// Judged out of order on purpose: the events follow the hour.
		"bp": {{N: 1, Peso: 60, Resultado: "valido", JuzgadoAt: hora(20)}, {N: 2, Peso: 65, Resultado: "valido", JuzgadoAt: hora(10)}},
	}, Blanqueo: map[string]bool{}}
	ev := eventosNota(p, ma)
	if len(ev) != 4 {
		t.Fatalf("eventos = %d; quería 4 (el pendiente no cuenta)", len(ev))
	}
	quiero := []struct {
		mov   string
		n     int
		delta float64
		nota  float64
	}{{"sq", 1, 0.56, 0.56}, {"sq", 2, -0.3, 0.26}, {"bp", 2, 0.55, 0.81}, {"bp", 1, 0.56, 1.37}}
	for i, q := range quiero {
		if ev[i].Movimiento != q.mov || ev[i].N != q.n || ev[i].Delta != q.delta || ev[i].Nota != q.nota {
			t.Fatalf("evento %d = %+v; quería %+v", i, ev[i], q)
		}
	}
	if ev[0].Votos != "BBR" || ev[0].Hora == nil || ev[2].Votos != "" {
		t.Fatalf("luces y hora: %+v / %+v", ev[0], ev[2])
	}
	// Bomb-out: the third no lift of the movement leaves 0,0 and nothing after it moves the grade.
	bomba := &MarcadorAtleta{Intentos: map[string][]MarcadorIntento{
		"sq": intentos("valido", "valido", "valido"),
		"bp": intentos("nulo", "nulo", "nulo"),
		"dl": intentos("valido"),
	}, Blanqueo: map[string]bool{"bp": true}}
	ev = eventosNota(p, bomba)
	if len(ev) != 7 || !ev[5].Blanqueo || ev[5].Nota != 0 || ev[5].Delta >= 0 || ev[6].Nota != 0 || ev[6].Delta != 0 || ev[4].Blanqueo {
		t.Fatalf("blanqueo: %+v", ev)
	}
}
