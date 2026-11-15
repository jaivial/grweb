// salas_vista.go: the read models of the rooms (BIZ-143): lobby, room classification (average grade of the
// lineup; tie-break lineup value → balance → who joined first) and the palmarés (the snapshot of every room when
// the jornada closes). Public views carry aliases and the public miembro id, never fan ids.
package juegos

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// atletaAlineado is one athlete of a lineup with his grade.
type atletaAlineado struct {
	AtletaID  uuid.UUID  `json:"atletaId"`
	Nombre    string     `json:"nombre"`
	FotoURL   string     `json:"fotoUrl,omitempty"`
	Categoria string     `json:"categoria"`
	Clausula  int64      `json:"clausula"`
	Nota      notaAtleta `json:"nota"`
	// Eventos are the judged attempts with their hour (only in the palmarés snapshot).
	Eventos []eventoNota `json:"eventos,omitempty"`
}

// filaSala is one player of a room classification.
type filaSala struct {
	Puesto      int              `json:"puesto"`
	MiembroID   uuid.UUID        `json:"miembroId" doc:"Identificador público del jugador en la sala"`
	Alias       string           `json:"alias"`
	Nota        float64          `json:"nota" doc:"Media de la alineación (0,00–10,00)"`
	ConNota     int              `json:"conNota" doc:"Atletas con nota: la media es provisional mientras sea menor que 5"`
	Valor       int64            `json:"valor" doc:"Valor de la alineación (suma de cláusulas)"`
	Saldo       int64            `json:"saldo"`
	EsAnfitrion bool             `json:"esAnfitrion"`
	EsYo        bool             `json:"esYo"`
	Alineacion  []atletaAlineado `json:"alineacion"`

	fanID  uuid.UUID
	joined time.Time
}

// salaVista is one room of the lobby.
type salaVista struct {
	ID        uuid.UUID `json:"id"`
	Nombre    string    `json:"nombre"`
	Anfitrion string    `json:"anfitrion" doc:"Alias del anfitrión"`
	Plazas    int       `json:"plazas"`
	Miembros  int       `json:"miembros"`
	Estado    string    `json:"estado" enum:"esperando,lista,llena,en_juego,cancelada,cerrada,finalizada"`
	Publica   bool      `json:"publica"`
	// AdmiteSolicitudes is false when the host blocked the requests from the lobby (the link still works).
	AdmiteSolicitudes bool      `json:"admiteSolicitudes"`
	Lider             *filaSala `json:"lider,omitempty" doc:"Quién va ganando, con su alineación"`
	EsMia             bool      `json:"esMia"`
	// MiSolicitud is the state of my request to this room, if any.
	MiSolicitud string `json:"miSolicitud,omitempty" enum:"pendiente,aceptada,rechazada,cancelada,caducada,sala_llena,expulsada"`
	// MiSolicitudAt is when I sent it: the web shows «aún no responde» 30 minutes later.
	MiSolicitudAt *time.Time `json:"miSolicitudAt,omitempty"`
}

// miSolicitud is the fan's request to a room.
type miSolicitud struct {
	Estado string
	At     time.Time
}

// estadoPublico derives what the web shows: an open room waits for its 2nd player, is ready, or is full.
func estadoPublico(estado string, miembros, plazas int) string {
	if estado != "abierta" {
		return estado
	}
	switch {
	case miembros >= plazas:
		return "llena"
	case miembros >= 2:
		return "lista"
	}
	return "esperando"
}

