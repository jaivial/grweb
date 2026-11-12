// salas.go: the rooms of GRS Fantasy (BIZ-143). A room is a group of 2–10 fans of one jornada with its own market.
// One room per fan and day. Two ways in: the invitation link of the host (straight in) and a request from the
// lobby that the host accepts or rejects. Every write locks the room row FOR UPDATE, so the race for the last seat
// has one winner. Nothing changes once the day starts (first session): rooms with one member are cancelled and
// the pending requests expire.
package juegos

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// maxSolicitudes is how many pending requests a fan may have at once in a jornada.
const maxSolicitudes = 3

// salaRow is a row of salas.
type salaRow struct {
	ID        uuid.UUID
	JornadaID uuid.UUID
	Nombre    string
	Anfitrion uuid.UUID
	Plazas    int
	Publica   bool
	Admite    bool // new requests from the lobby are open (the host can block them)
	Codigo    string
	Estado    string
	CreatedAt time.Time
}

const selSala = `SELECT s.id, s.jornada_id, s.nombre, s.anfitrion_fan_id, s.plazas, s.publica, s.admite_solicitudes, s.codigo, s.estado, s.created_at FROM salas s`

func scanSala(r pgx.Row) (*salaRow, error) {
	var s salaRow
	if err := r.Scan(&s.ID, &s.JornadaID, &s.Nombre, &s.Anfitrion, &s.Plazas, &s.Publica, &s.Admite, &s.Codigo, &s.Estado, &s.CreatedAt); err != nil {
		return nil, err
	}
	return &s, nil
}

var errSalaNoExiste = problem.NotFound("Sala no encontrada.")

// salaTx locks a room of the jornada FOR UPDATE.
func salaTx(ctx context.Context, tx pgx.Tx, j jornada, salaID uuid.UUID) (*salaRow, error) {
	s, err := scanSala(tx.QueryRow(ctx, selSala+` WHERE s.id = $1 AND s.jornada_id = $2 FOR UPDATE`, salaID, j.ID))
	if db.IsNoRows(err) {
		return nil, errSalaNoExiste
	}
	return s, err
}

// miSala is the room of a fan in a jornada (nil = none).
func miSala(ctx context.Context, q querier, jid, fanID uuid.UUID) (*salaRow, error) {
	if fanID == uuid.Nil {
		return nil, nil
	}
	s, err := scanSala(q.QueryRow(ctx, selSala+` JOIN sala_miembros m ON m.sala_id = s.id WHERE m.jornada_id = $1 AND m.fan_id = $2`, jid, fanID))
	if db.IsNoRows(err) {
		return nil, nil
	}
	return s, err
}

var sinAcentos = strings.NewReplacer("á", "a", "à", "a", "ä", "a", "â", "a", "é", "e", "è", "e", "ë", "e", "ê", "e", "í", "i", "ì", "i", "ï", "i", "î", "i",
	"ó", "o", "ò", "o", "ö", "o", "ô", "o", "ú", "u", "ù", "u", "ü", "u", "û", "u")

// normalizarNombre folds a room name for uniqueness and search: lower case, no accents, single spaces.
func normalizarNombre(s string) string {
	return sinAcentos.Replace(strings.ToLower(strings.Join(strings.Fields(s), " ")))
}

// nombresProhibidos is the basic filter of room names (staff impersonation and common insults); the staff can
// rename or close a room from the backoffice database if something slips through.
var nombresProhibidos = []string{"admin", "moderador", "staff", "grcup", "organizacion", "mierda", "joder", "cabron", "gilipollas",
	"subnormal", "maricon", "puta", "puto", "zorra", "polla", "coño", "verga", "fuck", "shit", "bitch", "nigger", "nigga", "cunt", "whore"}

