package cms

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

const nuevoID = `jsonb_build_object('id', gen_random_uuid())`

// clonar copies the reusable content of the previous edition into a new one (Sistema › Nueva edición, Figma 64).
// Legal texts and home sections arrive as drafts; blog posts, albums, media and volunteers are never copied.
func clonar(ctx context.Context, tx pgx.Tx, desde, hacia uuid.UUID, copiar map[string]bool) error {
	type paso struct {
		clave, tabla, cambios string
	}
	pasos := []paso{
		{"legal", "legal", nuevoID + ` || jsonb_build_object('publicado_at', NULL, 'publicado_por', NULL)`},
		{"faq", "faq", nuevoID},
		{"faq", "paginas", nuevoID},
		{"faq", "seo", nuevoID},
		{"faq", "secciones", nuevoID + ` || jsonb_build_object('publicado', NULL, 'publicado_at', NULL)`},
		{"patrocinadores", "patrocinadores", nuevoID},
	}
	for _, p := range pasos {
		if !copiar[p.clave] {
			continue
		}
		if _, err := db.CopiarFilas(ctx, tx, p.tabla, desde, hacia, p.cambios); err != nil {
			return err
		}
	}
	if copiar["faq"] {
		_, err := tx.Exec(ctx, `DELETE FROM paginas WHERE competition_id = $1 AND tipo = 'blog'`, hacia)
		return err
	}
	return nil
}
