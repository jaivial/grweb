// fantasy.go: GRS Fantasy inside a room (BIZ-143): a lineup of exactly 5 athletes (no substitutes), one owner at
// most per athlete and ROOM, instant buys and sales at the current value, clausulazo paying the clause to the
// previous owner (athlete row and both wallets locked in fan_id order, protection window, max 3 per fan and
// jornada, no debt, closed from the last session of the day). fantasy_atletas.clausula is base × grade factor, the
// same for every room; the ownership and the +3 % demand of each signing live in sala_atletas, so the price inside
// a room never depends on what other rooms sign. Lock order everywhere: room → athlete → wallets.
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

// precioSala is the price of an athlete inside a room: the clause of the jornada × the demand of the room, rounded
// to 1.000 (needs the aliases fa = fantasy_atletas and sa = sala_atletas; without a room row the demand is 1).
// shortcut: clausula_max is not applied to the demand, add a LEAST when rooms can reach it (27 signings of one athlete).
const precioSala = `(round(fa.clausula * COALESCE(sa.demanda, 1) / 1000) * 1000)::bigint`

// atletaMercado is one row of the fantasy market (public view).
type atletaMercado struct {
	AtletaID uuid.UUID `json:"atletaId"`
	Nombre   string    `json:"nombre"`
	// FotoURL is the public photo (public profile with image consent, from the live scoreboard); empty otherwise.
	FotoURL   string `json:"fotoUrl,omitempty"`
	Sexo      string `json:"sexo"`
	Categoria string `json:"categoria"`
	Clausula  int64  `json:"clausula"`
	// PrecioVenta is what a sale pays: the clause of the jornada without the demand of the room.
	PrecioVenta int64  `json:"precioVenta"`
	DuenoAlias  string `json:"duenoAlias,omitempty"`
	Protegido   bool   `json:"protegido"`
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
		// live down and no last good scoreboard: the market still lists clauses and owners, without grades or
		// photos (ST3-R2-2), instead of failing the page.
		m = &Marcador{}
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
	rows, err := s.a.DB.Query(ctx, `SELECT fa.atleta_id, fa.nombre_publico, fa.sexo, fa.categoria, `+precioSala+`, fa.clausula, sa.dueno_fan_id, COALESCE(sa.dueno_alias, ''),
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
		if err := rows.Scan(&a.AtletaID, &a.Nombre, &a.Sexo, &a.Categoria, &a.Clausula, &a.PrecioVenta, &dueno, &a.DuenoAlias, &a.Protegido, &a.ProtegidoHasta); err != nil {
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
	Clausula   int64 // price inside the room
	Base       int64 // clause of the jornada (base × grade factor), without the demand of the room
	Publica    bool  // the room shows in the lobby
	Dueno      *uuid.UUID
	DuenoAlias string
	Protegido  *time.Time
}

// bloquearAtletaTx checks that the fan plays in a live room (shared lock on the room: a close or the start of the
// day cannot interleave) and locks the athlete's ownership row inside the room. The athlete row of the jornada is
// not locked at all (ST3-R2-3: 60 rooms signing one star queued on its FOR SHARE/MultiXact): the clause of the
// jornada and the price in the room are read in the same statement that locks the room row, so they are one
// snapshot, and a grade sync committing right after is the same as that sync landing just after the signing.
func bloquearAtletaTx(ctx context.Context, tx pgx.Tx, j jornada, salaID, fanID, atletaID uuid.UUID) (atletaSala, error) {
	var a atletaSala
	var ok bool
	// ST3-R3-1: the three statements go in one round trip (a batch runs in order inside the transaction; any
	// failure below returns an error and the caller rolls back the whole transaction, the insert included).
	b := &pgx.Batch{}
	// ST3-R6-1: the handler reads the jornada from the 1 s cache, so its state is re-checked here, in the same
	// statement that takes the room lock (a jornada closed a moment ago refuses the signing).
	b.Queue(`SELECT EXISTS (SELECT 1 FROM sala_miembros WHERE sala_id = s.id AND fan_id = $2), s.publica
		FROM salas s WHERE s.id = $1 AND s.jornada_id = $3 AND s.estado IN ('abierta', 'en_juego')
		AND EXISTS (SELECT 1 FROM jornadas WHERE id = $3 AND estado IN ('abierta', 'en_juego')) FOR SHARE OF s`, salaID, fanID, j.ID)
	b.Queue(`INSERT INTO sala_atletas (sala_id, jornada_id, atleta_id)
		SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM fantasy_atletas WHERE jornada_id = $2 AND atleta_id = $3) ON CONFLICT DO NOTHING`, salaID, j.ID, atletaID)
	b.Queue(`SELECT `+precioSala+`, fa.clausula, sa.dueno_fan_id, sa.dueno_alias, sa.protegido_hasta FROM sala_atletas sa
		JOIN fantasy_atletas fa ON fa.jornada_id = sa.jornada_id AND fa.atleta_id = sa.atleta_id WHERE sa.sala_id = $1 AND sa.atleta_id = $2 FOR UPDATE OF sa`, salaID, atletaID)
	br := tx.SendBatch(ctx, b)
	defer br.Close()
	err := br.QueryRow().Scan(&ok, &a.Publica)
	if db.IsNoRows(err) || (err == nil && !ok) {
		return a, problem.Conflict("SIN_SALA", "Necesitas estar en una sala abierta o en juego para fichar.")
	}
	if err != nil {
		return a, err
	}
	if _, err := br.Exec(); err != nil {
		return a, err
	}
	err = br.QueryRow().Scan(&a.Clausula, &a.Base, &a.Dueno, &a.DuenoAlias, &a.Protegido)
	if db.IsNoRows(err) {
		return a, problem.NotFound("Ese atleta no está en la jornada.")
	}
	if err != nil {
		return a, err
	}
	return a, br.Close()
}

// asignarDuenoTx changes the owner of an athlete inside the room and raises its demand there by pctDemanda % (the
// +3 % of a signing; 0 for a sale).
func asignarDuenoTx(ctx context.Context, tx pgx.Tx, salaID, atletaID uuid.UUID, dueno *uuid.UUID, alias string, proteccionMin, pctDemanda int) error {
	_, err := tx.Exec(ctx, `UPDATE sala_atletas SET dueno_fan_id = $3, dueno_alias = $4, protegido_hasta = now() + make_interval(mins => $5),
		demanda = round(demanda * (100 + $6::int) / 100, 4), updated_at = now()
		WHERE sala_id = $1 AND atleta_id = $2`, salaID, atletaID, dueno, alias, proteccionMin, pctDemanda)
	return err
}

// comprarTx signs a free athlete of the room for his current value there: wallet spend, ownership, +3 % demand of
// the room, history and events, all in one transaction. The athlete row lock avoids two buyers for the same athlete.
func (s *Svc) comprarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, salaID, fanID uuid.UUID, alias string, atletaID uuid.UUID) error {
	var saldo int64
	return s.comprarSaldoTx(ctx, tx, cid, j, cfg, salaID, fanID, alias, atletaID, &saldo)
}

// comprarSaldoTx is comprarTx that also returns the wallet balance after the spend (no extra read).
func (s *Svc) comprarSaldoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, salaID, fanID uuid.UUID, alias string, atletaID uuid.UUID, saldo *int64) error {
	a, err := bloquearAtletaTx(ctx, tx, j, salaID, fanID, atletaID)
	if err != nil {
		return err
	}
	if a.Dueno != nil {
		if *a.Dueno == fanID {
			return problem.Conflict("YA_ES_TUYO", "Ese atleta ya está en tu alineación.")
		}
		return problem.Conflict("YA_CON_DUENO", "Otro jugador de la sala ya tiene a ese atleta. Puedes pagar su cláusula.")
	}
	if a.Protegido != nil && a.Protegido.After(time.Now()) {
		return problem.Conflict("ATLETA_PROTEGIDO", "El atleta está protegido un rato después de su último fichaje.")
	}
	// The buyer's wallet row serializes his own signings: two concurrent purchases of different athletes cannot
	// both see room in the lineup. ST3-R5-1: open + lock + spend + every write go in ONE round trip. In READ
	// COMMITTED each statement of the batch takes a fresh snapshot, so the lineup count inside the spend runs after
	// the lock is granted and sees what any purchase that held it committed. A refused spend (0 rows) still runs the
	// rest of the batch, but the error rolls the whole transaction back, so nothing of it is committed.
	fid := newID()
	b := &pgx.Batch{}
	queueAltaCartera(b, j, fanID, Fantasy)
	b.Queue(`SELECT fan_id FROM saldos WHERE jornada_id = $1 AND moneda = 'fantasy' AND fan_id = $2 FOR UPDATE`, j.ID, fanID)
	b.Queue(`UPDATE saldos SET saldo = saldo - $1, version = version + 1, updated_at = now(),
		alias = CASE WHEN $4 <> '' THEN $4 ELSE alias END
		WHERE jornada_id = $2 AND fan_id = $3 AND moneda = 'fantasy' AND saldo >= $1
		AND (SELECT count(*) FROM sala_atletas WHERE sala_id = $5 AND dueno_fan_id = $3) < $6 RETURNING saldo`,
		a.Clausula, j.ID, fanID, alias, salaID, cfg.PlantillaMax)
	b.Queue(`INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref) VALUES ($1,$2,$3,'fantasy',$4,'compra',$5)`,
		newID(), j.ID, fanID, -a.Clausula, "compra:"+fid.String())
	b.Queue(`UPDATE sala_atletas SET dueno_fan_id = $3, dueno_alias = $4, protegido_hasta = now() + make_interval(mins => $5),
		demanda = round(demanda * (100 + $6::int) / 100, 4), updated_at = now()
		WHERE sala_id = $1 AND atleta_id = $2`, salaID, atletaID, fanID, alias, cfg.ProteccionMin, cfg.PctDemanda)
	b.Queue(`INSERT INTO fichajes (id, competition_id, jornada_id, sala_id, atleta_id, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,'compra',$7)`,
		fid, cid, j.ID, salaID, atletaID, fanID, a.Clausula)
	if err := events.QueueBatch(b, nuevoEventoFichaje(ctx, cid, j.ID, salaID, a.Publica, atletaID, "compra", "", alias, a.Clausula)); err != nil {
		return err
	}
	sinSaldo := false
	if err := enviarBatch(ctx, tx, b, func(br pgx.BatchResults) error {
		for i := 0; i < 2; i++ {
			if _, err := br.Exec(); err != nil {
				return err
			}
		}
		if err := br.QueryRow().Scan(saldo); db.IsNoRows(err) {
			sinSaldo = true
		} else if err != nil {
			return err
		}
		for i := 0; i < 4; i++ {
			if _, err := br.Exec(); err != nil {
				return err
			}
		}
		return nil
	}); err != nil || !sinSaldo {
		return err
	}
	// refused spend (error path only): tell a full lineup from a short wallet (the batch already set this athlete's
	// owner, uncommitted, so it is left out of the count)
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM sala_atletas WHERE sala_id = $1 AND dueno_fan_id = $2 AND atleta_id <> $3`,
		salaID, fanID, atletaID).Scan(&n); err != nil {
		return err
	} else if n >= cfg.PlantillaMax {
		return problem.Conflict("PLANTILLA_LLENA", "Tu alineación está completa ("+itoa(cfg.PlantillaMax)+" atletas). Vende alguien antes.")
	}
	return problem.Conflict("SALDO_INSUFICIENTE", "No tienes monedas suficientes en la cartera.")
}

