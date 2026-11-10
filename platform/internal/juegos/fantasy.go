// fantasy.go: GRS Fantasy inside a room (BIZ-143): a lineup of exactly 5 athletes (no substitutes), one owner at
// most per athlete and ROOM, instant buys and sales at the current value, clausulazo paying the clause to the
// previous owner (athlete row and both wallets locked in fan_id order, protection window, max 3 per fan and
// jornada, no debt, closed from the last session of the day). The clause is one per athlete and jornada
// (fantasy_atletas); the ownership lives in sala_atletas. Lock order everywhere: room → athlete → wallets.
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
	AtletaID uuid.UUID `json:"atletaId"`
	Nombre   string    `json:"nombre"`
	// FotoURL is the public photo (public profile with image consent, from the live scoreboard); empty otherwise.
	FotoURL    string `json:"fotoUrl,omitempty"`
	Sexo       string `json:"sexo"`
	Categoria  string `json:"categoria"`
	Clausula   int64  `json:"clausula"`
	DuenoAlias string `json:"duenoAlias,omitempty"`
	Protegido  bool   `json:"protegido"`
	// ProtegidoHasta is set while the protection after the last signing lasts (the «Protegido · mm:ss» countdown).
	ProtegidoHasta *time.Time `json:"protegidoHasta,omitempty"`
	Libre          bool       `json:"libre"`
	EsMio          bool       `json:"esMio"`
	FlightEnCurso  bool       `json:"flightEnCurso"`
	Nota           notaAtleta `json:"nota"`
}

