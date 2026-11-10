package juegos

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jaivial/grweb/platform/pkg/db"
)

func estadoSala(t *testing.T, q querier, sala uuid.UUID) (estado string, miembros int, anfitrion uuid.UUID) {
	t.Helper()
	if err := q.QueryRow(context.Background(), `SELECT estado, (SELECT count(*) FROM sala_miembros WHERE sala_id = s.id), anfitrion_fan_id FROM salas s WHERE id = $1`, sala).
		Scan(&estado, &miembros, &anfitrion); err != nil {
		t.Fatal(err)
	}
	return
}

func estadoSolicitud(t *testing.T, q querier, sala, fan uuid.UUID) string {
	t.Helper()
	var e string
	if err := q.QueryRow(context.Background(), `SELECT estado FROM sala_solicitudes WHERE sala_id = $1 AND fan_id = $2`, sala, fan).Scan(&e); err != nil {
		t.Fatal(err)
	}
	return e
}

// The race for the last seat: 30 fans use the invitation link of a room with one seat left at the same time, and
// 30 more ask the host, who accepts them all at once. Exactly one gets in.
func TestCarreraUltimaPlaza(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")

	t.Run("enlace de invitación", func(t *testing.T) {
		sala := salaDePrueba(t, pdb, cid, j, 2, nuevoFan())
		var codigo string
		if err := pdb.QueryRow(ctx, `SELECT codigo FROM salas WHERE id = $1`, sala).Scan(&codigo); err != nil {
			t.Fatal(err)
		}
		var dentro atomic.Int32
		var wg sync.WaitGroup
		for i := 0; i < 30; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
					_, err := unirsePorCodigoTx(ctx, tx, cid, j, nuevoFan(), "fan", codigo)
					return err
				})
				if err == nil {
					dentro.Add(1)
				} else if c := codigoDe(t, err); c != "SALA_LLENA" {
					t.Errorf("entrada fallida con código inesperado: %s", c)
				}
			}()
		}
		wg.Wait()
		if _, miembros, _ := estadoSala(t, pdb, sala); dentro.Load() != 1 || miembros != 2 {
			t.Fatalf("entraron %d y la sala tiene %d miembros; quería 1 y 2", dentro.Load(), miembros)
		}
	})

	t.Run("solicitudes aceptadas a la vez", func(t *testing.T) {
		anfitrion := nuevoFan()
		sala := salaDePrueba(t, pdb, cid, j, 2, anfitrion)
		const n = 30
		ids := make([]uuid.UUID, n)
		fans := make([]uuid.UUID, n)
		for i := range ids {
			fans[i] = nuevoFan()
			if err := db.Tx(ctx, pdb, func(tx pgx.Tx) (err error) {
				ids[i], err = solicitarTx(ctx, tx, cid, j, sala, fans[i], "fan")
				return
			}); err != nil {
				t.Fatalf("solicitud %d: %v", i, err)
			}
		}
		var aceptadas atomic.Int32
		var wg sync.WaitGroup
		for _, id := range ids {
			wg.Add(1)
			go func(id uuid.UUID) {
				defer wg.Done()
				err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return responderSolicitudTx(ctx, tx, cid, j, sala, anfitrion, id, true) })
				if err == nil {
					aceptadas.Add(1)
				} else if c := codigoDe(t, err); c != "SALA_LLENA" && c != "SOLICITUD_NO_PENDIENTE" {
					t.Errorf("aceptación fallida con código inesperado: %s", c)
				}
			}(id)
		}
		wg.Wait()
		if _, miembros, _ := estadoSala(t, pdb, sala); aceptadas.Load() != 1 || miembros != 2 {
			t.Fatalf("aceptadas %d y la sala tiene %d miembros; quería 1 y 2", aceptadas.Load(), miembros)
		}
		var llenas int
		if err := pdb.QueryRow(ctx, `SELECT count(*) FROM sala_solicitudes WHERE sala_id = $1 AND estado = 'sala_llena'`, sala).Scan(&llenas); err != nil {
			t.Fatal(err)
		}
		if llenas != n-1 {
			t.Fatalf("solicitudes avisadas de sala llena = %d; quería %d", llenas, n-1)
		}
	})
}

