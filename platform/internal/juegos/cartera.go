// cartera.go: the wallets (contract §6.1). This module is the ONLY writer of `saldos` and `movimientos`: the porra
// and the fantasy pass their own Moneda here and can never mix coins. Two invariants live in the database:
// `saldo >= 0` (no double spending, no debt) and `movimientos.ref` UNIQUE (idempotent credits, e.g. rewards).
package juegos

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Moneda is one of the two virtual coins. They are separated and non-transferable by design.
type Moneda string

const (
	Porra   Moneda = "porra"
	Fantasy Moneda = "fantasy"
)

// SaldoAlta returns the welcome balance of a wallet (porra 100.000, fantasy 1.000.000; contract §0/§6.1).
func SaldoAlta(m Moneda) int64 {
	if m == Porra {
		return 100_000
	}
	return 1_000_000
}

// jornada is the row of `jornadas` every operation needs.
type jornada struct {
	ID            uuid.UUID `json:"id"`
	CompetitionID uuid.UUID `json:"competitionId"`
	Dia           string    `json:"dia"`
	Nombre        string    `json:"nombre"`
	Estado        string    `json:"estado" enum:"borrador,abierta,en_juego,cerrada"`
	// CierreAt is dia + hora_cierre (Europe/Madrid); nil without a close time.
	CierreAt *time.Time `json:"cierreAt,omitempty"`
}

// selJornada is the column list of jornadas; every caller appends " FROM jornadas …".
const selJornada = `SELECT id, competition_id, dia::text, nombre, estado, (dia + hora_cierre) AT TIME ZONE 'Europe/Madrid'`

func scanJornada(r pgx.Row) (jornada, error) {
	var j jornada
	err := r.Scan(&j.ID, &j.CompetitionID, &j.Dia, &j.Nombre, &j.Estado, &j.CierreAt)
	return j, err
}

// jugable: the jornada accepts bets, signings and rewards.
func (j jornada) jugable() bool { return j.Estado == "abierta" || j.Estado == "en_juego" }

// apuestasCerradas: the close time of the bets (hora_cierre) already passed.
func (j jornada) apuestasCerradas() bool { return j.CierreAt != nil && !time.Now().Before(*j.CierreAt) }

// out is the public view of the jornada.
func (j jornada) out() jornadaOut {
	return jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado, CierreAt: j.CierreAt}
}

// abrirCarteraTx creates the wallet lazily (first visit to the game of that jornada) with its welcome balance,
// idempotently: the `alta` movement has a unique ref, so a retry never credits twice. Returns the current balance.
// It accepts a pool or a transaction (both satisfy querier), so reads can open a wallet too. alias (when not
// empty) names the wallet in the rankings: a fan who only opened the game is listed too, so it cannot wait for
// the first bet.
func abrirCarteraTx(ctx context.Context, q querier, j jornada, fanID uuid.UUID, m Moneda, alias string) (int64, error) {
	var saldo int64
	ins, err := q.Exec(ctx, `INSERT INTO saldos (jornada_id, competition_id, fan_id, moneda, saldo, alias) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
		j.ID, j.CompetitionID, fanID, m, SaldoAlta(m), alias)
	if err != nil {
		return 0, err
	}
	if ins.RowsAffected() == 0 && alias != "" {
		if _, err := q.Exec(ctx, `UPDATE saldos SET alias = $4 WHERE jornada_id = $1 AND fan_id = $2 AND moneda = $3 AND alias IS DISTINCT FROM $4`,
			j.ID, fanID, m, alias); err != nil {
			return 0, err
		}
	}
	if ins.RowsAffected() > 0 {
		if _, err := q.Exec(ctx, `INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref) VALUES ($1,$2,$3,$4,$5,'alta',$6)`,
			newID(), j.ID, fanID, m, SaldoAlta(m), "alta:"+j.ID.String()+":"+fanID.String()+":"+string(m)); err != nil {
			return 0, err
		}
		return SaldoAlta(m), nil
	}
	err = q.QueryRow(ctx, `SELECT saldo FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = $3`, j.ID, fanID, m).Scan(&saldo)
	return saldo, err
}

// gastarTx spends coins atomically (contract §6.1): UPDATE … WHERE saldo >= importe (a concurrent request that
// arrives with not enough coins updates zero rows → 409 SALDO_INSUFICIENTE) plus the ledger row, in one
// transaction. ref makes the movement idempotent. alias (when not empty) refreshes the public nickname of the
// ranking from the fan session.
func gastarTx(ctx context.Context, tx pgx.Tx, j jornada, fanID uuid.UUID, m Moneda, importe int64, motivo, ref, alias string) error {
	if importe <= 0 {
		return problem.BadRequest("IMPORTE_NO_VALIDO", "El importe debe ser positivo.")
	}
	if _, err := abrirCarteraTx(ctx, tx, j, fanID, m, alias); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `UPDATE saldos SET saldo = saldo - $1, version = version + 1, updated_at = now(),
		alias = CASE WHEN $5 <> '' THEN $5 ELSE alias END
		WHERE jornada_id = $2 AND fan_id = $3 AND moneda = $4 AND saldo >= $1`,
		importe, j.ID, fanID, m, alias)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return problem.Conflict("SALDO_INSUFICIENTE", "No tienes monedas suficientes en la cartera.")
	}
	_, err = tx.Exec(ctx, `INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		newID(), j.ID, fanID, m, -importe, motivo, ref)
	return err
}