// clasificarSalas builds the classification of several rooms of a jornada in three queries plus the scoreboard.
// If the scoreboard cannot be read the rooms are listed without grades (the lobby must not fail with it).
func (s *Svc) clasificarSalas(ctx context.Context, q querier, cid uuid.UUID, j jornada, salas []*salaRow, fanID uuid.UUID) (map[uuid.UUID][]filaSala, error) {
	out := map[uuid.UUID][]filaSala{}
	if len(salas) == 0 {
		return out, nil
	}
	ids := make([]uuid.UUID, len(salas))
	anfitrion := map[uuid.UUID]uuid.UUID{}
	for i, sl := range salas {
		ids[i] = sl.ID
		anfitrion[sl.ID] = sl.Anfitrion
	}
	cfg, err := configJuegos(ctx, q, cid)
	if err != nil {
		return nil, err
	}
	notas := map[uuid.UUID]notaAtleta{}
	fotos := map[uuid.UUID]string{}
	if m, err := s.marcador(ctx, cid, j.Dia); err == nil {
		notas = notasDelMarcador(cfg.Puntos, m)
		for i := range m.Atletas {
			fotos[m.Atletas[i].AtletaID] = m.Atletas[i].FotoURL
		}
	}
	type clave struct{ sala, fan uuid.UUID }
	alineaciones := map[clave][]atletaAlineado{}
	rows, err := q.Query(ctx, `SELECT sa.sala_id, sa.dueno_fan_id, fa.atleta_id, fa.nombre_publico, fa.categoria, `+precioSala+`
		FROM sala_atletas sa JOIN fantasy_atletas fa ON fa.jornada_id = sa.jornada_id AND fa.atleta_id = sa.atleta_id
		WHERE sa.sala_id = ANY($1) AND sa.dueno_fan_id IS NOT NULL ORDER BY fa.nombre_publico, fa.atleta_id`, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k clave
		var a atletaAlineado
		if err := rows.Scan(&k.sala, &k.fan, &a.AtletaID, &a.Nombre, &a.Categoria, &a.Clausula); err != nil {
			rows.Close()
			return nil, err
		}
		a.Nota, a.FotoURL = notas[a.AtletaID], fotos[a.AtletaID]
		if a.Nota.Desglose == nil {
			a.Nota.Desglose = []notaLinea{}
		}
		alineaciones[k] = append(alineaciones[k], a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows, err = q.Query(ctx, `SELECT m.sala_id, m.fan_id, m.miembro_id, m.alias, m.joined_at, COALESCE(sd.saldo, 0)
		FROM sala_miembros m LEFT JOIN saldos sd ON sd.jornada_id = m.jornada_id AND sd.fan_id = m.fan_id AND sd.moneda = 'fantasy'
		WHERE m.sala_id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	final := j.Estado == "cerrada"
	for rows.Next() {
		var sala uuid.UUID
		var f filaSala
		if err := rows.Scan(&sala, &f.fanID, &f.MiembroID, &f.Alias, &f.joined, &f.Saldo); err != nil {
			return nil, err
		}
		f.Alineacion = alineaciones[clave{sala, f.fanID}]
		if f.Alineacion == nil {
			f.Alineacion = []atletaAlineado{}
		}
		ns := make([]notaAtleta, len(f.Alineacion))
		for i, a := range f.Alineacion {
			ns[i] = a.Nota
			f.Valor += a.Clausula
		}
		f.Nota, f.ConNota = notaAlineacion(ns, max(cfg.PlantillaMax-len(ns), 0), final)
		f.EsAnfitrion = f.fanID == anfitrion[sala]
		f.EsYo = fanID != uuid.Nil && f.fanID == fanID
		out[sala] = append(out[sala], f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, fs := range out {
		ordenarSala(fs)
	}
	return out, nil
}

// ordenarSala sorts a room: grade, then lineup value, then balance, then who joined first; and numbers the places
// (two players only share a place when everything, even the instant they joined, is equal).
func ordenarSala(fs []filaSala) {
	igual := func(a, b *filaSala) bool {
		return a.Nota == b.Nota && a.Valor == b.Valor && a.Saldo == b.Saldo && a.joined.Equal(b.joined)
	}
	sort.SliceStable(fs, func(i, k int) bool {
		a, b := &fs[i], &fs[k]
		switch {
		case a.Nota != b.Nota:
			return a.Nota > b.Nota
		case a.Valor != b.Valor:
			return a.Valor > b.Valor
		case a.Saldo != b.Saldo:
			return a.Saldo > b.Saldo
		}
		return a.joined.Before(b.joined)
	})
	for i := range fs {
		fs[i].Puesto = i + 1
		if i > 0 && igual(&fs[i-1], &fs[i]) {
			fs[i].Puesto = fs[i-1].Puesto
		}
	}
}

// vistaDe builds the lobby view of one room from its classification.
func vistaDe(sl *salaRow, filas []filaSala, mia bool, sol *miSolicitud) salaVista {
	// a «solo enlace» room never takes requests from the lobby (solicitar answers 404)
	v := salaVista{ID: sl.ID, Nombre: sl.Nombre, Plazas: sl.Plazas, Miembros: len(filas), Publica: sl.Publica, AdmiteSolicitudes: sl.Admite && sl.Publica,
		Estado: estadoPublico(sl.Estado, len(filas), sl.Plazas), EsMia: mia}
	if sol != nil {
		v.MiSolicitud, v.MiSolicitudAt = sol.Estado, &sol.At
	}
	for i := range filas {
		if filas[i].EsAnfitrion {
			v.Anfitrion = filas[i].Alias
		}
	}
	// nobody leads while every grade is 0 (or the top is a tie at 0)
	if len(filas) > 0 && filas[0].Nota > 0 {
		v.Lider = &filas[0]
	}
	return v
}

// salaClasificada is one room of the lobby with its classification (shared read-only between fans).
type salaClasificada struct {
	sl    *salaRow
	filas []filaSala
}

// ttlLobby: the public part of the lobby is the same for every fan; it is rebuilt at most once per second and pod
// (singleflight), so 1000 spectators cost one classification per second instead of one per request (ST3-R2-1).
const ttlLobby = time.Second

// maxLobby is the largest page of the lobby (the maximum of ?limite).
const maxLobby = 200

// lobbyPublico lists the public live rooms of a jornada (newest first, maxLobby+1 at most: ST3-R7-3, the extra
// one tells lobby there are more even at the largest page) already classified, without any fan's view. The
// unfiltered list is cached ttlLobby; a search goes to the database.
func (s *Svc) lobbyPublico(ctx context.Context, cid uuid.UUID, j jornada, buscar string) ([]salaClasificada, error) {
	load := func() (any, error) {
		// shared by every waiter of the singleflight: a cancelled first request must not fail the others
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		rows, err := s.a.DB.Query(ctx, selSala+` WHERE s.jornada_id = $1 AND s.estado IN ('abierta', 'en_juego') AND s.publica
			AND ($2 = '' OR position($2 in s.nombre_norm) > 0)
			ORDER BY s.created_at DESC LIMIT $3`, j.ID, buscar, maxLobby+1)
		if err != nil {
			return nil, err
		}
		var salas []*salaRow
		for rows.Next() {
			sl, err := scanSala(rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			salas = append(salas, sl)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		clas, err := s.clasificarSalas(ctx, s.a.DB, cid, j, salas, uuid.Nil)
		if err != nil {
			return nil, err
		}
		out := make([]salaClasificada, len(salas))
		for i, sl := range salas {
			out[i] = salaClasificada{sl, clas[sl.ID]}
		}
		return out, nil
	}
	if buscar != "" {
		v, err := load()
		if err != nil {
			return nil, err
		}
		return v.([]salaClasificada), nil
	}
	v, err := s.lobbyMemo.getSWR("lobby:"+j.ID.String(), ttlLobby, 10*ttlLobby, load)
	if err != nil {
		return nil, err
	}
	return v.([]salaClasificada), nil
}

// lobby lists the live rooms of a jornada: the public ones (shared, up to 1 s old) plus the fan's own room, always
// fresh (a fan plays in one room per jornada), optionally filtered by name.
// ST3-R6-3: at most limite rooms travel (the fan's own room always does); hayMas tells there are more.
func (s *Svc) lobby(ctx context.Context, cid uuid.UUID, j jornada, fanID uuid.UUID, buscar string, limite int) (out []salaVista, miaID uuid.UUID, hayMas bool, err error) {
	buscar = normalizarNombre(buscar)
	pub, err := s.lobbyPublico(ctx, cid, j, buscar)
	if err != nil {
		return nil, uuid.Nil, false, err
	}
	mia, err := miSala(ctx, s.a.DB, j.ID, fanID)
	if err != nil {
		return nil, uuid.Nil, false, err
	}
	if mia != nil {
		miaID = mia.ID
	}
	var propia []filaSala
	if mia != nil && (mia.Estado == "abierta" || mia.Estado == "en_juego") && (buscar == "" || strings.Contains(normalizarNombre(mia.Nombre), buscar)) {
		clas, err := s.clasificarSalas(ctx, s.a.DB, cid, j, []*salaRow{mia}, fanID)
		if err != nil {
			return nil, uuid.Nil, false, err
		}
		propia = clas[mia.ID]
	} else {
		mia = nil
	}
	solicitudes, err := misSolicitudes(ctx, s.a.DB, j.ID, fanID)
	if err != nil {
		return nil, uuid.Nil, false, err
	}
	out = make([]salaVista, 0, min(len(pub), limite)+1)
	n := 0 // public rooms listed (the fan's own one does not count)
	for _, c := range pub {
		if c.sl.ID == miaID {
			continue // shown fresh, with the fan's view
		}
		if mia != nil && !mia.CreatedAt.Before(c.sl.CreatedAt) {
			out = append(out, vistaDe(mia, propia, true, solicitudes[mia.ID]))
			mia = nil
		}
		if n == limite {
			hayMas = true
			break
		}
		n++
		out = append(out, vistaDe(c.sl, c.filas, false, solicitudes[c.sl.ID]))
	}
	if mia != nil {
		out = append(out, vistaDe(mia, propia, true, solicitudes[mia.ID]))
	}
	return out, miaID, hayMas, nil
}

// lobbyAdmin lists every room of a jornada for the staff (any state, private ones too).
func (s *Svc) lobbyAdmin(ctx context.Context, cid uuid.UUID, j jornada) ([]salaVista, error) {
	rows, err := s.a.DB.Query(ctx, selSala+` WHERE s.jornada_id = $1 ORDER BY s.created_at`, j.ID)
	if err != nil {
		return nil, err
	}
	var salas []*salaRow
	for rows.Next() {
		sl, err := scanSala(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		salas = append(salas, sl)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	clas, err := s.clasificarSalas(ctx, s.a.DB, cid, j, salas, uuid.Nil)
	if err != nil {
		return nil, err
	}
	out := make([]salaVista, 0, len(salas))
	for _, sl := range salas {
		out = append(out, vistaDe(sl, clas[sl.ID], false, nil))
	}
	return out, nil
}

// misSolicitudes maps room → the fan's request in a jornada (state and when it was sent).
func misSolicitudes(ctx context.Context, q querier, jid, fanID uuid.UUID) (map[uuid.UUID]*miSolicitud, error) {
	out := map[uuid.UUID]*miSolicitud{}
	if fanID == uuid.Nil {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT sala_id, estado, created_at FROM sala_solicitudes WHERE jornada_id = $1 AND fan_id = $2`, jid, fanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var e miSolicitud
		if err := rows.Scan(&id, &e.Estado, &e.At); err != nil {
			return nil, err
		}
		out[id] = &e
	}
	return out, rows.Err()
}

// iniciarSalas starts the day for the rooms of a jornada when it has begun and some room is still open.
func (s *Svc) iniciarSalas(ctx context.Context, cid uuid.UUID, j jornada) error {
	var hay bool
	if err := s.a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM salas WHERE jornada_id = $1 AND estado = 'abierta')`, j.ID).Scan(&hay); err != nil || !hay {
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return iniciarSalasTx(ctx, tx, cid, j) })
}

// finalizarSalas closes the rooms of a jornada that has just been closed and writes the palmarés: the final
// classification of every room that played (idempotent: a room is finalised once).
func (s *Svc) finalizarSalas(ctx context.Context, cid uuid.UUID, j jornada) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return s.finalizarSalasTx(ctx, tx, cid, j) })
}

// finalizarSalasTx is finalizarSalas inside the caller's transaction (the PATCH of the jornada).
func (s *Svc) finalizarSalasTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada) error {
	j.Estado = "cerrada"
	if err := iniciarSalasTx(ctx, tx, cid, j); err != nil { // a day that never «started»: cancel the 1-member rooms first
		return err
	}
	rows, err := tx.Query(ctx, selSala+` WHERE s.jornada_id = $1 AND s.estado = 'en_juego' ORDER BY s.id FOR UPDATE`, j.ID)
	if err != nil {
		return err
	}
	var salas []*salaRow
	for rows.Next() {
		sl, err := scanSala(rows)
		if err != nil {
			rows.Close()
			return err
		}
		salas = append(salas, sl)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	clas, err := s.clasificarSalas(ctx, tx, cid, j, salas, uuid.Nil)
	if err != nil {
		return err
	}
	// The snapshot keeps the judged attempts of every lined-up athlete with their hour (the detail of the game).
	eventos := map[uuid.UUID][]eventoNota{}
	if m, err := s.marcador(ctx, cid, j.Dia); err == nil {
		if cfg, err := configJuegos(ctx, tx, cid); err == nil {
			for i := range m.Atletas {
				eventos[m.Atletas[i].AtletaID] = eventosNota(cfg.Puntos, &m.Atletas[i])
			}
		}
	}
	for _, sl := range salas {
		for _, f := range clas[sl.ID] {
			for i := range f.Alineacion {
				f.Alineacion[i].Eventos = eventos[f.Alineacion[i].AtletaID]
			}
			al, err := json.Marshal(f.Alineacion)
			if err != nil {
				return err
			}
			// fichajes = signings the player made in the room (buys and clausulazos); clausulazos = the ones he paid.
			if _, err := tx.Exec(ctx, `INSERT INTO palmares (sala_id, fan_id, jornada_id, competition_id, puesto, alias, nota, valor, saldo, alineacion, fichajes, clausulazos)
				SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10, count(*) FILTER (WHERE tipo <> 'venta'), count(*) FILTER (WHERE tipo = 'clausulazo')
				FROM fichajes WHERE sala_id = $1 AND a_fan = $2 ON CONFLICT DO NOTHING`,
				sl.ID, f.fanID, j.ID, cid, f.Puesto, f.Alias, f.Nota, f.Valor, f.Saldo, al); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE salas SET estado = 'finalizada', version = version + 1, updated_at = now() WHERE id = $1`, sl.ID); err != nil {
			return err
		}
		if err := eventoSala(ctx, tx, cid, sl, "finalizada"); err != nil {
			return err
		}
	}
	return nil
}