// The rules of the requests: 3 pending at most, no second try after a rejection, joining a room cancels the rest,
// a private room cannot be requested and one room per fan and day.
func TestSolicitudes(t *testing.T) {
	pdb := testDB(t)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")
	solicitar := func(sala, fan uuid.UUID) error {
		return db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			_, err := solicitarTx(ctx, tx, cid, j, sala, fan, "fan")
			return err
		})
	}
	responder := func(sala, anfitrion, fan uuid.UUID, aceptar bool) error {
		return db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			var id uuid.UUID
			if err := tx.QueryRow(ctx, `SELECT id FROM sala_solicitudes WHERE sala_id = $1 AND fan_id = $2`, sala, fan).Scan(&id); err != nil {
				return err
			}
			return responderSolicitudTx(ctx, tx, cid, j, sala, anfitrion, id, aceptar)
		})
	}
	anfitriones := []uuid.UUID{nuevoFan(), nuevoFan(), nuevoFan(), nuevoFan()}
	salas := make([]uuid.UUID, len(anfitriones))
	for i, a := range anfitriones {
		salas[i] = salaDePrueba(t, pdb, cid, j, 4, a)
	}
	fan := nuevoFan()
	for i := 0; i < 3; i++ {
		if err := solicitar(salas[i], fan); err != nil {
			t.Fatalf("solicitud %d: %v", i+1, err)
		}
	}
	if err := solicitar(salas[0], fan); err != nil {
		t.Fatalf("repetir una solicitud pendiente debía ser inocuo: %v", err)
	}
	if c := codigoDe(t, solicitar(salas[3], fan)); c != "MAX_SOLICITUDES" {
		t.Fatalf("cuarta solicitud = %s; quería MAX_SOLICITUDES", c)
	}
	// Somebody who is not the host cannot answer.
	if err := responder(salas[0], anfitriones[1], fan, true); err == nil {
		t.Fatal("solo el anfitrión puede responder una solicitud")
	}
	// Rejected in room 0: no second try today; the slot of the 3 is free again.
	if err := responder(salas[0], anfitriones[0], fan, false); err != nil {
		t.Fatal(err)
	}
	if c := codigoDe(t, solicitar(salas[0], fan)); c != "SOLICITUD_RECHAZADA" {
		t.Fatalf("repetir tras rechazo = %s; quería SOLICITUD_RECHAZADA", c)
	}
	if err := solicitar(salas[3], fan); err != nil {
		t.Fatalf("tras el rechazo quedaba un hueco de solicitud: %v", err)
	}
	// Accepted in room 1: he sits down and his other pending requests are cancelled.
	if err := responder(salas[1], anfitriones[1], fan, true); err != nil {
		t.Fatal(err)
	}
	if _, miembros, _ := estadoSala(t, pdb, salas[1]); miembros != 2 {
		t.Fatalf("miembros tras aceptar = %d; quería 2", miembros)
	}
	for _, i := range []int{2, 3} {
		if e := estadoSolicitud(t, pdb, salas[i], fan); e != "cancelada" {
			t.Fatalf("solicitud en la sala %d = %s; quería cancelada", i, e)
		}
	}
	if c := codigoDe(t, solicitar(salas[2], fan)); c != "YA_EN_SALA" {
		t.Fatalf("solicitar estando en una sala = %s; quería YA_EN_SALA", c)
	}
	if _, err := crearSalaPrueba(ctx, pdb, cid, j, fan, "otra sala mía"); codigoDe(t, err) != "YA_EN_SALA" {
		t.Fatalf("crear estando en una sala = %v; quería YA_EN_SALA", err)
	}
	// A private room (link only) does not exist for the lobby.
	privada := salaDePrueba(t, pdb, cid, j, 4, nuevoFan())
	if _, err := pdb.Exec(ctx, `UPDATE salas SET publica = false WHERE id = $1`, privada); err != nil {
		t.Fatal(err)
	}
	if c := codigoDe(t, solicitar(privada, nuevoFan())); c != "NO_ENCONTRADO" {
		t.Fatalf("solicitar una sala privada = %s; quería NO_ENCONTRADO", c)
	}
}

func crearSalaPrueba(ctx context.Context, pdb *pgxpool.Pool, cid uuid.UUID, j jornada, fan uuid.UUID, nombre string) (sala *salaRow, err error) {
	err = db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		sala, err = crearSalaTx(ctx, tx, cid, j, fan, "alias", nombre, true, 4)
		return err
	})
	return
}