// enviarBatch sends b and reads its results with read; the batch is always closed (its error wins when read did
// not fail).
func enviarBatch(ctx context.Context, tx pgx.Tx, b *pgx.Batch, read func(pgx.BatchResults) error) error {
	br := tx.SendBatch(ctx, b)
	if err := read(br); err != nil {
		_ = br.Close()
		return err
	}
	return br.Close()
}

// queueAltaCartera is altaCarteraTx as one statement on a batch: the wallet and its 'alta' movement only when the
// wallet is new (same ref, so it stays idempotent).
func queueAltaCartera(b *pgx.Batch, j jornada, fanID uuid.UUID, m Moneda) {
	b.Queue(`WITH ins AS (INSERT INTO saldos (jornada_id, competition_id, fan_id, moneda, saldo, alias) VALUES ($1,$2,$3,$4,$5,'')
		ON CONFLICT DO NOTHING RETURNING fan_id)
		INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref) SELECT $6, $1, fan_id, $4, $5, 'alta', $7 FROM ins`,
		j.ID, j.CompetitionID, fanID, m, SaldoAlta(m), newID(), "alta:"+j.ID.String()+":"+fanID.String()+":"+string(m))
}

// venderTx returns an athlete to the market of the room. The seller receives the clause of the jornada (base ×
// grade factor) WITHOUT the demand of the room: the +3 % his own signing added is never cashed, so a buy-and-sell
// loop cannot mint coins. Only the grade of the athlete can make a sale worth more than the purchase.
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
	if _, err := acreditarTx(ctx, tx, j, fanID, Fantasy, a.Base, "venta", "venta:"+fid.String(), alias); err != nil {
		return err
	}
	if err := asignarDuenoTx(ctx, tx, salaID, atletaID, nil, "", cfg.ProteccionMin, 0); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, sala_id, atleta_id, de_fan, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,$6,'venta',$7)`,
		fid, cid, j.ID, salaID, atletaID, fanID, a.Base); err != nil {
		return err
	}
	return eventoFichaje(ctx, tx, cid, j.ID, salaID, a.Publica, atletaID, "venta", alias, "", a.Base)
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
	if err := gastarAbiertaTx(ctx, tx, j, fanID, Fantasy, a.Clausula, "clausulazo", "clausulazo-out:"+fid.String(), alias); err != nil {
		return err
	}
	if _, err := acreditarTx(ctx, tx, j, previo, Fantasy, a.Clausula, "clausulazo", "clausulazo-in:"+fid.String(), ""); err != nil {
		return err
	}
	if err := asignarDuenoTx(ctx, tx, salaID, atletaID, &fanID, alias, cfg.ProteccionMin, cfg.PctDemanda); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO fichajes (id, competition_id, jornada_id, sala_id, atleta_id, de_fan, a_fan, tipo, precio) VALUES ($1,$2,$3,$4,$5,$6,$7,'clausulazo',$8)`,
		fid, cid, j.ID, salaID, atletaID, previo, fanID, a.Clausula); err != nil {
		return err
	}
	return eventoFichaje(ctx, tx, cid, j.ID, salaID, a.Publica, atletaID, "clausulazo", a.DuenoAlias, alias, a.Clausula)
}