// validarNombreSala returns the cleaned name (3–32 characters, letters, digits, spaces and basic punctuation, no
// forbidden words) or a 422.
func validarNombreSala(s string) (string, error) {
	s = strings.Join(strings.Fields(s), " ")
	if n := len([]rune(s)); n < 3 || n > 32 {
		return "", problem.Unprocessable("NOMBRE_NO_VALIDO", "El nombre de la sala debe tener entre 3 y 32 caracteres.")
	}
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !strings.ContainsRune(" _.-'!·", r) {
			return "", problem.Unprocessable("NOMBRE_NO_VALIDO", "El nombre solo puede llevar letras, números, espacios y _ . - ' !")
		}
	}
	junto := strings.NewReplacer(" ", "", "_", "", ".", "", "-", "", "'", "", "!", "", "·", "").Replace(normalizarNombre(s))
	for _, p := range nombresProhibidos {
		if strings.Contains(junto, normalizarNombre(p)) {
			return "", problem.Unprocessable("NOMBRE_NO_VALIDO", "Ese nombre no está permitido. Elige otro.")
		}
	}
	return s, nil
}

// nuevoCodigo is the invitation code of a room: 10 characters without look-alikes (no 0/O, 1/I/L).
func nuevoCodigo() string {
	const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = abc[int(b[i])%len(abc)]
	}
	return string(b)
}

func esUnico(err error, restriccion string) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505" && strings.Contains(pg.ConstraintName, restriccion)
}

// eventoSala emits fantasy.sala (lobby and room views refetch) — only ids and the kind of change. The stream is
// public, so a room that is not public («solo enlace») does not publish its id: its members refetch on `privada`.
func eventoSala(ctx context.Context, tx pgx.Tx, cid uuid.UUID, s *salaRow, tipo string) error {
	datos := map[string]any{"jornadaId": s.JornadaID.String(), "salaId": s.ID.String(), "tipo": tipo}
	if !s.Publica {
		datos = map[string]any{"jornadaId": s.JornadaID.String(), "privada": true, "tipo": tipo}
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "fantasy.sala", datos, events.Competition(cid.String()), events.Audience(events.Public)))
}

// eventoSolicitud emits fantasy.solicitud (the host's tray and the requester's state refetch). solicitudId lets
// the requester recognise his own; the alias is the public nickname. A room that is not public («solo enlace», it
// may have become so after the request) only tells that something changed: no room id and no alias leave it.
func eventoSolicitud(ctx context.Context, tx pgx.Tx, cid, jid, salaID, solID uuid.UUID, tipo, alias string) error {
	var publica bool
	if err := tx.QueryRow(ctx, `SELECT publica FROM salas WHERE id = $1`, salaID).Scan(&publica); err != nil {
		return err
	}
	datos := map[string]any{"jornadaId": jid.String(), "salaId": salaID.String(), "solicitudId": solID.String(), "tipo": tipo, "alias": alias}
	if !publica {
		datos = map[string]any{"jornadaId": jid.String(), "solicitudId": solID.String(), "tipo": tipo, "privada": true}
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "fantasy.solicitud", datos, events.Competition(cid.String()), events.Audience(events.Public)))
}

// bloquearFanTx serializes the room operations of one fan in a jornada (max pending requests, one room per day).
func bloquearFanTx(ctx context.Context, tx pgx.Tx, jid, fanID uuid.UUID) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, "sala-fan:"+jid.String()+":"+fanID.String())
	return err
}