// The life of a room before the day starts: unique name, the link seats the fan straight away, leaving passes the
// host role to the oldest member and frees the athletes, an expelled fan cannot come back, a new link kills the
// old one and the last one out closes the room.
func TestVidaDeUnaSala(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	anfitrion, segundo, tercero := nuevoFan(), nuevoFan(), nuevoFan()
	sala, err := crearSalaPrueba(ctx, pdb, cid, j, anfitrion, "Los Cuervos")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := crearSalaPrueba(ctx, pdb, cid, j, nuevoFan(), "los  CUERVOS"); codigoDe(t, err) != "NOMBRE_OCUPADO" {
		t.Fatalf("nombre repetido = %v; quería NOMBRE_OCUPADO", err)
	}
	entrar := func(fan uuid.UUID, codigo string) error {
		return db.Tx(ctx, pdb, func(tx pgx.Tx) error {
			_, err := unirsePorCodigoTx(ctx, tx, cid, j, fan, "fan", codigo)
			return err
		})
	}
	// A pending request elsewhere is cancelled when the link seats the fan.
	otra := salaDePrueba(t, pdb, cid, j, 4, nuevoFan())
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		_, err := solicitarTx(ctx, tx, cid, j, otra, segundo, "fan")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	for _, f := range []uuid.UUID{segundo, tercero} {
		if err := entrar(f, sala.Codigo); err != nil {
			t.Fatalf("entrada por enlace: %v", err)
		}
	}
	if e := estadoSolicitud(t, pdb, otra, segundo); e != "cancelada" {
		t.Fatalf("solicitud pendiente tras entrar por enlace = %s; quería cancelada", e)
	}
	if c := codigoDe(t, entrar(segundo, sala.Codigo)); c != "YA_MIEMBRO" {
		t.Fatalf("entrar dos veces = %s; quería YA_MIEMBRO", c)
	}
	// The host buys an athlete and leaves: the athlete is free again, the coins are back, the oldest member hosts.
	aid := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala.ID, nil, 200000)
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.comprarTx(ctx, tx, cid, j, cfg, sala.ID, anfitrion, "anfitrion", aid) }); err != nil {
		t.Fatal(err)
	}
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return salirTx(ctx, tx, cid, j, sala.ID, anfitrion) }); err != nil {
		t.Fatal(err)
	}
	if d, _ := duenoEnSala(t, pdb, sala.ID, aid); d != uuid.Nil {
		t.Fatal("el atleta de quien sale debía quedar libre")
	}
	// He paid 200.000 and gets back the current value: 206.000 after the +3 % of his own demand.
	if got := saldoDe(t, pdb, j.ID, anfitrion, Fantasy); got != 1_006_000 {
		t.Fatalf("saldo tras salir = %d; quería 1.006.000", got)
	}
	if _, miembros, nuevo := estadoSala(t, pdb, sala.ID); miembros != 2 || nuevo != segundo {
		t.Fatalf("tras salir el anfitrión: %d miembros, anfitrión %v; quería 2 y el más antiguo", miembros, nuevo)
	}
	// The new host expels the third: he cannot come back with the link.
	var mid uuid.UUID
	if err := pdb.QueryRow(ctx, `SELECT miembro_id FROM sala_miembros WHERE sala_id = $1 AND fan_id = $2`, sala.ID, tercero).Scan(&mid); err != nil {
		t.Fatal(err)
	}
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return expulsarTx(ctx, tx, cid, j, sala.ID, tercero, mid) }); err == nil {
		t.Fatal("solo el anfitrión puede expulsar")
	}
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return expulsarTx(ctx, tx, cid, j, sala.ID, segundo, mid) }); err != nil {
		t.Fatal(err)
	}
	if c := codigoDe(t, entrar(tercero, sala.Codigo)); c != "SIN_PERMISO" {
		t.Fatalf("volver tras ser expulsado = %s; quería SIN_PERMISO", c)
	}
	// Last one out: the room closes and its name is free again.
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return salirTx(ctx, tx, cid, j, sala.ID, segundo) }); err != nil {
		t.Fatal(err)
	}
	if estado, miembros, _ := estadoSala(t, pdb, sala.ID); estado != "cerrada" || miembros != 0 {
		t.Fatalf("sala vacía = %s con %d miembros; quería cerrada y 0", estado, miembros)
	}
	if c := codigoDe(t, entrar(nuevoFan(), sala.Codigo)); c != "SALA_NO_DISPONIBLE" {
		t.Fatalf("entrar en una sala cerrada = %s; quería SALA_NO_DISPONIBLE", c)
	}
	if _, err := crearSalaPrueba(ctx, pdb, cid, j, anfitrion, "Los Cuervos"); err != nil {
		t.Fatalf("el nombre de una sala cerrada debía quedar libre: %v", err)
	}
}

