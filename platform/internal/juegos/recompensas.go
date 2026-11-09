// recompensas.go: the rewards of juegos-worker (contract §6.4), idempotent by ledger ref. Porra never receives
// money: only alta, chat milestones and payouts. The donation reward is fantasy only (coins_per_euro of games,
// not the donation's announcement coins) and a refund takes it back up to the current balance.
package juegos

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// datoHito is the payload of chat.hito {fanId, dia, mensajes} (+ alias when the sender included it).
type datoHito struct {
	FanID    uuid.UUID `json:"fanId"`
	Dia      string    `json:"dia"`
	Mensajes int       `json:"mensajes"`
	Alias    string    `json:"alias"`
}

// datoDonacion is the payload of donacion.confirmada {donacionId, fanId, importe, coins, alias, dia}.
type datoDonacion struct {
	DonacionID uuid.UUID `json:"donacionId"`
	FanID      uuid.UUID `json:"fanId"`
	Importe    int64     `json:"importe"` // cents
	Alias      string    `json:"alias"`
	Dia        string    `json:"dia"`
}

func decodificar[D any](e json.RawMessage) (*D, error) {
	var d D
	if err := json.Unmarshal(e, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

// jornadaParaEvento finds the jornada of a reward: the one of the event day when it is playable, else the active
// one of today (Europe/Madrid). nil when there is none: the chat answers that no reward is credited (contract §2).
func (s *Svc) jornadaParaEvento(ctx context.Context, q querier, cid uuid.UUID, dia string) (*jornada, error) {
	sel := func(where string, args ...any) (*jornada, error) {
		j, err := scanJornada(q.QueryRow(ctx, selJornada+" FROM jornadas WHERE "+where, args...))
		if err != nil {
			return nil, err // includes pgx.ErrNoRows
		}
		return &j, nil
	}
	if dia != "" {
		if j, err := sel(`competition_id = $1 AND dia = $2::date AND estado IN ('abierta','en_juego')`, cid, dia); err == nil {
			return j, nil
		}
	}
	j, err := sel(`competition_id = $1 AND estado IN ('abierta','en_juego') AND dia = (now() AT TIME ZONE 'Europe/Madrid')::date`, cid)
	if err != nil {
		return nil, nil // no active jornada: nothing is credited
	}
	return j, nil
}

// recompensaHito credits the chat milestones of one fan (contract §6.4): multiples of 5 (+100 / +10k) and of 10
// (which ADDS to the one of 5: +500 / +50k). At most max_hitos per fan and jornada (anti-abuse, second line
// after the counter of chat). Idempotent by refs hito:<jornada>:<fan>:<N>:<moneda>.
// Only one fan is credited in this transaction (the two coins are two different wallets): no lock order to care
// about (contract §6.3).
func (s *Svc) recompensaHito(ctx context.Context, cid uuid.UUID, raw json.RawMessage) error {
	d, err := decodificar[datoHito](raw)
	if err != nil || d.FanID == uuid.Nil || d.Mensajes <= 0 {
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		j, err := s.jornadaParaEvento(ctx, tx, cid, d.Dia)
		if err != nil || j == nil {
			return err
		}
		cfg, err := configJuegos(ctx, tx, cid)
		if err != nil {
			return err
		}
		var nHitos int
		// One porra movement per milestone event: that count is the exact number of hitos paid.
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM movimientos WHERE jornada_id = $1 AND fan_id = $2 AND motivo = 'hito_chat' AND ref LIKE '%:porra'`, j.ID, d.FanID).Scan(&nHitos); err != nil {
			return err
		}
		if nHitos >= cfg.MaxHitos {
			return nil // top of milestones reached for this fan and jornada
		}
		porra, fantasy := int64(0), int64(0)
		if d.Mensajes%5 == 0 {
			porra += int64(cfg.Hito5Porra)
			fantasy += int64(cfg.Hito5Fantasy)
		}
		if d.Mensajes%10 == 0 {
			porra += int64(cfg.Hito10Porra)
			fantasy += int64(cfg.Hito10Fantasy)
		}
		if porra > 0 {
			if _, err := acreditarTx(ctx, tx, *j, d.FanID, Porra, porra, "hito_chat", "hito:"+j.ID.String()+":"+d.FanID.String()+":"+itoa(d.Mensajes)+":porra", d.Alias); err != nil {
				return err
			}
		}
		if fantasy > 0 {
			if _, err := acreditarTx(ctx, tx, *j, d.FanID, Fantasy, fantasy, "hito_chat", "hito:"+j.ID.String()+":"+d.FanID.String()+":"+itoa(d.Mensajes)+":fantasy", d.Alias); err != nil {
				return err
			}
		}
		return nil
	})
}

// recompensaDonacion credits the fantasy reward of a confirmed donation (contract §6.4): floor(euros) ×
// fantasy_por_euro. The porra never receives money from donations. Ref fantasy:donacion:<id> → one credit only.
func (s *Svc) recompensaDonacion(ctx context.Context, cid uuid.UUID, raw json.RawMessage) error {
	d, err := decodificar[datoDonacion](raw)
	if err != nil || d.FanID == uuid.Nil || d.DonacionID == uuid.Nil || d.Importe <= 0 {
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		j, err := s.jornadaParaEvento(ctx, tx, cid, d.Dia)
		if err != nil || j == nil {
			return err
		}
		cfg, err := configJuegos(ctx, tx, cid)
		if err != nil {
			return err
		}
		importe := d.Importe / 100 * int64(cfg.FantasyPorEuro)
		if importe <= 0 {
			return nil
		}
		_, err = acreditarTx(ctx, tx, *j, d.FanID, Fantasy, importe, "donacion", "fantasy:donacion:"+d.DonacionID.String(), d.Alias)
		return err
	})
}

// reembolsoDonacion withdraws the fantasy reward of a refunded donation (contract §5): as much as the balance
// allows, never below zero; if the wallet cannot pay it all, the rest is left noted in the log. Idempotent by
// ref reembolso:donacion:<id>.
func (s *Svc) reembolsoDonacion(ctx context.Context, cid uuid.UUID, raw json.RawMessage) error {
	d, err := decodificar[datoDonacion](raw)
	if err != nil || d.DonacionID == uuid.Nil {
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		var jid, fan uuid.UUID
		var importe int64
		err := tx.QueryRow(ctx, `SELECT jornada_id, fan_id, importe FROM movimientos WHERE ref = $1`,
			"fantasy:donacion:"+d.DonacionID.String()).Scan(&jid, &fan, &importe)
		if err != nil {
			return nil // never credited (or already withdrawn): nothing to do
		}
		j, err := scanJornada(tx.QueryRow(ctx, selJornada+" FROM jornadas WHERE id = $1", jid))
		if err != nil {
			return err
		}
		return retirarLoQueHaya(ctx, tx, j, fan, Fantasy, importe, "reembolso_donacion", "reembolso:donacion:"+d.DonacionID.String())
	})
}
