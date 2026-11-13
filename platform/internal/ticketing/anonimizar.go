package ticketing

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// anonimizar removes the holders of the tickets and the waiting list (Figma 64): sessions, check-ins and totals stay.
func anonimizar(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (int64, error) {
	tag, err := tx.Exec(ctx, `UPDATE entradas SET nombre = 'Anónimo', apellidos = '', email = NULL, telefono = '', consentimientos = '{}', nota = '',
		token_hash = '', updated_at = now() WHERE competition_id = $1 AND (email IS NOT NULL OR nombre <> 'Anónimo')`, cid)
	if err != nil {
		return 0, err
	}
	espera, err := tx.Exec(ctx, `DELETE FROM lista_espera WHERE competition_id = $1`, cid)
	return tag.RowsAffected() + espera.RowsAffected(), err
}