// filaPalmares is one player of a finished room.
type filaPalmares struct {
	Puesto     int              `json:"puesto"`
	Alias      string           `json:"alias"`
	Nota       float64          `json:"nota"`
	Valor      int64            `json:"valor"`
	Saldo      int64            `json:"saldo"`
	Alineacion []atletaAlineado `json:"alineacion"`
	// Fichajes: signings the player made in the room (buys and clausulazos). Clausulazos: the ones he paid.
	Fichajes    int `json:"fichajes"`
	Clausulazos int `json:"clausulazos"`
}

// salaPalmares is one room of the palmarés of a day.
type salaPalmares struct {
	SalaID    uuid.UUID      `json:"salaId"`
	Nombre    string         `json:"nombre"`
	Estado    string         `json:"estado" enum:"finalizada,cancelada"`
	Jugadores int            `json:"jugadores"`
	Ganadores []filaPalmares `json:"ganadores" doc:"Puesto 1 (varios solo si comparten puesto)"`
}

// diaPalmares is the palmarés of one closed jornada.
type diaPalmares struct {
	JornadaID uuid.UUID      `json:"jornadaId"`
	Dia       string         `json:"dia"`
	Nombre    string         `json:"nombre"`
	Salas     []salaPalmares `json:"salas"`
}

