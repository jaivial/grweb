// sync.go: applies the scoreboard of `live` to the games state (contract §6.4, §6.2 close and liquidation, §6.3
// clauses and points). Everything is idempotent: the worker may replay a scoreboard any number of times. The
// attribution of attempt points is frozen in `intentos_vistos` at the verdict moment; a correction rewrites the
// points without changing the owner.
package juegos

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
)

// intentoVisto is what the worker already applied of one attempt.
type intentoVisto struct {
	Resultado string
	DeltaPct  int
	Dueno     uuid.UUID
	Titular   bool
}

type vistoClave struct {
	Atleta uuid.UUID
	Mov    string
	Num    int
}

// atletaFantasia is the ownership row of one athlete of the jornada.
type atletaFantasia struct {
	AtletaID   uuid.UUID
	Nombre     string
	Sexo       string
	Categoria  string
	Clausula   int64
	Dueno      uuid.UUID
	DuenoAlias string
	Titular    bool
}

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

// sincronizar applies the scoreboard of one jornada: new athletes, judged attempts (clause variation and points),
// bomb-outs, published categories (place points, clause by place and porra liquidation) and the automatic close of
// markets. Emits fantasy.clausula and porra.mercado.
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
		ats, err := cargarFantasyTx(ctx, tx, j.ID)
		if err != nil {
			return err
		}
		vistos, err := cargarVistosTx(ctx, tx, j.ID)
		if err != nil {
			return err
		}
		if err := aplicarIntentosTx(ctx, tx, cid, j, cfg, m, ats, vistos); err != nil {
			return err
		}
		mercados, err := cargarMercadosTx(ctx, tx, j.ID)
		if err != nil {
			return err
		}
		if err := cerrarMercadosTx(ctx, tx, cid, j, m, mercados); err != nil {
			return err
		}
		return aplicarPublicacionesTx(ctx, tx, cid, j, cfg, m, ats, mercados)
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

func cargarFantasyTx(ctx context.Context, tx pgx.Tx, jid uuid.UUID) (map[uuid.UUID]*atletaFantasia, error) {
	rows, err := tx.Query(ctx, `SELECT atleta_id, nombre_publico, sexo, categoria, clausula, dueno_fan_id, dueno_alias, titular
		FROM fantasy_atletas WHERE jornada_id = $1`, jid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]*atletaFantasia{}
	for rows.Next() {
		var a atletaFantasia
		var dueno *uuid.UUID
		if err := rows.Scan(&a.AtletaID, &a.Nombre, &a.Sexo, &a.Categoria, &a.Clausula, &dueno, &a.DuenoAlias, &a.Titular); err != nil {
			return nil, err
		}
		if dueno != nil {
			a.Dueno = *dueno
		}
		out[a.AtletaID] = &a
	}
	return out, rows.Err()
}

