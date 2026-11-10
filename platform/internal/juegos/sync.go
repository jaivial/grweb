// sync.go: applies the scoreboard of `live` to the games state (contract §6.4, §6.2 close and liquidation; BIZ-143
// grades and clauses). Everything is idempotent: the worker may replay a scoreboard any number of times.
package juegos

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
)

// mercadoRow is an open porra market.
type mercadoRow struct {
	ID         uuid.UUID
	Tipo       string
	Sexo       string
	Categoria  string
	Movimiento string
	Estado     string
	Opciones   []uuid.UUID
}

// sincronizar applies the scoreboard of one jornada: new athletes, grades (clause variation and bomb-outs),
// published categories (porra liquidation) and the automatic close of markets. Emits fantasy.nota,
// fantasy.clausula and porra.mercado.
func (s *Svc) sincronizar(ctx context.Context, cid uuid.UUID, j jornada) error {
	m, err := s.marcador(ctx, cid, j.Dia)
	if err != nil {
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		cfg, err := configJuegos(ctx, tx, cid)
		if err != nil {
			return err
		}
		if err := subirAtletasTx(ctx, tx, cid, j, m, cfg); err != nil {
			return err
		}
		if err := aplicarNotasTx(ctx, tx, cid, j, cfg, m); err != nil {
			return err
		}
		mercados, err := cargarMercadosTx(ctx, tx, j.ID)
		if err != nil {
			return err
		}
		if err := cerrarMercadosTx(ctx, tx, cid, j, m, mercados); err != nil {
			return err
		}
		return s.aplicarPublicacionesTx(ctx, tx, cid, j, cfg, m, mercados)
	})
}

// subirAtletasTx loads the athletes of the jornada into fantasy_atletas from the scoreboard: new ones start at
// the initial clause; known ones refresh the public name (the privacy rule can change during the day).
func subirAtletasTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, m *Marcador, cfg *Config) error {
	for _, a := range m.Atletas {
		if _, err := tx.Exec(ctx, `INSERT INTO fantasy_atletas (jornada_id, competition_id, atleta_id, nombre_publico, sexo, categoria, clausula)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (jornada_id, atleta_id) DO UPDATE SET nombre_publico = EXCLUDED.nombre_publico, updated_at = now()`,
			j.ID, cid, a.AtletaID, a.NombrePublico, a.Sexo, a.Categoria, cfg.ClausulaInicial); err != nil {
			return err
		}
	}
	return nil
}