// cerrarSolicitudesTx moves the pending requests matching the filter to another state and emits their events.
// Exactly one of salaID / fanID is set: the requests of a room, or the requests of a fan in the jornada.
func cerrarSolicitudesTx(ctx context.Context, tx pgx.Tx, cid, jid, salaID, fanID uuid.UUID, estado string) error {
	rows, err := tx.Query(ctx, `UPDATE sala_solicitudes SET estado = $4, updated_at = now()
		WHERE jornada_id = $1 AND estado = 'pendiente' AND ($2::uuid IS NULL OR sala_id = $2) AND ($3::uuid IS NULL OR fan_id = $3)
		RETURNING id, sala_id, alias`, jid, nilUUID(salaID), nilUUID(fanID), estado)
	if err != nil {
		return err
	}
	type fila struct {
		id, sala uuid.UUID
		alias    string
	}
	var fs []fila
	for rows.Next() {
		var f fila
		if err := rows.Scan(&f.id, &f.sala, &f.alias); err != nil {
			rows.Close()
			return err
		}
		fs = append(fs, f)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, f := range fs {
		if err := eventoSolicitud(ctx, tx, cid, jid, f.sala, f.id, estado, f.alias); err != nil {
			return err
		}
	}
	return nil
}

func nilUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

// crearSalaTx creates a room with the fan as host and first member. plazas comes from plazasSala.
func crearSalaTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, fanID uuid.UUID, alias, nombre string, publica bool, plazas int) (*salaRow, error) {
	if err := bloquearFanTx(ctx, tx, j.ID, fanID); err != nil {
		return nil, err
	}
	if s, err := miSala(ctx, tx, j.ID, fanID); err != nil {
		return nil, err
	} else if s != nil {
		return nil, problem.Conflict("YA_EN_SALA", "Ya estás en una sala hoy. Sal de ella antes de crear otra.")
	}
	var existe bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM salas WHERE jornada_id = $1 AND nombre_norm = $2 AND estado IN ('abierta', 'en_juego'))`,
		j.ID, normalizarNombre(nombre)).Scan(&existe); err != nil {
		return nil, err
	}
	if existe {
		return nil, problem.Conflict("NOMBRE_OCUPADO", "Ya hay una sala con ese nombre hoy. Elige otro.")
	}
	s := &salaRow{ID: newID(), JornadaID: j.ID, Nombre: nombre, Anfitrion: fanID, Plazas: plazas, Publica: publica, Admite: true, Codigo: nuevoCodigo(), Estado: "abierta"}
	if err := tx.QueryRow(ctx, `INSERT INTO salas (id, competition_id, jornada_id, nombre, nombre_norm, anfitrion_fan_id, plazas, publica, codigo)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING created_at`, s.ID, cid, j.ID, nombre, normalizarNombre(nombre), fanID, plazas, publica, s.Codigo).Scan(&s.CreatedAt); err != nil {
		if esUnico(err, "salas_nombre") { // two rooms with the same name created at once
			return nil, problem.Conflict("NOMBRE_OCUPADO", "Ya hay una sala con ese nombre hoy. Elige otro.")
		}
		return nil, err
	}
	if err := altaMiembroTx(ctx, tx, cid, j, s, fanID, alias); err != nil {
		return nil, err
	}
	return s, eventoSala(ctx, tx, cid, s, "creada")
}

// altaMiembroTx seats a fan in a room that the caller holds FOR UPDATE (or has just created): one room per day,
// the fan's pending requests are cancelled and, if the room is now full, so are the requests waiting for it.
func altaMiembroTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, s *salaRow, fanID uuid.UUID, alias string) error {
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM sala_miembros WHERE sala_id = $1`, s.ID).Scan(&n); err != nil {
		return err
	}
	if n >= s.Plazas {
		return problem.Conflict("SALA_LLENA", "La sala está llena.")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sala_miembros (sala_id, jornada_id, fan_id, miembro_id, alias) VALUES ($1,$2,$3,$4,$5)`,
		s.ID, j.ID, fanID, newID(), alias); err != nil {
		if esUnico(err, "sala_miembros") {
			return problem.Conflict("YA_EN_SALA", "Ya estás en una sala hoy.")
		}
		return err
	}
	// The wallet of the day exists from the moment the fan plays in a room (the ranking reads its balance).
	if _, err := abrirCarteraTx(ctx, tx, j, fanID, Fantasy); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE saldos SET alias = $3 WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'fantasy' AND $3 <> ''`, j.ID, fanID, alias); err != nil {
		return err
	}
	if err := cerrarSolicitudesTx(ctx, tx, cid, j.ID, uuid.Nil, fanID, "cancelada"); err != nil {
		return err
	}
	if n+1 >= s.Plazas {
		return cerrarSolicitudesTx(ctx, tx, cid, j.ID, s.ID, uuid.Nil, "sala_llena")
	}
	return nil
}