// acreditarTx credits coins idempotently by ref (rewards, payouts, sales). Returns true when applied; a retry
// (same ref) is a no-op, so an event processed twice never pays twice (contract §6.4). A negative importe
// withdraws coins (it cannot go below zero: the CHECK of saldos would abort the transaction).
func acreditarTx(ctx context.Context, tx pgx.Tx, j jornada, fanID uuid.UUID, m Moneda, importe int64, motivo, ref, alias string) (bool, error) {
	if importe == 0 {
		return false, nil
	}
	if _, err := abrirCarteraTx(ctx, tx, j, fanID, m, alias); err != nil {
		return false, err
	}
	tag, err := tx.Exec(ctx, `INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref) VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (ref) DO NOTHING`,
		newID(), j.ID, fanID, m, importe, motivo, ref)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, nil // already applied by a previous attempt
	}
	_, err = tx.Exec(ctx, `UPDATE saldos SET saldo = saldo + $1, version = version + 1, updated_at = now(),
		alias = CASE WHEN $5 <> '' THEN $5 ELSE alias END WHERE jornada_id = $2 AND fan_id = $3 AND moneda = $4`,
		importe, j.ID, fanID, m, alias)
	return err == nil, err
}

// retirarLoQueHaya withdraws up to importe (never below zero): a refund of a donation takes back the fantasy
// reward when the balance allows it and, if not, leaves the rest noted (contract §5/§6.4). Idempotent by ref,
// like every withdrawal and credit of the ledger. The wallet row is locked FOR UPDATE and the debit is atomic
// (LEAST): the balance cannot change under our feet and the CHECK saldo >= 0 can never abort the transaction.
//
// The pending debt (`pendiente`) is NOT charged automatically: the contract only asks to leave it noted
// (contract §5 «si no, lo deja anotado»), so nothing is deducted from the next credit of the fan. The amount is
// exposed to the fan in GET …/juegos/cartera (`pendienteFantasy`) and to the staff in the admin classifications.
func retirarLoQueHaya(ctx context.Context, tx pgx.Tx, j jornada, fanID uuid.UUID, m Moneda, importe int64, motivo, ref string) error {
	if importe <= 0 {
		return nil
	}
	var saldo int64
	err := tx.QueryRow(ctx, `SELECT saldo FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = $3 FOR UPDATE`, j.ID, fanID, m).Scan(&saldo)
	if db.IsNoRows(err) {
		return nil // never had a wallet: nothing to withdraw
	}
	if err != nil {
		return err
	}
	cuanto := importe
	if saldo < cuanto {
		cuanto = max(saldo, 0)
	}
	// The ledger row first: a repeated refund (same ref) is a no-op. It records what was really withdrawn and, in
	// `pendiente`, what could not be (the balance never goes below zero), so the debt stays noted even when nothing
	// could be withdrawn.
	tag, err := tx.Exec(ctx, `INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref, pendiente) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (ref) DO NOTHING`,
		newID(), j.ID, fanID, m, -cuanto, motivo, ref, importe-cuanto)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 || cuanto == 0 {
		return nil
	}
	// The row is locked, so LEAST(saldo, importe) is exactly `cuanto`: the balance never goes below zero.
	if _, err := tx.Exec(ctx, `UPDATE saldos SET saldo = saldo - LEAST(saldo, $1), version = version + 1, updated_at = now()
		WHERE jornada_id = $2 AND fan_id = $3 AND moneda = $4`, importe, j.ID, fanID, m); err != nil {
		return err
	}
	return nil
}