// liberarAtletasTx returns to the market of the room every athlete of a fan (he leaves, is expelled, or the room
// closes or is cancelled) and undoes his trading there: he gets back exactly what he spent in the room since he sat
// down, minus what he cashed (sales and clausulazos received). Leaving a room can never leave him with more coins
// than before he signed, whatever the prices did. The caller holds the room FOR UPDATE, so no signing of the room
// runs at the same time.
func liberarAtletasTx(ctx context.Context, tx pgx.Tx, j jornada, salaID, fanID uuid.UUID) error {
	if err := bloquearCarterasTx(ctx, tx, j, fanID); err != nil {
		return err
	}
	// compra: a_fan = fan (+). venta: de_fan = a_fan = fan (−). clausulazo: + for the buyer, − for the previous owner.
	var neto int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(CASE WHEN f.tipo <> 'venta' AND f.a_fan = $2 THEN f.precio ELSE -f.precio END), 0)
		FROM fichajes f JOIN sala_miembros m ON m.sala_id = f.sala_id AND m.fan_id = $2
		WHERE f.sala_id = $1 AND (f.a_fan = $2 OR f.de_fan = $2) AND f.created_at >= m.joined_at`, salaID, fanID).Scan(&neto); err != nil {
		return err
	}
	ref := "liberacion:" + newID().String()
	if neto > 0 {
		if _, err := acreditarTx(ctx, tx, j, fanID, Fantasy, neto, "liberacion", ref, ""); err != nil {
			return err
		}
	} else if err := retirarLoQueHaya(ctx, tx, j, fanID, Fantasy, -neto, "liberacion", ref); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE sala_atletas SET dueno_fan_id = NULL, dueno_alias = '', protegido_hasta = NULL, updated_at = now()
		WHERE sala_id = $1 AND dueno_fan_id = $2`, salaID, fanID)
	return err
}