// entradaPosibleTx checks that a fan may sit in the room: open, not expelled, not in another room today.
func entradaPosibleTx(ctx context.Context, tx pgx.Tx, j jornada, s *salaRow, fanID uuid.UUID) error {
	if s.Estado != "abierta" {
		return problem.Conflict("SALA_NO_DISPONIBLE", "La sala ya ha empezado o está cerrada.")
	}
	var expulsado bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sala_solicitudes WHERE sala_id = $1 AND fan_id = $2 AND estado = 'expulsada')`, s.ID, fanID).Scan(&expulsado); err != nil {
		return err
	}
	if expulsado {
		return problem.Forbidden("El anfitrión te ha expulsado de esta sala: no puedes volver a entrar.")
	}
	otra, err := miSala(ctx, tx, j.ID, fanID)
	if err != nil {
		return err
	}
	if otra != nil && otra.ID == s.ID {
		return problem.Conflict("YA_MIEMBRO", "Ya estás en esta sala.")
	}
	if otra != nil {
		return problem.Conflict("YA_EN_SALA", "Ya estás en otra sala hoy. Sal de ella antes de entrar en esta.")
	}
	return nil
}

// unirsePorCodigoTx: the invitation link of the host seats the fan straight away (no approval).
func unirsePorCodigoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, fanID uuid.UUID, alias, codigo string) (*salaRow, error) {
	if err := bloquearFanTx(ctx, tx, j.ID, fanID); err != nil {
		return nil, err
	}
	s, err := scanSala(tx.QueryRow(ctx, selSala+` WHERE s.codigo = $1 AND s.jornada_id = $2 FOR UPDATE`, strings.ToUpper(strings.TrimSpace(codigo)), j.ID))
	if db.IsNoRows(err) {
		return nil, problem.NotFound("El enlace de invitación no es válido o ha caducado.")
	}
	if err != nil {
		return nil, err
	}
	if err := entradaPosibleTx(ctx, tx, j, s, fanID); err != nil {
		return nil, err
	}
	if err := altaMiembroTx(ctx, tx, cid, j, s, fanID, alias); err != nil {
		return nil, err
	}
	return s, eventoSala(ctx, tx, cid, s, "miembros")
}

// solicitarTx asks to join a public room from the lobby: at most maxSolicitudes pending per fan, never again in
// the same day after a rejection. Asking twice is a no-op.
func solicitarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, salaID, fanID uuid.UUID, alias string) (uuid.UUID, error) {
	if err := bloquearFanTx(ctx, tx, j.ID, fanID); err != nil {
		return uuid.Nil, err
	}
	s, err := salaTx(ctx, tx, j, salaID)
	if err != nil {
		return uuid.Nil, err
	}
	if !s.Publica {
		return uuid.Nil, errSalaNoExiste // private rooms do not exist for the lobby
	}
	if err := entradaPosibleTx(ctx, tx, j, s, fanID); err != nil {
		return uuid.Nil, err
	}
	if !s.Admite {
		return uuid.Nil, problem.Conflict("SOLICITUDES_BLOQUEADAS", "El anfitrión ha bloqueado las solicitudes de esta sala: solo se entra con su enlace de invitación.")
	}
	var miembros int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM sala_miembros WHERE sala_id = $1`, s.ID).Scan(&miembros); err != nil {
		return uuid.Nil, err
	}
	if miembros >= s.Plazas {
		return uuid.Nil, problem.Conflict("SALA_LLENA", "La sala está llena.")
	}
	var id uuid.UUID
	var estado string
	err = tx.QueryRow(ctx, `SELECT id, estado FROM sala_solicitudes WHERE sala_id = $1 AND fan_id = $2 FOR UPDATE`, s.ID, fanID).Scan(&id, &estado)
	if err != nil && !db.IsNoRows(err) {
		return uuid.Nil, err
	}
	switch estado {
	case "pendiente":
		return id, nil
	case "rechazada":
		return uuid.Nil, problem.Conflict("SOLICITUD_RECHAZADA", "El anfitrión rechazó tu solicitud: no puedes volver a pedirlo hoy en esta sala.")
	}
	var pendientes int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM sala_solicitudes WHERE jornada_id = $1 AND fan_id = $2 AND estado = 'pendiente'`, j.ID, fanID).Scan(&pendientes); err != nil {
		return uuid.Nil, err
	}
	if pendientes >= maxSolicitudes {
		return uuid.Nil, problem.Conflict("MAX_SOLICITUDES", "Ya tienes "+itoa(maxSolicitudes)+" solicitudes pendientes. Cancela alguna o espera la respuesta.")
	}
	if id == uuid.Nil {
		id = newID()
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sala_solicitudes (id, sala_id, jornada_id, fan_id, alias) VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (sala_id, fan_id) DO UPDATE SET estado = 'pendiente', alias = EXCLUDED.alias, created_at = now(), updated_at = now()`,
		id, s.ID, j.ID, fanID, alias); err != nil {
		return uuid.Nil, err
	}
	return id, eventoSolicitud(ctx, tx, cid, j.ID, s.ID, id, "pendiente", alias)
}

