package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// CopiarFilas copies the rows of tabla from one competition to another (new edition «clonando la anterior»,
// Figma 64), whatever its columns: each row goes through jsonb with competition_id replaced and the extra
// changes applied (a jsonb SQL expression such as `jsonb_build_object('id', gen_random_uuid())`, or "" for none).
// tabla and cambios are code constants, never user input. Rows that already exist are skipped.
func CopiarFilas(ctx context.Context, tx pgx.Tx, tabla string, desde, hacia uuid.UUID, cambios string) (int64, error) {
	if cambios == "" {
		cambios = `'{}'::jsonb`
	}
	tag, err := tx.Exec(ctx, `INSERT INTO `+tabla+` SELECT (jsonb_populate_record(NULL::`+tabla+`, to_jsonb(x) || jsonb_build_object('competition_id', $2::uuid) || `+cambios+`)).*
		FROM `+tabla+` x WHERE x.competition_id = $1 ON CONFLICT DO NOTHING`, desde, hacia)
	return tag.RowsAffected(), err
}
