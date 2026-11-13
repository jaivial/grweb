package raffle

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// anonimizar removes the buyers of the raffle tickets (Figma 64): amounts and tickets stay.
func anonimizar(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (int64, error) {
	tag, err := tx.Exec(ctx, `UPDATE compras SET nombre = 'Anónimo', email = NULL, telefono = '', consentimientos = '{}', token_hash = '',
		anonimizada_at = now(), updated_at = now() WHERE competition_id = $1 AND anonimizada_at IS NULL`, cid)
	return tag.RowsAffected(), err
}