func cargarVistosTx(ctx context.Context, tx pgx.Tx, jid uuid.UUID) (map[vistoClave]*intentoVisto, error) {
	rows, err := tx.Query(ctx, `SELECT atleta_id, mov, numero, resultado, delta_pct, dueno_fan_id, titular
		FROM intentos_vistos WHERE jornada_id = $1`, jid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[vistoClave]*intentoVisto{}
	for rows.Next() {
		var k vistoClave
		var v intentoVisto
		var dueno *uuid.UUID
		if err := rows.Scan(&k.Atleta, &k.Mov, &k.Num, &v.Resultado, &v.DeltaPct, &dueno, &v.Titular); err != nil {
			return nil, err
		}
		if dueno != nil {
			v.Dueno = *dueno
		}
		out[k] = &v
	}
	return out, rows.Err()
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

// aplicarIntentosTx diffs the judged attempts of the scoreboard against intentos_vistos (contract §6.3):
// - new verdict: clause ±%, attempt points to the owner titular at that moment, bomb-out and 9/9 bonus;
// - correction (directo.correccion): rewrites the points keeping the owner, reverses and re-applies the clause delta.
func aplicarIntentosTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, m *Marcador,
	ats map[uuid.UUID]*atletaFantasia, vistos map[vistoClave]*intentoVisto) error {

	for _, ma := range m.Atletas {
		for _, mv := range movimientos {
			for _, mi := range ma.Intentos[mv] {
				if mi.Resultado == "pendiente" {
					continue
				}
				k := vistoClave{Atleta: ma.AtletaID, Mov: mv, Num: mi.N}
				if prev, ok := vistos[k]; !ok {
					at := ats[ma.AtletaID]
					if at == nil {
						continue // not a fantasy athlete of this jornada (should not happen)
					}
					pct := 0
					switch mi.Resultado {
					case "valido":
						pct = cfg.PctValido
					case "nulo":
						pct = cfg.PctNulo
					}
					if err := insertarVistoTx(ctx, tx, j.ID, k, mi.Resultado, pct, at); err != nil {
						return err
					}
					vistos[k] = &intentoVisto{Resultado: mi.Resultado, DeltaPct: pct, Dueno: at.Dueno, Titular: at.Titular}
					if pct != 0 {
						if _, err := cambiarClausulaTx(ctx, tx, cid, j.ID, ma.AtletaID, pct, cfg, "intento:"+mv+":"+itoa(mi.N)); err != nil {
							return err
						}
					}
					// Attempt points: to the owner titular at the verdict moment (nothing without an owner).
					if at.Dueno != uuid.Nil && at.Titular && mi.Resultado == "valido" {
						if _, err := tx.Exec(ctx, `INSERT INTO puntos (id, competition_id, jornada_id, fan_id, atleta_id, concepto, puntos, ref)
							VALUES ($1,$2,$3,$4,$5,'intento',$6,$7) ON CONFLICT (ref) DO NOTHING`,
							newID(), cid, j.ID, at.Dueno, ma.AtletaID, puntosIntento(cfg.Puntos, mi.Resultado),
							refPuntoIntento(j.ID, ma.AtletaID, mv, mi.N)); err != nil {
							return err
						}
					}
				} else if prev.Resultado != mi.Resultado {
					// Correction: the owner stays (contract §6.3), the points row is rewritten.
					nuevoPct := 0
					switch mi.Resultado {
					case "valido":
						nuevoPct = cfg.PctValido
					case "nulo":
						nuevoPct = cfg.PctNulo
					}
					if _, err := tx.Exec(ctx, `UPDATE intentos_vistos SET resultado = $3, delta_pct = $4, updated_at = now()
						WHERE jornada_id = $1 AND atleta_id = $2 AND mov = $5 AND numero = $6`,
						j.ID, ma.AtletaID, mi.Resultado, nuevoPct, mv, mi.N); err != nil {
						return err
					}
					if prev.DeltaPct != 0 {
						if _, err := cambiarClausulaTx(ctx, tx, cid, j.ID, ma.AtletaID, -prev.DeltaPct, cfg, "correccion:"+mv+":"+itoa(mi.N)); err != nil {
							return err
						}
					}
					if nuevoPct != 0 {
						if _, err := cambiarClausulaTx(ctx, tx, cid, j.ID, ma.AtletaID, nuevoPct, cfg, "intento:"+mv+":"+itoa(mi.N)); err != nil {
							return err
						}
					}
					vistos[k].Resultado, vistos[k].DeltaPct = mi.Resultado, nuevoPct
					ref := refPuntoIntento(j.ID, ma.AtletaID, mv, mi.N)
					if prev.Dueno != uuid.Nil && prev.Titular {
						if mi.Resultado == "valido" {
							if _, err := tx.Exec(ctx, `UPDATE puntos SET puntos = $3 WHERE jornada_id = $1 AND ref = $2`, j.ID, ref,
								puntosIntento(cfg.Puntos, mi.Resultado)); err != nil {
								return err
							}
						} else if _, err := tx.Exec(ctx, `DELETE FROM puntos WHERE jornada_id = $1 AND ref = $2`, j.ID, ref); err != nil {
							return err
						}
					}
				}
			}
		}
		// Bomb-out (3 nulls in one lift) and 9/9: once, detected with existence checks.
		if at := ats[ma.AtletaID]; at != nil {
			for _, mv := range movimientos {
				if ma.Blanqueo[mv] {
					if err := aplicarBlanqueoTx(ctx, tx, cid, j, cfg, &ma, at, mv); err != nil {
						return err
					}
				}
			}
			if ma.Terminado && plenoDe(&ma) {
				if err := insertarPuntoUnicoTx(ctx, tx, cid, j.ID, at.Dueno, ma.AtletaID, "pleno", cfg.Puntos.Pleno,
					refPuntoPleno(j.ID, ma.AtletaID)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// plenoDe reports nine valid attempts (the «Pleno 9/9» bonus, coordinator update).
func plenoDe(ma *MarcadorAtleta) bool {
	for _, mv := range movimientos {
		for _, mi := range ma.Intentos[mv] {
			if mi.Resultado != "valido" {
				return false
			}
		}
		if len(ma.Intentos[mv]) != 3 {
			return false
		}
	}
	return true
}

// aplicarBlanqueoTx applies the bomb-out once: −30 % clause (historial as marker) and −15 points to the owner
// titular at the detection moment (contract §6.3).
func aplicarBlanqueoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, ma *MarcadorAtleta, at *atletaFantasia, mv string) error {
	motivo := "blanqueo:" + mv
	var ya bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM historial_clausulas WHERE jornada_id = $1 AND atleta_id = $2 AND motivo = $3)`,
		j.ID, ma.AtletaID, motivo).Scan(&ya); err != nil {
		return err
	}
	if !ya {
		if _, err := cambiarClausulaTx(ctx, tx, cid, j.ID, ma.AtletaID, cfg.PctBlanqueo, cfg, motivo); err != nil {
			return err
		}
	}
	if at.Dueno != uuid.Nil && at.Titular {
		return insertarPuntoUnicoTx(ctx, tx, cid, j.ID, at.Dueno, ma.AtletaID, "blanqueo", cfg.Puntos.Blanqueo,
			refPuntoBlanqueo(j.ID, ma.AtletaID, mv))
	}
	return nil
}

func insertarVistoTx(ctx context.Context, tx pgx.Tx, jid uuid.UUID, k vistoClave, resultado string, pct int, at *atletaFantasia) error {
	var dueno any
	if at.Dueno != uuid.Nil {
		dueno = at.Dueno
	}
	_, err := tx.Exec(ctx, `INSERT INTO intentos_vistos (jornada_id, atleta_id, mov, numero, resultado, dueno_fan_id, titular, delta_pct)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (jornada_id, atleta_id, mov, numero) DO NOTHING`,
		jid, k.Atleta, k.Mov, k.Num, resultado, dueno, at.Titular, pct)
	return err
}

// insertarPuntoUnicoTx writes one idempotent point row (no-op when the owner is missing or the ref exists).
func insertarPuntoUnicoTx(ctx context.Context, tx pgx.Tx, cid, jid, fanID, atletaID uuid.UUID, concepto string, puntos int, ref string) error {
	if fanID == uuid.Nil || puntos == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO puntos (id, competition_id, jornada_id, fan_id, atleta_id, concepto, puntos, ref)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (ref) DO NOTHING`,
		newID(), cid, jid, fanID, atletaID, concepto, puntos, ref)
	return err
}

// cambiarClausulaTx moves the clause by a percentage (contract §6.3): updates the athlete, writes the history
// (also used as an idempotency marker) and emits fantasy.clausula. Returns whether it changed.
func cambiarClausulaTx(ctx context.Context, tx pgx.Tx, cid, jid, atletaID uuid.UUID, pct int, cfg *Config, motivo string) (bool, error) {
	if pct == 0 {
		return false, nil
	}
	var actual int64
	if err := tx.QueryRow(ctx, `SELECT clausula FROM fantasy_atletas WHERE jornada_id = $1 AND atleta_id = $2`, jid, atletaID).Scan(&actual); err != nil {
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

// The refs of the points are idempotent keys of `puntos`, whose `ref` is UNIQUE GLOBAL (contract §6.3). The
// jornada is part of every ref: the same athlete lifts in every jornada and the points of one jornada must not
// silence the points of the next one (contract §0 punto 8, jornadas independientes).
func refPuntoIntento(jid, atletaID uuid.UUID, mov string, n int) string {
	return "punto:" + jid.String() + ":intento:" + atletaID.String() + ":" + mov + ":" + itoa(n)
}

func refPuntoPleno(jid, atletaID uuid.UUID) string {
	return "punto:" + jid.String() + ":pleno:" + atletaID.String()
}

func refPuntoBlanqueo(jid, atletaID uuid.UUID, mov string) string {
	return "punto:" + jid.String() + ":blanqueo:" + atletaID.String() + ":" + mov
}

func refPuntoCat(jid, atletaID uuid.UUID) string {
	return "punto:" + jid.String() + ":cat:" + atletaID.String()
}

func refPuntoGL(jid, atletaID uuid.UUID) string {
	return "punto:" + jid.String() + ":gl:" + atletaID.String()
}

func refPuntoMov(jid, atletaID uuid.UUID, mov string) string {
	return "punto:" + jid.String() + ":mov:" + atletaID.String() + ":" + mov
}

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
