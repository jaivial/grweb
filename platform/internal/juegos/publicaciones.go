// publicaciones.go: what happens when `live` publishes the results (contract §6.2 liquidation of the porra).
// Tracked in `publicaciones`, so a replay never pays twice. The fantasy needs nothing here since BIZ-143: the
// place in the category is part of the 0–10 grade (nota.go).
package juegos

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// aplicarPublicacionesTx applies the newly published categories of the scoreboard, per competition (prueba):
//   - per category: the liquidation of the `categoria` markets of that category;
//   - per sex and prueba, when all its categories are published: the liquidation of its `gl` and `movimiento`
//     markets.
//
// A published category is a definitive result: if nobody is at the top (nobody finished or nobody has a valid lift)
// nobody won and the whole pot comes back (contract §6.2). Only a category that is NOT published yet leaves the
// market closed (the result is not definitive).
func (s *Svc) aplicarPublicacionesTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, m *Marcador,
	mercados []mercadoRow) error {

	aplicadas, err := cargarPublicacionesTx(ctx, tx, j.ID)
	if err != nil {
		return err
	}
	publicadas := map[string]bool{} // published categories (sexo + categoría)
	for _, k := range m.CategoriasPublicadas {
		publicadas[k] = true
	}

	for _, mc := range mercados {
		if mc.Tipo != "categoria" || !publicadas[mc.Sexo+mc.Categoria] {
			continue
		}
		clave := "cat:" + mc.Sexo + mc.Categoria + sufijoPublicacion(mc.Prueba)
		if aplicadas[clave] {
			continue
		}
		if !tieneAtletasCategoria(m, mc.Sexo, mc.Categoria) {
			// The scoreboard does not bring the athletes of the category (degraded): nobody can have won it and the
			// result is unknown. The category is retried on the next sync of the worker (contract §6.2).
			continue
		}
		// The category is published: the result is definitive. Without a winner nobody won and the whole pot comes
		// back to everybody (contract §6.2).
		if err := liquidarMercadoTx(ctx, tx, cid, j, cfg, &mc, resultadoMercado{definitivo: true, ganadores: ganadoresDeMercado(m, mc)}); err != nil {
			return err
		}
		if err := marcarPublicacionTx(ctx, tx, j.ID, clave); err != nil {
			return err
		}
		aplicadas[clave] = true
	}

	// GL and movement markets of a sex and prueba when every category of that sex and prueba is published.
	for _, sx := range []string{"F", "M"} {
		for _, p := range pruebasDelSexo(m, sx) {
			clave := "sexo:" + sx + sufijoPublicacion(p)
			// The categories of the sex and prueba that the scoreboard brings: the result of its GL and movement
			// markets is definitive only when all of them are published (contract §6.2).
			cats := categoriasDelSexo(m, sx, p)
			if aplicadas[clave] || len(cats) == 0 {
				continue
			}
			if !resultadoDefinitivoDeCategorias(publicadas, cats) {
				// Some category is not published yet: the result of the GL and movement markets is not definitive.
				// The markets stay closed and the sex is retried on the next sync of the worker.
				s.logResultadoPendente(j, "gl/movimiento", sx+" "+p)
				continue
			}
			for _, mc := range mercados {
				if mc.Sexo != sx || mc.Prueba != p || (mc.Tipo != "gl" && mc.Tipo != "movimiento") {
					continue
				}
				// Every category is published: the result is definitive. Nobody at the top means that nobody won:
				// the whole pot comes back (contract §6.2).
				if err := liquidarMercadoTx(ctx, tx, cid, j, cfg, &mc, resultadoMercado{definitivo: true, ganadores: ganadoresDeMercado(m, mc)}); err != nil {
					return err
				}
			}
			if err := marcarPublicacionTx(ctx, tx, j.ID, clave); err != nil {
				return err
			}
			aplicadas[clave] = true
		}
	}
	return nil
}

// sufijoPublicacion tells the publications of the competitions apart (the keys of the old ones, without prueba, stay).
func sufijoPublicacion(prueba string) string {
	if prueba == "" {
		return ""
	}
	return ":" + prueba
}

// logResultadoPendente warns that a market cannot be settled yet: the result is not definitive, the market stays
// closed and the publication is retried on the next sync of the worker.
func (s *Svc) logResultadoPendente(j jornada, tipo, detalle string) {
	if s.a == nil || s.a.Log == nil {
		return
	}
	s.a.Log.Warn("liquidación pendiente: el resultado del mercado todavía no es definitivo",
		"jornada", j.ID.String(), "tipo", tipo, "detalle", detalle)
}

func cargarPublicacionesTx(ctx context.Context, tx pgx.Tx, jid uuid.UUID) (map[string]bool, error) {
	rows, err := tx.Query(ctx, `SELECT clave FROM publicaciones WHERE jornada_id = $1`, jid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		out[k] = true
	}
	return out, rows.Err()
}

func marcarPublicacionTx(ctx context.Context, tx pgx.Tx, jid uuid.UUID, clave string) error {
	_, err := tx.Exec(ctx, `INSERT INTO publicaciones (jornada_id, clave) VALUES ($1,$2) ON CONFLICT DO NOTHING`, jid, clave)
	return err
}