// The start of the day: a room with one member is cancelled at no cost, the rest go en_juego, the pending
// requests expire and nobody can leave any more. Closing the jornada writes the palmarés once.
func TestInicioYPalmares(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	ctx := context.Background()
	cid, j := nuevaJornada(t, pdb, "abierta")
	cfg, err := configJuegos(ctx, pdb, cid)
	if err != nil {
		t.Fatal(err)
	}
	solo, a, b, pendiente := nuevoFan(), nuevoFan(), nuevoFan(), nuevoFan()
	sola := salaDePrueba(t, pdb, cid, j, 4, solo)
	sala := salaDePrueba(t, pdb, cid, j, 4, a, b)
	atletaSolo := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sola, nil, 200000)
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error { return s.comprarTx(ctx, tx, cid, j, cfg, sola, solo, "solo", atletaSolo) }); err != nil {
		t.Fatal(err)
	}
	atletaA := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &a, 300000)
	atletaB := atletaFantasiaDePrueba(t, pdb, cid, j.ID, sala, &b, 100000)
	if err := db.Tx(ctx, pdb, func(tx pgx.Tx) error {
		_, err := solicitarTx(ctx, tx, cid, j, sala, pendiente, "fan")
		return err
	}); err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 2; i++ { // idempotent
		if err := s.iniciarSalas(ctx, cid, j); err != nil {
			t.Fatal(err)
		}
	}
	if estado, _, _ := estadoSala(t, pdb, sola); estado != "cancelada" {
		t.Fatalf("sala con 1 miembro = %s; quería cancelada", estado)
	}
	if got := saldoDe(t, pdb, j.ID, solo, Fantasy); got != 1_006_000 {
		t.Fatalf("la cancelación debía devolver el valor del atleta: saldo %d", got)
	}
	if estado, _, _ := estadoSala(t, pdb, sala); estado != "en_juego" {
		t.Fatalf("sala con 2 miembros = %s; quería en_juego", estado)
	}
	if e := estadoSolicitud(t, pdb, sala, pendiente); e != "caducada" {
		t.Fatalf("solicitud pendiente al empezar = %s; quería caducada", e)
	}
	if c := codigoDe(t, db.Tx(ctx, pdb, func(tx pgx.Tx) error { return salirTx(ctx, tx, cid, j, sala, a) })); c != "SALA_NO_DISPONIBLE" {
		t.Fatalf("salir tras empezar = %s; quería SALA_NO_DISPONIBLE", c)
	}

	// The scoreboard at the end of the day: A's athlete did well, B's bombed out.
	total := 600.0
	v := "valido"
	marc := &Marcador{Atletas: []MarcadorAtleta{
		{AtletaID: atletaA, PuestoCategoria: 1, Total: &total, Terminado: true,
			Intentos: map[string][]MarcadorIntento{"sq": intentos(v, v, v), "bp": intentos(v, v, v), "dl": intentos(v, v, v)}},
		{AtletaID: atletaB, Blanqueo: map[string]bool{"sq": true}, Intentos: map[string][]MarcadorIntento{"sq": intentos("nulo", "nulo", "nulo")}},
	}}
	s.marc = map[string]marcEntrada{cid.String() + ":" + j.Dia: {m: marc, exp: farFuture}}
	for i := 0; i < 2; i++ { // closing twice writes the palmarés once
		if err := s.finalizarSalas(ctx, cid, j); err != nil {
			t.Fatal(err)
		}
	}
	if estado, _, _ := estadoSala(t, pdb, sala); estado != "finalizada" {
		t.Fatalf("sala tras cerrar la jornada = %s; quería finalizada", estado)
	}
	filas, err := filasPalmares(ctx, pdb, []uuid.UUID{sala, sola}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(filas[sola]) != 0 || len(filas[sala]) != 2 {
		t.Fatalf("palmarés: %d filas en la sala cancelada y %d en la jugada; quería 0 y 2", len(filas[sola]), len(filas[sala]))
	}
	// Final grade ÷ 5 (4 empty slots count 0): A = 8,8 ÷ 5 = 1,76 ; B = 0.
	g := filas[sala][0]
	if g.Puesto != 1 || g.Nota != 1.76 || len(g.Alineacion) != 1 || g.Alineacion[0].Nota.Nota != 8.8 {
		t.Fatalf("ganador = %+v", g)
	}
	if p := filas[sala][1]; p.Puesto != 2 || p.Nota != 0 || !p.Alineacion[0].Nota.Blanqueo {
		t.Fatalf("segundo = %+v", p)
	}
}

// Tie-break of a room: grade → lineup value → balance → who joined first.
func TestOrdenarSala(t *testing.T) {
	fs := []filaSala{
		{Alias: "tarde", Nota: 5, Valor: 100, Saldo: 10, joined: farFuture},
		{Alias: "valor", Nota: 5, Valor: 200, Saldo: 1},
		{Alias: "nota", Nota: 6},
		{Alias: "saldo", Nota: 5, Valor: 100, Saldo: 20},
		{Alias: "pronto", Nota: 5, Valor: 100, Saldo: 10},
	}
	ordenarSala(fs)
	for i, alias := range []string{"nota", "valor", "saldo", "pronto", "tarde"} {
		if fs[i].Alias != alias || fs[i].Puesto != i+1 {
			t.Fatalf("puesto %d = %s (%d); quería %s", i+1, fs[i].Alias, fs[i].Puesto, alias)
		}
	}
}