// cancelarSolicitudTx: the requester withdraws his pending request.
func cancelarSolicitudTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, salaID, fanID uuid.UUID) error {
	var id uuid.UUID
	var alias string
	err := tx.QueryRow(ctx, `UPDATE sala_solicitudes SET estado = 'cancelada', updated_at = now()
		WHERE sala_id = $1 AND jornada_id = $2 AND fan_id = $3 AND estado = 'pendiente' RETURNING id, alias`, salaID, j.ID, fanID).Scan(&id, &alias)
	if db.IsNoRows(err) {
		return problem.NotFound("No tienes una solicitud pendiente en esa sala.")
	}
	if err != nil {
		return err
	}
	return eventoSolicitud(ctx, tx, cid, j.ID, salaID, id, "cancelada", alias)
}

// salaDeAnfitrionTx locks the room and checks that the fan is its host and that the day has not started.
func salaDeAnfitrionTx(ctx context.Context, tx pgx.Tx, j jornada, salaID, fanID uuid.UUID) (*salaRow, error) {
	s, err := salaTx(ctx, tx, j, salaID)
	if err != nil {
		return nil, err
	}
	if s.Anfitrion != fanID {
		return nil, problem.Forbidden("Solo el anfitrión de la sala puede hacer eso.")
	}
	if s.Estado != "abierta" {
		return nil, problem.Conflict("SALA_NO_DISPONIBLE", "La sala ya ha empezado o está cerrada.")
	}
	return s, nil
}

