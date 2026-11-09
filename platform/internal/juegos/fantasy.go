// fantasy.go: GRS Fantasy (contract §6.3): up to 8 athletes (5 titular + 3 suplentes), one owner at most per
// athlete and jornada, instant buys and sales at the current value, clausulazo paying the clause to the previous
// owner (row and both wallets locked in fan_id order, protection window, max 3 per fan and jornada, no debt),
// and the alignment change blocked for athletes whose flight is on the platform.
package juegos

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// atletaMercado is one row of the fantasy market (public view).
type atletaMercado struct {
	AtletaID   uuid.UUID `json:"atletaId"`
	Nombre     string    `json:"nombre"`
	Sexo       string    `json:"sexo"`
	Categoria  string    `json:"categoria"`
	Clausula   int64     `json:"clausula"`
	DuenoAlias string    `json:"duenoAlias,omitempty"`
	Titular    bool      `json:"titular"`
	Protegido  bool      `json:"protegido"`
	// ProtegidoHasta is set while the protection after the last signing lasts (the «Protegido · mm:ss» countdown).
	ProtegidoHasta *time.Time `json:"protegidoHasta,omitempty"`
	Libre          bool       `json:"libre"`
	EsMio          bool       `json:"esMio"`
	FlightEnCurso  bool       `json:"flightEnCurso"`
}

// mercadoFantasy lists the athletes of a jornada with clause, owner (public alias) and protection.
func (s *Svc) mercadoFantasy(ctx context.Context, cid uuid.UUID, j jornada, fanID uuid.UUID) ([]atletaMercado, error) {
	m, err := s.marcador(ctx, cid, j.Dia)
	if err != nil {
		return nil, err
	}
	enCurso := map[uuid.UUID]bool{}
	for i := range m.Atletas {
		if m.Atletas[i].FlightEnCurso {
			enCurso[m.Atletas[i].AtletaID] = true
		}
	}
	// COALESCE: `protegido_hasta > now()` is NULL when the athlete was never signed (NULL > now() = NULL) and a
	// NULL cannot be scanned into a bool.
	rows, err := s.a.DB.Query(ctx, `SELECT atleta_id, nombre_publico, sexo, categoria, clausula, dueno_fan_id, dueno_alias, titular, COALESCE(protegido_hasta > now(), false), CASE WHEN protegido_hasta > now() THEN protegido_hasta END
		FROM fantasy_atletas WHERE jornada_id = $1 ORDER BY sexo, categoria, nombre_publico`, j.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []atletaMercado{}
	for rows.Next() {
		var a atletaMercado
		var dueno *uuid.UUID
		if err := rows.Scan(&a.AtletaID, &a.Nombre, &a.Sexo, &a.Categoria, &a.Clausula, &dueno, &a.DuenoAlias, &a.Titular, &a.Protegido, &a.ProtegidoHasta); err != nil {
			return nil, err
		}
		a.Libre = dueno == nil
		a.EsMio = dueno != nil && *dueno == fanID
		a.FlightEnCurso = enCurso[a.AtletaID]
		out = append(out, a)
	}
	return out, rows.Err()
}

// comprarTx signs a free athlete for his current value (clause): wallet spend, ownership, +3 % demand, history
// and events, all in one transaction. The row lock avoids two buyers for the same athlete.
func (s *Svc) comprarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	var cl int64
	var dueno *uuid.UUID
	var protegido *time.Time
	err := tx.QueryRow(ctx, `SELECT clausula, dueno_fan_id, protegido_hasta FROM fantasy_atletas
		WHERE jornada_id = $1 AND atleta_id = $2 FOR UPDATE`, j.ID, atletaID).Scan(&cl, &dueno, &protegido)
	if db.IsNoRows(err) {
		return problem.NotFound("Ese atleta no está en la jornada.")
	}
	if err != nil {
		return err
	}
	if dueno != nil {
		return problem.Conflict("YA_CON_DUENO", "Otro usuario ya tiene a ese atleta. Puedes pagar su cláusula.")
	}
	if protegido != nil && protegido.After(time.Now()) {
		return problem.Conflict("ATLETA_PROTEGIDO", "El atleta está protegido un rato después de su último fichaje.")
	}
	// The buyer's wallet row serializes his own signings: two concurrent purchases of different athletes cannot
	// both see room in the squad (lock order stays athlete row → wallets, as in the clausulazo).
	if err := bloquearCarterasTx(ctx, tx, j, fanID); err != nil {
		return err
	}
	plantilla, titulares, err := contarPlantillaTx(ctx, tx, j.ID, fanID)
	if err != nil {
		return err
	}
	if plantilla >= cfg.PlantillaMax {
		return problem.Conflict("PLANTILLA_LLENA", "Tu plantilla está completa (máximo "+itoa(cfg.PlantillaMax)+"). Vende alguien antes.")
	}
	fid := newID()
	if err := gastarTx(ctx, tx, j, fanID, Fantasy, cl, "compra", "compra:"+fid.String(), alias); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE fantasy_atletas SET dueno_fan_id = $3, dueno_alias = $4, titular = $5, protegido_hasta = now() + make_interval(mins => $6), version = version + 1, updated_at = now()
		WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, atletaID, fanID, alias, titulares < cfg.TitularesMax, cfg.ProteccionMin); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, atleta_id, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,'compra',$6)`,
		fid, cid, j.ID, atletaID, fanID, cl); err != nil {
		return err
	}
	if err := eventoFichaje(ctx, tx, cid, j.ID, atletaID, "compra", "", alias, cl); err != nil {
		return err
	}
	_, err = cambiarClausulaTx(ctx, tx, cid, j.ID, atletaID, cfg.PctDemanda, cfg, "demanda")
	return err
}

// venderTx returns an athlete to the market: the seller receives 100 % of the current value (contract §6.3).
func (s *Svc) venderTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	var cl int64
	var dueno *uuid.UUID
	err := tx.QueryRow(ctx, `SELECT clausula, dueno_fan_id FROM fantasy_atletas
		WHERE jornada_id = $1 AND atleta_id = $2 FOR UPDATE`, j.ID, atletaID).Scan(&cl, &dueno)
	if db.IsNoRows(err) {
		return problem.NotFound("Ese atleta no está en la jornada.")
	}
	if err != nil {
		return err
	}
	if dueno == nil {
		return problem.Conflict("ATLETA_LIBRE", "Ese atleta está libre: no puedes venderlo.")
	}
	if *dueno != fanID {
		return problem.Conflict("ATLETA_AJENO", "Ese atleta no es tuyo.")
	}
	fid := newID()
	if _, err := acreditarTx(ctx, tx, j, fanID, Fantasy, cl, "venta", "venta:"+fid.String(), alias); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE fantasy_atletas SET dueno_fan_id = NULL, dueno_alias = '', titular = false,
		protegido_hasta = now() + make_interval(mins => $3), version = version + 1, updated_at = now()
		WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, atletaID, cfg.ProteccionMin); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, atleta_id, de_fan, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$5,'venta',$6)`,
		fid, cid, j.ID, atletaID, fanID, cl); err != nil {
		return err
	}
	return eventoFichaje(ctx, tx, cid, j.ID, atletaID, "venta", alias, "", cl)
}