// filasPalmares reads the snapshot rows of some rooms (soloGanadores: only the 1st place).
func filasPalmares(ctx context.Context, q querier, salaIDs []uuid.UUID, soloGanadores bool) (map[uuid.UUID][]filaPalmares, error) {
	rows, err := q.Query(ctx, `SELECT sala_id, puesto, alias, nota::float8, valor, saldo, alineacion, fichajes, clausulazos FROM palmares
		WHERE sala_id = ANY($1) AND (NOT $2 OR puesto = 1) ORDER BY puesto, alias`, salaIDs, soloGanadores)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID][]filaPalmares{}
	for rows.Next() {
		var id uuid.UUID
		var f filaPalmares
		var al []byte
		if err := rows.Scan(&id, &f.Puesto, &f.Alias, &f.Nota, &f.Valor, &f.Saldo, &al, &f.Fichajes, &f.Clausulazos); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(al, &f.Alineacion); err != nil {
			return nil, err
		}
		out[id] = append(out[id], f)
	}
	return out, rows.Err()
}

// palmares lists the closed jornadas (newest first) with the winners of every room (private ones too, once the day is over).
func (s *Svc) palmares(ctx context.Context, cid uuid.UUID) ([]diaPalmares, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT j.id, j.dia::text, j.nombre, s.id, s.nombre, s.estado, (SELECT count(*) FROM sala_miembros m WHERE m.sala_id = s.id)
		FROM jornadas j JOIN salas s ON s.jornada_id = j.id
		WHERE j.competition_id = $1 AND j.estado = 'cerrada' AND s.estado IN ('finalizada', 'cancelada')
		ORDER BY j.dia DESC, s.estado DESC, s.nombre LIMIT 500`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []diaPalmares{}
	var ids []uuid.UUID
	for rows.Next() {
		var d diaPalmares
		var sp salaPalmares
		if err := rows.Scan(&d.JornadaID, &d.Dia, &d.Nombre, &sp.SalaID, &sp.Nombre, &sp.Estado, &sp.Jugadores); err != nil {
			return nil, err
		}
		sp.Ganadores = []filaPalmares{}
		if n := len(out); n == 0 || out[n-1].JornadaID != d.JornadaID {
			out = append(out, d)
		}
		out[len(out)-1].Salas = append(out[len(out)-1].Salas, sp)
		ids = append(ids, sp.SalaID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	ganadores, err := filasPalmares(ctx, s.a.DB, ids, true)
	if err != nil {
		return nil, err
	}
	for i := range out {
		for k := range out[i].Salas {
			if g := ganadores[out[i].Salas[k].SalaID]; g != nil {
				out[i].Salas[k].Ganadores = g
			}
		}
	}
	return out, nil
}
