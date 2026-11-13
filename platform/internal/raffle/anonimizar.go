package raffle

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// anonimizar removes the people of the raffle (Figma 64): the archived online-sale buyers and the names of the
// winners; prizes, tickets and amounts stay.
func anonimizar(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (int64, error) {
	var n int64
	for _, q := range []string{
		`UPDATE legacy_venta_compras SET nombre = 'Anónimo', email = NULL, telefono = '', consentimientos = '{}', token_hash = '',
			anonimizada_at = now(), updated_at = now() WHERE competition_id = $1 AND anonimizada_at IS NULL`,
		`UPDATE rifa_items SET ganador_nombre = 'Anónimo' WHERE competition_id = $1 AND ganador_nombre IS NOT NULL AND ganador_nombre <> 'Anónimo'`,
		`UPDATE rifa_ganadores_historial SET nombre = 'Anónimo' WHERE competition_id = $1 AND nombre IS NOT NULL AND nombre <> 'Anónimo'`,
	} {
		tag, err := tx.Exec(ctx, q, cid)
		if err != nil {
			return 0, err
		}
		n += tag.RowsAffected()
	}
	return n, nil
}