// responderSolicitudTx: the host accepts (the requester sits down, if there is a seat and he is still free) or
// rejects a pending request.
func responderSolicitudTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, salaID, anfitrion, solID uuid.UUID, aceptar bool) error {
	s, err := salaDeAnfitrionTx(ctx, tx, j, salaID, anfitrion)
	if err != nil {
		return err
	}
	var fanID uuid.UUID
	var alias string
	err = tx.QueryRow(ctx, `SELECT fan_id, alias FROM sala_solicitudes WHERE id = $1 AND sala_id = $2 AND estado = 'pendiente' FOR UPDATE`, solID, s.ID).Scan(&fanID, &alias)
	if db.IsNoRows(err) {
		return problem.Conflict("SOLICITUD_NO_PENDIENTE", "Esa solicitud ya no está pendiente.")
	}
	if err != nil {
		return err
	}
	estado := "rechazada"
	if aceptar {
		estado = "aceptada"
	}
	if _, err := tx.Exec(ctx, `UPDATE sala_solicitudes SET estado = $2, updated_at = now() WHERE id = $1`, solID, estado); err != nil {
		return err
	}
	if aceptar {
		// altaMiembroTx cancels the other pending requests of the fan (this one is no longer pending).
		if err := altaMiembroTx(ctx, tx, cid, j, s, fanID, alias); err != nil {
			return err
		}
		if err := eventoSala(ctx, tx, cid, s, "miembros"); err != nil {
			return err
		}
	}
	return eventoSolicitud(ctx, tx, cid, j.ID, s.ID, solID, estado, alias)
}