func cargarMercadosTx(ctx context.Context, tx pgx.Tx, jid uuid.UUID) ([]mercadoRow, error) {
	rows, err := tx.Query(ctx, `SELECT id, tipo, sexo, categoria, movimiento, estado, opciones FROM mercados WHERE jornada_id = $1 ORDER BY created_at`, jid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []mercadoRow
	for rows.Next() {
		var m mercadoRow
		if err := rows.Scan(&m.ID, &m.Tipo, &m.Sexo, &m.Categoria, &m.Movimiento, &m.Estado, &m.Opciones); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// aplicarNotasTx diffs the grade of every athlete of the scoreboard against the one already applied
// (fantasy_atletas.nota) and moves the clause by pctClausula % per grade point won or lost. A bomb-out sets the
// grade to 0 and takes pct_blanqueo once (the history row is the marker). Emits fantasy.nota. Replaying a
// scoreboard changes nothing; a jury correction is just another diff.
func aplicarNotasTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, m *Marcador) error {
	rows, err := tx.Query(ctx, `SELECT atleta_id, nota::float8 FROM fantasy_atletas WHERE jornada_id = $1`, j.ID)
	if err != nil {
		return err
	}
	aplicadas := map[uuid.UUID]*float64{}
	for rows.Next() {
		var id uuid.UUID
		var n *float64
		if err := rows.Scan(&id, &n); err != nil {
			rows.Close()
			return err
		}
		aplicadas[id] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		previa, existe := aplicadas[ma.AtletaID]
		if !existe {
			continue // not a fantasy athlete of this jornada (should not happen)
		}
		n := calcularNota(cfg.Puntos, ma, notaExtras{})
		if !n.TieneNota {
			continue
		}
		antes := 0.0
		if previa != nil {
			antes = *previa
		}
		if previa != nil && antes == n.Nota && !n.Blanqueo {
			continue
		}
		if n.Blanqueo {
			nuevo := false
			for _, mv := range movimientos {
				if !ma.Blanqueo[mv] {
					continue
				}
				aplicado, err := aplicarBlanqueoTx(ctx, tx, cid, j, cfg, ma.AtletaID, mv)
				if err != nil {
					return err
				}
				nuevo = nuevo || aplicado
			}
			if !nuevo && previa != nil && antes == 0 {
				continue
			}
		} else if _, err := cambiarClausulaTx(ctx, tx, cid, j.ID, ma.AtletaID, cfg.Puntos.PctClausula*(n.Nota-antes), cfg, "nota"); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE fantasy_atletas SET nota = $3, updated_at = now() WHERE jornada_id = $1 AND atleta_id = $2`,
			j.ID, ma.AtletaID, n.Nota); err != nil {
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "fantasy.nota",
			map[string]any{"jornadaId": j.ID.String(), "atletaId": ma.AtletaID.String(), "nota": n.Nota, "delta": redondeo2(n.Nota - antes),
				"validos": n.Validos, "nulos": n.Nulos, "blanqueo": n.Blanqueo},
			events.Competition(cid.String()), events.Audience(events.Public))); err != nil {
			return err
		}
	}
	return nil
}

// aplicarBlanqueoTx applies the clause penalty of a bomb-out once (the history row is the marker). Returns
// whether it was applied now.
func aplicarBlanqueoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, atletaID uuid.UUID, mv string) (bool, error) {
	motivo := "blanqueo:" + mv
	var ya bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM historial_clausulas WHERE jornada_id = $1 AND atleta_id = $2 AND motivo = $3)`,
		j.ID, atletaID, motivo).Scan(&ya); err != nil || ya {
		return false, err
	}
	// The marker must exist even when the clause is already at its minimum (delta 0 writes no history row).
	cambio, err := cambiarClausulaTx(ctx, tx, cid, j.ID, atletaID, float64(cfg.PctBlanqueo), cfg, motivo)
	if err != nil || cambio {
		return err == nil, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO historial_clausulas (id, competition_id, jornada_id, atleta_id, clausula, delta, motivo)
		SELECT $1, $2, $3, $4, clausula, 0, $5 FROM fantasy_atletas WHERE jornada_id = $3 AND atleta_id = $4`, newID(), cid, j.ID, atletaID, motivo)
	return err == nil, err
}

// cambiarClausulaTx moves the clause by a percentage (contract §6.3): updates the athlete, writes the history
// (also used as an idempotency marker) and emits fantasy.clausula. The row is read FOR UPDATE: the read-modify-
// write of the worker cannot overwrite the +3 % of a concurrent signing (the clause is money). Returns whether it
// changed.
func cambiarClausulaTx(ctx context.Context, tx pgx.Tx, cid, jid, atletaID uuid.UUID, pct float64, cfg *Config, motivo string) (bool, error) {
	if pct == 0 {
		return false, nil
	}
	var actual int64
	if err := tx.QueryRow(ctx, `SELECT clausula FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2 FOR UPDATE`, jid, atletaID).Scan(&actual); err != nil {
		return false, err
	}
	nueva, delta := variarClausula(actual, pct, cfg.ClausulaMin, cfg.ClausulaMax)
	if delta == 0 {
		return false, nil
	}
	if _, err := tx.Exec(ctx, `UPDATE fantasy_atletas SET clausula = $3, version = version + 1, updated_at = now()
		WHERE jornada_id = $1 AND atleta_id = $2`, jid, atletaID, nueva); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO historial_clausulas (id, competition_id, jornada_id, atleta_id, clausula, delta, motivo)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, newID(), cid, jid, atletaID, nueva, delta, motivo); err != nil {
		return false, err
	}
	return true, events.Enqueue(ctx, tx, events.New(ctx, "fantasy.clausula",
		map[string]any{"jornadaId": jid.String(), "atletaId": atletaID.String(), "clausula": nueva, "delta": delta},
		events.Competition(cid.String()), events.Audience(events.Public)))
}

var movimientos = []string{"sq", "bp", "dl"}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [8]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