// bloquearCarterasTx opens (lazily) and locks the fantasy wallets of fans in fan_id order. Every operation that
// touches several wallets of one transaction takes them in that same order (the liquidation of the porra sorts its
// payouts by fan_id too): two operations that run at the same time cannot deadlock each other (contract §6.3).
func bloquearCarterasTx(ctx context.Context, tx pgx.Tx, j jornada, fans ...uuid.UUID) error {
	for _, f := range fans {
		if _, err := altaCarteraTx(ctx, tx, j, f, Fantasy, ""); err != nil {
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

// eventoFichaje emits the signing event on the public stream. A room that is not public («solo enlace») only tells
// that something changed (its members refetch): no room id, aliases or price leave the room.
func eventoFichaje(ctx context.Context, tx pgx.Tx, cid, jid, salaID uuid.UUID, publica bool, atletaID uuid.UUID, tipo, aliasDe, aliasA string, precio int64) error {
	return events.Enqueue(ctx, tx, nuevoEventoFichaje(ctx, cid, jid, salaID, publica, atletaID, tipo, aliasDe, aliasA, precio))
}

func nuevoEventoFichaje(ctx context.Context, cid, jid, salaID uuid.UUID, publica bool, atletaID uuid.UUID, tipo, aliasDe, aliasA string, precio int64) events.Event {
	datos := map[string]any{"jornadaId": jid.String(), "salaId": salaID.String(), "atletaId": atletaID.String(), "tipo": tipo, "aliasDe": aliasDe, "aliasA": aliasA, "precio": precio}
	if !publica {
		datos = map[string]any{"jornadaId": jid.String(), "privada": true}
	}
	return events.New(ctx, "fantasy.fichaje", datos, events.Competition(cid.String()), events.Audience(events.Public))
}