// cerrarTx empties and closes a room the caller holds FOR UPDATE: every member recovers his athletes' value.
func cerrarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, s *salaRow, estado string, conservarMiembros bool) error {
	rows, err := tx.Query(ctx, `SELECT fan_id FROM sala_miembros WHERE sala_id = $1 ORDER BY fan_id`, s.ID)
	if err != nil {
		return err
	}
	var fans []uuid.UUID
	for rows.Next() {
		var f uuid.UUID
		if err := rows.Scan(&f); err != nil {
			rows.Close()
			return err
		}
		fans = append(fans, f)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, f := range fans {
		if err := liberarAtletasTx(ctx, tx, j, s.ID, f); err != nil {
			return err
		}
	}
	if !conservarMiembros {
		if _, err := tx.Exec(ctx, `DELETE FROM sala_miembros WHERE sala_id = $1`, s.ID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE salas SET estado = $2, version = version + 1, updated_at = now() WHERE id = $1`, s.ID, estado); err != nil {
		return err
	}
	if err := cerrarSolicitudesTx(ctx, tx, cid, j.ID, s.ID, uuid.Nil, "cancelada"); err != nil {
		return err
	}
	return eventoSala(ctx, tx, cid, s, estado)
}

// salirTx: a member leaves before the day starts. His athletes go back to the market; the host role passes to
// the oldest member; the last one out closes the room.
func salirTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, salaID, fanID uuid.UUID) error {
	s, err := salaTx(ctx, tx, j, salaID)
	if err != nil {
		return err
	}
	if s.Estado != "abierta" {
		return problem.Conflict("SALA_NO_DISPONIBLE", "La sala ya ha empezado: no puedes salir.")
	}
	return quitarMiembroTx(ctx, tx, cid, j, s, fanID)
}

func quitarMiembroTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, s *salaRow, fanID uuid.UUID) error {
	if err := liberarAtletasTx(ctx, tx, j, s.ID, fanID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM sala_miembros WHERE sala_id = $1 AND fan_id = $2`, s.ID, fanID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return problem.NotFound("Ese jugador no está en la sala.")
	}
	var siguiente uuid.UUID
	err = tx.QueryRow(ctx, `SELECT fan_id FROM sala_miembros WHERE sala_id = $1 ORDER BY joined_at, fan_id LIMIT 1`, s.ID).Scan(&siguiente)
	if db.IsNoRows(err) {
		return cerrarTx(ctx, tx, cid, j, s, "cerrada", false)
	}
	if err != nil {
		return err
	}
	if s.Anfitrion == fanID {
		if _, err := tx.Exec(ctx, `UPDATE salas SET anfitrion_fan_id = $2, version = version + 1, updated_at = now() WHERE id = $1`, s.ID, siguiente); err != nil {
			return err
		}
	}
	return eventoSala(ctx, tx, cid, s, "miembros")
}

// transferirTx: the host hands the role to another member of the room (by his public miembro id), also once the
// day is on. The room row lock serializes it with leaves and expulsions.
func transferirTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, salaID, anfitrion, miembroID uuid.UUID) error {
	s, err := salaTx(ctx, tx, j, salaID)
	if err != nil {
		return err
	}
	if s.Anfitrion != anfitrion {
		return problem.Forbidden("Solo el anfitrión de la sala puede hacer eso.")
	}
	if s.Estado != "abierta" && s.Estado != "en_juego" {
		return problem.Conflict("SALA_NO_DISPONIBLE", "La sala está cerrada.")
	}
	var nuevo uuid.UUID
	err = tx.QueryRow(ctx, `SELECT fan_id FROM sala_miembros WHERE sala_id = $1 AND miembro_id = $2`, s.ID, miembroID).Scan(&nuevo)
	if db.IsNoRows(err) {
		return problem.NotFound("Ese jugador no está en la sala.")
	}
	if err != nil {
		return err
	}
	if nuevo == anfitrion {
		return problem.Conflict("ANFITRION", "Ya eres el anfitrión de la sala.")
	}
	if _, err := tx.Exec(ctx, `UPDATE salas SET anfitrion_fan_id = $2, version = version + 1, updated_at = now() WHERE id = $1`, s.ID, nuevo); err != nil {
		return err
	}
	return eventoSala(ctx, tx, cid, s, "anfitrion")
}

// expulsarTx: the host removes a member (by his public miembro id) before the day starts; he cannot come back.
func expulsarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, salaID, anfitrion, miembroID uuid.UUID) error {
	s, err := salaDeAnfitrionTx(ctx, tx, j, salaID, anfitrion)
	if err != nil {
		return err
	}
	var fanID uuid.UUID
	var alias string
	err = tx.QueryRow(ctx, `SELECT fan_id, alias FROM sala_miembros WHERE sala_id = $1 AND miembro_id = $2`, s.ID, miembroID).Scan(&fanID, &alias)
	if db.IsNoRows(err) {
		return problem.NotFound("Ese jugador no está en la sala.")
	}
	if err != nil {
		return err
	}
	if fanID == anfitrion {
		return problem.Conflict("ANFITRION", "No puedes expulsarte: sal de la sala o ciérrala.")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sala_solicitudes (id, sala_id, jornada_id, fan_id, alias, estado) VALUES ($1,$2,$3,$4,$5,'expulsada')
		ON CONFLICT (sala_id, fan_id) DO UPDATE SET estado = 'expulsada', updated_at = now()`, newID(), s.ID, j.ID, fanID, alias); err != nil {
		return err
	}
	return quitarMiembroTx(ctx, tx, cid, j, s, fanID)
}

// iniciarSalasTx starts the day for the rooms of a jornada (idempotent): rooms with fewer than 2 members are
// cancelled at no cost, the rest go en_juego and every pending request expires.
func iniciarSalasTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada) error {
	rows, err := tx.Query(ctx, selSala+` WHERE s.jornada_id = $1 AND s.estado = 'abierta' ORDER BY s.id FOR UPDATE`, j.ID)
	if err != nil {
		return err
	}
	var salas []*salaRow
	for rows.Next() {
		s, err := scanSala(rows)
		if err != nil {
			rows.Close()
			return err
		}
		salas = append(salas, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, s := range salas {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM sala_miembros WHERE sala_id = $1`, s.ID).Scan(&n); err != nil {
			return err
		}
		if n < 2 {
			if err := cerrarTx(ctx, tx, cid, j, s, "cancelada", true); err != nil {
				return err
			}
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE salas SET estado = 'en_juego', version = version + 1, updated_at = now() WHERE id = $1`, s.ID); err != nil {
			return err
		}
		if err := eventoSala(ctx, tx, cid, s, "en_juego"); err != nil {
			return err
		}
	}
	return cerrarSolicitudesTx(ctx, tx, cid, j.ID, uuid.Nil, uuid.Nil, "caducada")
}
