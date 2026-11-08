// publicaciones.go: what happens when `live` publishes the results (contract §6.2 liquidation and §6.3 place
// points and clause adjustments). Tracked in `publicaciones`, so a replay never pays twice.
package juegos

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// aplicarPublicacionesTx applies the newly published categories of the scoreboard:
//   - per category: clause +25/+15/+8 % for the podium and the category points (1.º 20 … resto que acaba 2), and the
//     liquidation of the `categoria` market;
//   - per sex, when all its categories are published: GL and movement points and the liquidation of the `gl` and
//     `movimiento` markets.
func aplicarPublicacionesTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, m *Marcador,
	ats map[uuid.UUID]*atletaFantasia, mercados []mercadoRow) error {

	aplicadas, err := cargarPublicacionesTx(ctx, tx, j.ID)
	if err != nil {
		return err
	}
	porSexo := map[string][]string{} // published categories per sex
	for _, k := range m.CategoriasPublicadas {
		porSexo[k[:1]] = append(porSexo[k[:1]], k)
	}

	for _, k := range m.CategoriasPublicadas {
		clave := "cat:" + k
		if aplicadas[clave] {
			continue
		}
		sexo, cat := k[:1], k[1:]
		var ganadores []uuid.UUID
		for i := range m.Atletas {
			ma := &m.Atletas[i]
			if ma.Sexo != sexo || ma.Categoria != cat {
				continue
			}
			if ma.PuestoCategoria == 1 {
				ganadores = append(ganadores, ma.AtletaID)
			}
			if err := puntosPuestoTx(ctx, tx, cid, j, cfg, ma, ats); err != nil {
				return err
			}
			if ma.PuestoCategoria >= 1 && ma.PuestoCategoria <= 3 && ats[ma.AtletaID] != nil {
				if _, err := cambiarClausulaTx(ctx, tx, cid, j.ID, ma.AtletaID, cfg.PctPuesto[ma.PuestoCategoria-1], cfg, "puesto:cat"); err != nil {
					return err
				}
			}
		}
		if err := liquidarMercadoTx(ctx, tx, cid, j, cfg, buscarMercado(mercados, "categoria", sexo, cat, ""), ganadores); err != nil {
			return err
		}
		if err := marcarPublicacionTx(ctx, tx, j.ID, clave); err != nil {
			return err
		}
		aplicadas[clave] = true
	}

	// GL and movement points when every category of the sex is published.
	todas := map[string][]string{} // all categories with athletes per sex (from the scoreboard)
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		k := ma.Sexo + ma.Categoria
		if !contiene(todas[ma.Sexo], k) {
			todas[ma.Sexo] = append(todas[ma.Sexo], k)
		}
	}
	for _, sx := range []string{"F", "M"} {
		clave := "sexo:" + sx
		if aplicadas[clave] || len(todas[sx]) == 0 || len(porSexo[sx]) < len(todas[sx]) {
			continue
		}
		for i := range m.Atletas {
			ma := &m.Atletas[i]
			if ma.Sexo != sx {
				continue
			}
			if err := insertarPuntoUnicoTx(ctx, tx, cid, j.ID, duenoTitular(ats, ma), ma.AtletaID, "gl",
				puntosPuestoGL(cfg.Puntos, ma.PuestoGL), "punto:gl:"+ma.AtletaID.String()); err != nil {
				return err
			}
			for _, mv := range movimientos {
				if err := insertarPuntoUnicoTx(ctx, tx, cid, j.ID, duenoTitular(ats, ma), ma.AtletaID, "mov",
					puntosPuestoMov(cfg.Puntos, ma.PuestoMovimiento[mv]), "punto:mov:"+ma.AtletaID.String()+":"+mv); err != nil {
					return err
				}
			}
		}
		for _, mv := range movimientos {
			var ganadores []uuid.UUID
			for i := range m.Atletas {
				if m.Atletas[i].Sexo == sx && m.Atletas[i].PuestoMovimiento[mv] == 1 {
					ganadores = append(ganadores, m.Atletas[i].AtletaID)
				}
			}
			if err := liquidarMercadoTx(ctx, tx, cid, j, cfg, buscarMercado(mercados, "movimiento", sx, "", mv), ganadores); err != nil {
				return err
			}
		}
		var ganadoresGL []uuid.UUID
		for i := range m.Atletas {
			if m.Atletas[i].Sexo == sx && m.Atletas[i].PuestoGL == 1 {
				ganadoresGL = append(ganadoresGL, m.Atletas[i].AtletaID)
			}
		}
		if err := liquidarMercadoTx(ctx, tx, cid, j, cfg, buscarMercado(mercados, "gl", sx, "", ""), ganadoresGL); err != nil {
			return err
		}
		if err := marcarPublicacionTx(ctx, tx, j.ID, clave); err != nil {
			return err
		}
	}
	return nil
}

// puntosPuestoTx writes the category points of one athlete (owner titular at publication time).
func puntosPuestoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, ma *MarcadorAtleta, ats map[uuid.UUID]*atletaFantasia) error {
	return insertarPuntoUnicoTx(ctx, tx, cid, j.ID, duenoTitular(ats, ma), ma.AtletaID, "cat",
		puntosPuestoCat(cfg.Puntos, ma.PuestoCategoria), "punto:cat:"+ma.AtletaID.String())
}

func duenoTitular(ats map[uuid.UUID]*atletaFantasia, ma *MarcadorAtleta) uuid.UUID {
	if a := ats[ma.AtletaID]; a != nil && a.Dueno != uuid.Nil && a.Titular {
		return a.Dueno
	}
	return uuid.Nil
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

func contiene(l []string, k string) bool {
	for _, x := range l {
		if x == k {
			return true
		}
	}
	return false
}