// clausulazoTx pays the clause of an athlete owned by someone else: the money goes to the previous owner. The
// athlete row and BOTH wallets are locked in fan_id order (no deadlocks between opposite clausulazos). Protection
// window after any signing, at most max_clausulazos per fan and jornada, room in the squad required, and the
// spend cannot go below zero (no debt).
func (s *Svc) clausulazoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	var cl int64
	var dueno *uuid.UUID
	var duenoAlias string
	var protegido *time.Time
	err := tx.QueryRow(ctx, `SELECT clausula, dueno_fan_id, dueno_alias, protegido_hasta FROM fantasy_atletas
		WHERE jornada_id = $1 AND atleta_id = $2 FOR UPDATE`, j.ID, atletaID).Scan(&cl, &dueno, &duenoAlias, &protegido)
	if db.IsNoRows(err) {
		return problem.NotFound("Ese atleta no está en la jornada.")
	}
	if err != nil {
		return err
	}
	if dueno == nil {
		return problem.Conflict("ATLETA_LIBRE", "Ese atleta está libre: cómpralo, no hace falta clausulazo.")
	}
	if *dueno == fanID {
		return problem.Conflict("ATLETA_PROPIO", "El atleta ya es tuyo.")
	}
	if protegido != nil && protegido.After(time.Now()) {
		return problem.Conflict("ATLETA_PROTEGIDO", "El atleta está protegido un rato después de su último fichaje o clausulazo.")
	}
	// Both wallets (created lazily) locked in fan_id order BEFORE the per-fan checks: the clausulazo in the
	// opposite direction cannot interleave and two concurrent signings of the same buyer cannot both pass the
	// squad size or max_clausulazos checks (contract §6.3).
	if err := bloquearCarterasTx(ctx, tx, j, fanID, *dueno); err != nil {
		return err
	}
	var nClausulazos int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM fichajes WHERE jornada_id = $1 AND a_fan = $2 AND tipo = 'clausulazo'`, j.ID, fanID).Scan(&nClausulazos); err != nil {
		return err
	}
	if nClausulazos >= cfg.MaxClausulazos {
		return problem.Conflict("MAX_CLAUSULAZOS", "Ya has pagado "+itoa(cfg.MaxClausulazos)+" clausulazos en esta jornada.")
	}
	plantilla, titulares, err := contarPlantillaTx(ctx, tx, j.ID, fanID)
	if err != nil {
		return err
	}
	if plantilla >= cfg.PlantillaMax {
		return problem.Conflict("PLANTILLA_LLENA", "No puedes clausular sin hueco en la plantilla.")
	}
	previo := *dueno
	fid := newID()
	if err := gastarTx(ctx, tx, j, fanID, Fantasy, cl, "clausulazo", "clausulazo-out:"+fid.String(), alias); err != nil {
		return err
	}
	if _, err := acreditarTx(ctx, tx, j, previo, Fantasy, cl, "clausulazo", "clausulazo-in:"+fid.String(), ""); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE fantasy_atletas SET dueno_fan_id = $3, dueno_alias = $4, titular = $5,
		protegido_hasta = now() + make_interval(mins => $6), version = version + 1, updated_at = now()
		WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, atletaID, fanID, alias, titulares < cfg.TitularesMax, cfg.ProteccionMin); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, atleta_id, de_fan, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,'clausulazo',$7)`,
		fid, cid, j.ID, atletaID, previo, fanID, cl); err != nil {
		return err
	}
	if err := eventoFichaje(ctx, tx, cid, j.ID, atletaID, "clausulazo", duenoAlias, alias, cl); err != nil {
		return err
	}
	_, err = cambiarClausulaTx(ctx, tx, cid, j.ID, atletaID, cfg.PctDemanda, cfg, "demanda")
	return err
}