// mercadoFantasy lists the athletes of a jornada with clause and grade and, inside a room (salaID), the owner
// (public alias) and the protection. Without a room every athlete shows as free.
func (s *Svc) mercadoFantasy(ctx context.Context, cid uuid.UUID, j jornada, salaID, fanID uuid.UUID) ([]atletaMercado, error) {
	m, err := s.marcador(ctx, cid, j.Dia)
	if err != nil {
		return nil, err
	}
	cfg, err := configJuegos(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	enCurso := map[uuid.UUID]bool{}
	fotos := map[uuid.UUID]string{}
	for i := range m.Atletas {
		if m.Atletas[i].FlightEnCurso {
			enCurso[m.Atletas[i].AtletaID] = true
		}
		if m.Atletas[i].FotoURL != "" {
			fotos[m.Atletas[i].AtletaID] = m.Atletas[i].FotoURL
		}
	}
	notas := notasDelMarcador(cfg.Puntos, m)
	// COALESCE: `protegido_hasta > now()` is NULL when the athlete was never signed (NULL > now() = NULL) and a
	// NULL cannot be scanned into a bool.
	rows, err := s.a.DB.Query(ctx, `SELECT fa.atleta_id, fa.nombre_publico, fa.sexo, fa.categoria, fa.clausula, sa.dueno_fan_id, COALESCE(sa.dueno_alias, ''),
			COALESCE(sa.protegido_hasta > now(), false), CASE WHEN sa.protegido_hasta > now() THEN sa.protegido_hasta END
		FROM fantasy_atletas fa LEFT JOIN sala_atletas sa ON sa.sala_id = $2 AND sa.atleta_id = fa.atleta_id
		WHERE fa.jornada_id = $1 ORDER BY fa.sexo, fa.categoria, fa.nombre_publico`, j.ID, salaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []atletaMercado{}
	for rows.Next() {
		var a atletaMercado
		var dueno *uuid.UUID
		if err := rows.Scan(&a.AtletaID, &a.Nombre, &a.Sexo, &a.Categoria, &a.Clausula, &dueno, &a.DuenoAlias, &a.Protegido, &a.ProtegidoHasta); err != nil {
			return nil, err
		}
		a.Libre = dueno == nil
		a.EsMio = dueno != nil && fanID != uuid.Nil && *dueno == fanID
		a.FlightEnCurso = enCurso[a.AtletaID]
		a.FotoURL = fotos[a.AtletaID]
		a.Nota = notas[a.AtletaID]
		if a.Nota.Desglose == nil {
			a.Nota.Desglose = []notaLinea{}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// atletaSala is the ownership of one athlete inside a room, read under the athlete row lock.
type atletaSala struct {
	Clausula   int64
	Dueno      *uuid.UUID
	DuenoAlias string
	Protegido  *time.Time
}

// bloquearAtletaTx checks that the fan plays in a live room (shared lock on the room: a close or the start of the
// day cannot interleave), locks the athlete row of the jornada and reads his ownership inside the room.
func bloquearAtletaTx(ctx context.Context, tx pgx.Tx, j jornada, salaID, fanID, atletaID uuid.UUID) (atletaSala, error) {
	var a atletaSala
	var ok bool
	err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sala_miembros WHERE sala_id = s.id AND fan_id = $2)
		FROM salas s WHERE s.id = $1 AND s.jornada_id = $3 AND s.estado IN ('abierta', 'en_juego') FOR SHARE`, salaID, fanID, j.ID).Scan(&ok)
	if db.IsNoRows(err) || (err == nil && !ok) {
		return a, problem.Conflict("SIN_SALA", "Necesitas estar en una sala abierta o en juego para fichar.")
	}
	if err != nil {
		return a, err
	}
	err = tx.QueryRow(ctx, `SELECT clausula FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2 FOR UPDATE`, j.ID, atletaID).Scan(&a.Clausula)
	if db.IsNoRows(err) {
		return a, problem.NotFound("Ese atleta no está en la jornada.")
	}
	if err != nil {
		return a, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sala_atletas (sala_id, jornada_id, atleta_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, salaID, j.ID, atletaID); err != nil {
		return a, err
	}
	err = tx.QueryRow(ctx, `SELECT dueno_fan_id, dueno_alias, protegido_hasta FROM sala_atletas WHERE sala_id = $1 AND atleta_id = $2`, salaID, atletaID).
		Scan(&a.Dueno, &a.DuenoAlias, &a.Protegido)
	return a, err
}

func asignarDuenoTx(ctx context.Context, tx pgx.Tx, salaID, atletaID uuid.UUID, dueno *uuid.UUID, alias string, proteccionMin int) error {
	_, err := tx.Exec(ctx, `UPDATE sala_atletas SET dueno_fan_id = $3, dueno_alias = $4, protegido_hasta = now() + make_interval(mins => $5), updated_at = now()
		WHERE sala_id = $1 AND atleta_id = $2`, salaID, atletaID, dueno, alias, proteccionMin)
	return err
}

// comprarTx signs a free athlete of the room for his current value (clause): wallet spend, ownership, +3 % demand,
// history and events, all in one transaction. The athlete row lock avoids two buyers for the same athlete.
func (s *Svc) comprarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, salaID, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	a, err := bloquearAtletaTx(ctx, tx, j, salaID, fanID, atletaID)
	if err != nil {
		return err
	}
	if a.Dueno != nil {
		return problem.Conflict("YA_CON_DUENO", "Otro jugador de la sala ya tiene a ese atleta. Puedes pagar su cláusula.")
	}
	if a.Protegido != nil && a.Protegido.After(time.Now()) {
		return problem.Conflict("ATLETA_PROTEGIDO", "El atleta está protegido un rato después de su último fichaje.")
	}
	// The buyer's wallet row serializes his own signings: two concurrent purchases of different athletes cannot
	// both see room in the lineup.
	if err := bloquearCarterasTx(ctx, tx, j, fanID); err != nil {
		return err
	}
	if n, err := contarAlineacionTx(ctx, tx, salaID, fanID); err != nil {
		return err
	} else if n >= cfg.PlantillaMax {
		return problem.Conflict("PLANTILLA_LLENA", "Tu alineación está completa ("+itoa(cfg.PlantillaMax)+" atletas). Vende alguien antes.")
	}
	fid := newID()
	if err := gastarTx(ctx, tx, j, fanID, Fantasy, a.Clausula, "compra", "compra:"+fid.String(), alias); err != nil {
		return err
	}
	if err := asignarDuenoTx(ctx, tx, salaID, atletaID, &fanID, alias, cfg.ProteccionMin); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, sala_id, atleta_id, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,'compra',$7)`,
		fid, cid, j.ID, salaID, atletaID, fanID, a.Clausula); err != nil {
		return err
	}
	if err := eventoFichaje(ctx, tx, cid, j.ID, salaID, atletaID, "compra", "", alias, a.Clausula); err != nil {
		return err
	}
	_, err = cambiarClausulaTx(ctx, tx, cid, j.ID, atletaID, float64(cfg.PctDemanda), cfg, "demanda")
	return err
}

// venderTx returns an athlete to the market of the room: the seller receives 100 % of the current value.
func (s *Svc) venderTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, salaID, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	a, err := bloquearAtletaTx(ctx, tx, j, salaID, fanID, atletaID)
	if err != nil {
		return err
	}
	if a.Dueno == nil {
		return problem.Conflict("ATLETA_LIBRE", "Ese atleta está libre: no puedes venderlo.")
	}
	if *a.Dueno != fanID {
		return problem.Conflict("ATLETA_AJENO", "Ese atleta no es tuyo.")
	}
	fid := newID()
	if _, err := acreditarTx(ctx, tx, j, fanID, Fantasy, a.Clausula, "venta", "venta:"+fid.String(), alias); err != nil {
		return err
	}
	if err := asignarDuenoTx(ctx, tx, salaID, atletaID, nil, "", cfg.ProteccionMin); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, sala_id, atleta_id, de_fan, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,$6,'venta',$7)`,
		fid, cid, j.ID, salaID, atletaID, fanID, a.Clausula); err != nil {
		return err
	}
	return eventoFichaje(ctx, tx, cid, j.ID, salaID, atletaID, "venta", alias, "", a.Clausula)
}

// clausulazoTx pays the clause of an athlete owned by another player of the room: the money goes to the previous
// owner. The athlete row and BOTH wallets are locked in fan_id order (no deadlocks between opposite clausulazos).
// Closed from the start of the last session of the day (cierre); protection window after any signing, at most
// max_clausulazos per fan and jornada, room in the lineup required, and the spend cannot go below zero (no debt).
func (s *Svc) clausulazoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, cierre clausulazoVista, salaID, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	if err := cierre.problema(); err != nil {
		return err
	}
	a, err := bloquearAtletaTx(ctx, tx, j, salaID, fanID, atletaID)
	if err != nil {
		return err
	}
	if a.Dueno == nil {
		return problem.Conflict("ATLETA_LIBRE", "Ese atleta está libre: cómpralo, no hace falta clausulazo.")
	}
	if *a.Dueno == fanID {
		return problem.Conflict("ATLETA_PROPIO", "El atleta ya es tuyo.")
	}
	if a.Protegido != nil && a.Protegido.After(time.Now()) {
		return problem.Conflict("ATLETA_PROTEGIDO", "El atleta está protegido un rato después de su último fichaje o clausulazo.")
	}
	// Both wallets (created lazily) locked in fan_id order BEFORE the per-fan checks: the clausulazo in the
	// opposite direction cannot interleave and two concurrent signings of the same buyer cannot both pass the
	// lineup size or max_clausulazos checks.
	if err := bloquearCarterasTx(ctx, tx, j, fanID, *a.Dueno); err != nil {
		return err
	}
	var nClausulazos int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM fichajes WHERE jornada_id = $1 AND a_fan = $2 AND tipo = 'clausulazo'`, j.ID, fanID).Scan(&nClausulazos); err != nil {
		return err
	}
	if nClausulazos >= cfg.MaxClausulazos {
		return problem.Conflict("MAX_CLAUSULAZOS", "Ya has pagado "+itoa(cfg.MaxClausulazos)+" clausulazos en esta jornada.")
	}
	if n, err := contarAlineacionTx(ctx, tx, salaID, fanID); err != nil {
		return err
	} else if n >= cfg.PlantillaMax {
		return problem.Conflict("PLANTILLA_LLENA", "No puedes clausular sin hueco en la alineación.")
	}
	previo := *a.Dueno
	fid := newID()
	if err := gastarTx(ctx, tx, j, fanID, Fantasy, a.Clausula, "clausulazo", "clausulazo-out:"+fid.String(), alias); err != nil {
		return err
	}
	if _, err := acreditarTx(ctx, tx, j, previo, Fantasy, a.Clausula, "clausulazo", "clausulazo-in:"+fid.String(), ""); err != nil {
		return err
	}
	if err := asignarDuenoTx(ctx, tx, salaID, atletaID, &fanID, alias, cfg.ProteccionMin); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, sala_id, atleta_id, de_fan, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,$7,'clausulazo',$8)`,
		fid, cid, j.ID, salaID, atletaID, previo, fanID, a.Clausula); err != nil {
		return err
	}
	if err := eventoFichaje(ctx, tx, cid, j.ID, salaID, atletaID, "clausulazo", a.DuenoAlias, alias, a.Clausula); err != nil {
		return err
	}
	_, err = cambiarClausulaTx(ctx, tx, cid, j.ID, atletaID, float64(cfg.PctDemanda), cfg, "demanda")
	return err
}

// liberarAtletasTx returns to the market of the room every athlete of a fan (he leaves, is expelled, or the room
// closes or is cancelled): he recovers the current value of each one. The caller holds the room FOR UPDATE, so no
// signing of the room runs at the same time; the athlete rows are locked in id order before the wallet.
func liberarAtletasTx(ctx context.Context, tx pgx.Tx, j jornada, salaID, fanID uuid.UUID) error {
	rows, err := tx.Query(ctx, `SELECT fa.atleta_id, fa.clausula FROM fantasy_atletas fa
		JOIN sala_atletas sa ON sa.atleta_id = fa.atleta_id AND sa.sala_id = $2 AND sa.dueno_fan_id = $3
		WHERE fa.jornada_id = $1 ORDER BY fa.atleta_id FOR UPDATE OF fa`, j.ID, salaID, fanID)
	if err != nil {
		return err
	}
	var total int64
	n := 0
	for rows.Next() {
		var id uuid.UUID
		var cl int64
		if err := rows.Scan(&id, &cl); err != nil {
			rows.Close()
			return err
		}
		total += cl
		n++
	}
	rows.Close()
	if err := rows.Err(); err != nil || n == 0 {
		return err
	}
	if _, err := acreditarTx(ctx, tx, j, fanID, Fantasy, total, "liberacion", "liberacion:"+newID().String(), ""); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE sala_atletas SET dueno_fan_id = NULL, dueno_alias = '', protegido_hasta = NULL, updated_at = now()
		WHERE sala_id = $1 AND dueno_fan_id = $2`, salaID, fanID)
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

func contarAlineacionTx(ctx context.Context, tx pgx.Tx, salaID, fanID uuid.UUID) (n int, err error) {
	err = tx.QueryRow(ctx, `SELECT count(*) FROM sala_atletas WHERE sala_id = $1 AND dueno_fan_id = $2`, salaID, fanID).Scan(&n)
	return
}

// eventoFichaje emits the public signing event (aliases are public nicknames, contract §6.6).
func eventoFichaje(ctx context.Context, tx pgx.Tx, cid, jid, salaID, atletaID uuid.UUID, tipo, aliasDe, aliasA string, precio int64) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "fantasy.fichaje",
		map[string]any{"jornadaId": jid.String(), "salaId": salaID.String(), "atletaId": atletaID.String(), "tipo": tipo, "aliasDe": aliasDe, "aliasA": aliasA, "precio": precio},
		events.Competition(cid.String()), events.Audience(events.Public)))
}
