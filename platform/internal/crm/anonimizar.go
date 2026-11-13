package crm

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// anonimizar empties every contact of the competition (Sistema › Zona peligrosa, Figma 64): counts stay, the
// people do not. Same fields as the right to erasure.
func anonimizar(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (int64, error) {
	if _, err := tx.Exec(ctx, `UPDATE consentimientos k SET ip = '', token_hash = '' FROM contactos c WHERE k.contacto_id = c.id AND c.competition_id = $1`, cid); err != nil {
		return 0, err
	}
	tag, err := tx.Exec(ctx, `UPDATE contactos SET email = NULL, telefono = NULL, nombre = 'Contacto anonimizado', etiquetas = '{}', relacion = '{}',
		anonimizado_at = now(), version = version + 1 WHERE competition_id = $1 AND anonimizado_at IS NULL`, cid)
	return tag.RowsAffected(), err
}