// bloquearCarterasTx opens (lazily) and locks the fantasy wallets of fans in fan_id order. Every operation that
// touches several wallets of one transaction takes them in that same order (the liquidation of the porra sorts its
// payouts by fan_id too): two operations that run at the same time cannot deadlock each other (contract §6.3).
func bloquearCarterasTx(ctx context.Context, tx pgx.Tx, j jornada, fans ...uuid.UUID) error {
	for _, f := range fans {
		if _, err := abrirCarteraTx(ctx, tx, j, f, Fantasy); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `SELECT fan_id FROM saldos WHERE jornada_id = $1 AND moneda = 'fantasy' AND fan_id = ANY($2) ORDER BY fan_id FOR UPDATE`, j.ID, fans)
	return err
}

func contarPlantillaTx(ctx context.Context, tx pgx.Tx, jid, fanID uuid.UUID) (total, titulares int, err error) {
	err = tx.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE titular) FROM fantasy_atletas WHERE jornada_id = $1 AND dueno_fan_id = $2`, jid, fanID).
		Scan(&total, &titulares)
	return
}

// eventoFichaje emits the public signing event (aliases are public nicknames, contract §6.6).
func eventoFichaje(ctx context.Context, tx pgx.Tx, cid, jid, atletaID uuid.UUID, tipo, aliasDe, aliasA string, precio int64) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "fantasy.fichaje",
		map[string]any{"jornadaId": jid.String(), "atletaId": atletaID.String(), "tipo": tipo, "aliasDe": aliasDe, "aliasA": aliasA, "precio": precio},
		events.Competition(cid.String()), events.Audience(events.Public)))
}

// alineacionTx sets the titulars of a fan (at most titulares_max). An athlete whose flight is on the platform
// cannot change status (anti-cheat: nobody moves a lifter to titular while he is lifting).
func (s *Svc) alineacionTx(ctx context.Context, tx pgx.Tx, j jornada, cfg *Config, fanID uuid.UUID, titulares []uuid.UUID, enCurso map[uuid.UUID]bool) error {
	if len(titulares) > cfg.TitularesMax {
		return problem.Unprocessable("MUCHOS_TITULARES", "Solo puedes alinear "+itoa(cfg.TitularesMax)+" titulares.")
	}
	deseo := map[uuid.UUID]bool{}
	for _, a := range titulares {
		deseo[a] = true
	}
	rows, err := tx.Query(ctx, `SELECT atleta_id, titular FROM fantasy_atletas WHERE jornada_id = $1 AND dueno_fan_id = $2 FOR UPDATE`, j.ID, fanID)
	if err != nil {
		return err
	}
	type fila struct {
		id      uuid.UUID
		titular bool
	}
	var mias []fila
	for rows.Next() {
		var f fila
		if err := rows.Scan(&f.id, &f.titular); err != nil {
			rows.Close()
			return err
		}
		mias = append(mias, f)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(titulares) > len(mias) {
		return problem.Unprocessable("NO_TUYOS", "Solo puedes alinear atletas de tu plantilla.")
	}
	deseados := 0
	for _, f := range mias {
		if deseo[f.id] {
			deseados++
		}
	}
	if deseados != len(titulares) {
		return problem.Unprocessable("NO_TUYOS", "Solo puedes alinear atletas de tu plantilla.")
	}
	if deseados > cfg.TitularesMax {
		return problem.Unprocessable("MUCHOS_TITULARES", "Solo puedes alinear "+itoa(cfg.TitularesMax)+" titulares.")
	}
	for _, f := range mias {
		if f.titular == deseo[f.id] || !enCurso[f.id] {
			continue
		}
		return problem.Conflict("ALINEACION_BLOQUEADA", "Hay un atleta tuyo levantando ahora mismo: no puedes cambiarlo de titular mientras su flight está en curso.")
	}
	for _, f := range mias {
		if f.titular == deseo[f.id] {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE fantasy_atletas SET titular = $3, version = version + 1, updated_at = now()
			WHERE jornada_id = $1 AND atleta_id = $2`, j.ID, f.id, deseo[f.id]); err != nil {
			return err
		}
	}
	return nil
}
