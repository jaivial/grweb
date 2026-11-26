// mercados_sync.go: the porra markets follow the scoreboard (BIZ-200): the games worker calls this on every
// reload of the marcador (athlete approved, created, edited, withdrawn or deleted; plan republished) and the
// admin endpoint POST C/juegos/mercados/generar reuses the very same sync (idempotent; the script
// scripts/e2e-directo-social.sh still calls it). Everything is a full recompute from the current marcador
// (never deltas), so a replayed or out-of-order event changes nothing. Only ABIERTO markets are touched:
// cerrado and liquidado keep their options, bets and winners.
package juegos

import (
	"context"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// claveMercado is the identity of a market (the UNIQUE of the table).
type claveMercado struct {
	tipo, sexo, categoria, movimiento string
}

// sincronizarMercados syncs the markets of one jornada with the scoreboard of its day. Returns how many markets
// were created. Used by the admin endpoint (any playable jornada) and, inside its transaction, by the worker sync.
func (s *Svc) sincronizarMercados(ctx context.Context, cid uuid.UUID, j jornada) (int, error) {
	m, degradado, err := s.marcador(ctx, cid, j.Dia)
	if err != nil {
		return 0, err
	}
	creados := 0
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		cfg, err := configJuegos(ctx, tx, cid)
		if err != nil {
			return err
		}
		creados, err = sincronizarMercadosTx(ctx, tx, cid, j, cfg, m, degradado)
		if err != nil {
			return err
		}
		// both days are playable from the start: the fantasy market of a day to come is filled in too
		return sincronizarAtletasTx(ctx, tx, cid, j, m, cfg, degradado)
	})
	return creados, err
}

// sincronizarMercadosAbiertas keeps the markets of every open or in-play jornada of the competition in step with
// the marcador of its own day (BIZ-200 R2-3: also the days to come — a future jornada the staff already opened
// has to build its markets before its day arrives). `hoy` is excepted: the full sync of the day already did its
// markets. One broken day must not stop the others: each failure is logged and the first one comes back so the
// worker retries on its next tick.
func (s *Svc) sincronizarMercadosAbiertas(ctx context.Context, cid uuid.UUID, hoy *jornada) error {
	rows, err := s.a.DB.Query(ctx, selJornada+` FROM jornadas
		WHERE competition_id = $1 AND estado IN ('abierta','en_juego') ORDER BY id`, cid)
	if err != nil {
		return err
	}
	var js []jornada
	for rows.Next() {
		j, err := scanJornada(rows)
		if err != nil {
			rows.Close()
			return err
		}
		js = append(js, j)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	var primer error
	for _, j := range js {
		if hoy != nil && j.ID == hoy.ID {
			continue
		}
		if _, err := s.sincronizarMercados(ctx, cid, j); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if primer == nil {
				primer = err
			}
			s.a.Log.Warn("mercados de la jornada", "cid", cid, "jornada", j.ID, "dia", j.Dia, "err", err)
		}
	}
	return primer
}

// mercadosDeseados is the market set the scoreboard implies: one `categoria` per sex and weight class, one `gl`
// per sex and one `movimiento` per sex and lift, with the same titles generarMercados used.
func mercadosDeseados(m *Marcador) (map[claveMercado][]uuid.UUID, map[claveMercado]string) {
	mov := map[string]string{"sq": "Sentadilla", "bp": "Press banca", "dl": "Peso muerto"}
	gl := map[string]string{"F": "Femenino", "M": "Masculino"}
	deseados := map[claveMercado][]uuid.UUID{}
	titulos := map[claveMercado]string{}
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		kc := claveMercado{tipo: "categoria", sexo: ma.Sexo, categoria: ma.Categoria}
		deseados[kc] = append(deseados[kc], ma.AtletaID)
		titulos[kc] = gl[ma.Sexo] + " " + guion(ma.Categoria) + " kg"
		kg := claveMercado{tipo: "gl", sexo: ma.Sexo}
		deseados[kg] = append(deseados[kg], ma.AtletaID)
		titulos[kg] = "Mejor IPF GL " + gl[ma.Sexo]
		for _, mv := range movimientos {
			km := claveMercado{tipo: "movimiento", sexo: ma.Sexo, movimiento: mv}
			deseados[km] = append(deseados[km], ma.AtletaID)
			titulos[km] = "Mayor " + mov[mv] + " " + gl[ma.Sexo]
		}
	}
	return deseados, titulos
}

// sincronizarMercadosTx reconciles the open markets of one jornada with the marcador in one transaction: creates
// the missing ones (with ≥2 athletes), adds and removes options of the open ones, returns the bets of the
// athletes that left, annuls and refunds the ones left with <2 athletes (or whose group vanished), and emits
// `porra.mercado` per changed market. A degraded marcador (live/schedule down, `marcadorStale` serving the last
// good one) can only grow markets: it creates the missing ones and adds athletes, but never removes options nor
// annuls and refunds anything (BIZ-200 R2-5). With an empty marcador and markets already holding options the sync
// does nothing at all. The lock order is stable for a given marcador (the main loop walks the sorted keys, then
// the orphan markets in id order), so two concurrent syncs with the same scoreboard (worker dispatch, reconciler,
// admin endpoint) cannot deadlock each other (BIZ-200 R2-2).
func sincronizarMercadosTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, m *Marcador, degradado bool) (int, error) {
	actuales, err := cargarMercadosTx(ctx, tx, j.ID)
	if err != nil {
		return 0, err
	}
	conOpciones := false
	for _, mc := range actuales {
		if len(mc.Opciones) > 0 {
			conOpciones = true
			break
		}
	}
	if len(m.Atletas) == 0 && conOpciones {
		return 0, nil // marcador vacío o degradado: no se borra ni se anula nada (ST3-R2-2)
	}
	deseados, titulos := mercadosDeseados(m)
	// Stable order: the same market set is always walked the same way, whichever sync gets there first.
	claves := make([]claveMercado, 0, len(deseados))
	for k := range deseados {
		claves = append(claves, k)
	}
	sort.Slice(claves, func(i, k int) bool {
		a, b := claves[i], claves[k]
		if a.tipo != b.tipo {
			return a.tipo < b.tipo
		}
		if a.sexo != b.sexo {
			return a.sexo < b.sexo
		}
		if a.categoria != b.categoria {
			return a.categoria < b.categoria
		}
		return a.movimiento < b.movimiento
	})
	creados := 0
	vistas := map[claveMercado]bool{}
	for _, k := range claves {
		opts := deseados[k]
		vistas[k] = true
		if mc := buscarMercado(actuales, k.tipo, k.sexo, k.categoria, k.movimiento); mc != nil {
			if err := ajustarMercadoTx(ctx, tx, cid, j, cfg, mc, opts, degradado); err != nil {
				return creados, err
			}
			continue
		}
		mc, err := insertarMercadoTx(ctx, tx, cid, j.ID, k, titulos[k], opts)
		if err != nil {
			return creados, err
		}
		if mc == nil {
			continue // someone created it meanwhile (ON CONFLICT): the next sync adjusts its options
		}
		creados++
		if err := encolarCuotasTx(ctx, tx, cid, *mc); err != nil {
			return creados, err
		}
	}
	if degradado {
		return creados, nil // degraded scoreboard: nothing is annulled, nothing is refunded
	}
	// A market whose whole group left the marcador (every athlete deleted, withdrawn or moved away) is annulled
	// with the whole pot back: the same «Anular y devolver» of the staff, without anybody left to bet on. The
	// rows are in id order, the same the locking below takes.
	for _, mc := range actuales {
		k := claveMercado{mc.Tipo, mc.Sexo, mc.Categoria, mc.Movimiento}
		if vistas[k] || mc.Estado != "abierto" {
			continue
		}
		if err := liquidarMercadoTx(ctx, tx, cid, j, cfg, &mc, resultadoMercado{devolver: true}); err != nil {
			return creados, err
		}
	}
	return creados, nil
}

// ajustarMercadoTx brings one open market to the options the marcador says: adds the athletes that arrived and
// removes the ones that left (their bets come back). Left with <2 options it is annulled with everything back.
// Closed or settled markets are never touched. With a degraded scoreboard only additions are applied.
func ajustarMercadoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, mc *mercadoRow, opts []uuid.UUID, degradado bool) error {
	// The row is locked and re-read under the lock: a bet or a hand close may have slipped in since the first
	// read (ST2-R1-8), and two concurrent syncs of the same jornada serialize here, so a refund and its pot
	// decrement can never run twice (BIZ-200 R2-2).
	var estado string
	var actuales []uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT estado, opciones FROM mercados WHERE id = $1 FOR UPDATE`, mc.ID).Scan(&estado, &actuales); err != nil {
		return err
	}
	if estado != "abierto" || mismasOpciones(actuales, opts) {
		return nil
	}
	if degradado {
		return anadirOpcionesTx(ctx, tx, cid, mc, actuales, opts)
	}
	if len(opts) < 2 {
		return liquidarMercadoTx(ctx, tx, cid, j, cfg, mc, resultadoMercado{devolver: true})
	}
	for _, a := range fueraOpciones(actuales, opts) {
		if err := devolverApuestasAtletaTx(ctx, tx, j, mc.ID, a); err != nil {
			return err
		}
	}
	tag, err := tx.Exec(ctx, `UPDATE mercados SET opciones = $2, version = version + 1, updated_at = now() WHERE id = $1 AND estado = 'abierto'`, mc.ID, opts)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil // closed or settled while we held the lock: nothing changed
	}
	nueva := *mc
	nueva.Opciones = opts
	// Live odds for everybody (contract §6.2): new pot and options of the market.
	return encolarCuotasTx(ctx, tx, cid, nueva)
}

// anadirOpcionesTx adds to an open market the athletes of `deseadas` it does not have yet: a degraded scoreboard
// can only grow a market, never remove options or annul it (BIZ-200 R2-5). Emits `porra.mercado` when it changes.
func anadirOpcionesTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, mc *mercadoRow, actuales, deseadas []uuid.UUID) error {
	nuevas := make([]uuid.UUID, 0, len(actuales)+len(deseadas))
	nuevas = append(nuevas, actuales...)
	for _, a := range deseadas {
		en := false
		for _, x := range actuales {
			if x == a {
				en = true
				break
			}
		}
		if !en {
			nuevas = append(nuevas, a)
		}
	}
	if len(nuevas) == len(actuales) {
		return nil
	}
	tag, err := tx.Exec(ctx, `UPDATE mercados SET opciones = $2, version = version + 1, updated_at = now() WHERE id = $1 AND estado = 'abierto'`, mc.ID, nuevas)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil // closed or settled while we held the lock: nothing changed
	}
	nueva := *mc
	nueva.Opciones = nuevas
	return encolarCuotasTx(ctx, tx, cid, nueva)
}

// mismasOpciones says whether two option lists hold the same athletes (order aside).
func mismasOpciones(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	en := map[uuid.UUID]bool{}
	for _, x := range b {
		en[x] = true
	}
	for _, x := range a {
		if !en[x] {
			return false
		}
	}
	return true
}

// fueraOpciones returns the athletes of `actuales` that are not in `deseadas` (they left the market).
func fueraOpciones(actuales, deseadas []uuid.UUID) []uuid.UUID {
	en := map[uuid.UUID]bool{}
	for _, x := range deseadas {
		en[x] = true
	}
	var fuera []uuid.UUID
	for _, x := range actuales {
		if !en[x] {
			fuera = append(fuera, x)
		}
	}
	return fuera
}

// devolverApuestasAtletaTx returns every live bet of one athlete in one market (the athlete left it): the coins
// go back to the fan wallets with motivo `devolucion` and ref `premio:<apuesta>` — the same ref an annulment
// (`liquidarMercadoTx`) uses, so one bet is refunded at most once. The bet row is marked `devuelta_at`: it stops
// counting in the settlement, the pot and «mis apuestas» (which shows it as devuelto). The per-athlete pot
// shrinks only when the refund was really applied (a new wallet movement), never twice and never below zero
// (BIZ-200 R2-1 and R2-2). Bets already refunded (`devuelta_at` set) are skipped at once.
func devolverApuestasAtletaTx(ctx context.Context, tx pgx.Tx, j jornada, mercadoID, atletaID uuid.UUID) error {
	rows, err := tx.Query(ctx, `SELECT id, fan_id, importe FROM apuestas WHERE mercado_id = $1 AND atleta_id = $2 AND devuelta_at IS NULL ORDER BY fan_id, id`, mercadoID, atletaID)
	if err != nil {
		return err
	}
	var as []apuestaLote
	for rows.Next() {
		var a apuestaLote
		if err := rows.Scan(&a.ID, &a.FanID, &a.Importe); err != nil {
			rows.Close()
			return err
		}
		as = append(as, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, a := range as {
		aplicada, err := acreditarTx(ctx, tx, j, a.FanID, Porra, a.Importe, "devolucion", "premio:"+a.ID.String(), "")
		if err != nil {
			return err
		}
		// The wallet movement is idempotent by ref: only when it was really applied (a new movement) does the
		// per-athlete pot shrink, so a concurrent sync cannot decrement `botes` twice.
		if aplicada {
			if _, err := tx.Exec(ctx, `UPDATE botes SET apostado = GREATEST(apostado - $3, 0), n = GREATEST(n - 1, 0)
				WHERE mercado_id = $1 AND atleta_id = $2`, mercadoID, atletaID, a.Importe); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE apuestas SET devuelta_at = now() WHERE id = $1 AND devuelta_at IS NULL`, a.ID); err != nil {
			return err
		}
	}
	return nil
}

// insertarMercadoTx inserts one market idempotently (UNIQUE of the table) and returns it, or nil when it already
// existed. A market of one athlete is a sure bet: it is not created.
func insertarMercadoTx(ctx context.Context, tx pgx.Tx, cid, jid uuid.UUID, k claveMercado, titulo string, opciones []uuid.UUID) (*mercadoRow, error) {
	if len(opciones) < 2 {
		return nil, nil
	}
	id := newID()
	err := tx.QueryRow(ctx, `INSERT INTO mercados (id, competition_id, jornada_id, tipo, sexo, categoria, movimiento, titulo, opciones)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (jornada_id, tipo, sexo, categoria, movimiento) DO NOTHING RETURNING id`,
		id, cid, jid, k.tipo, k.sexo, k.categoria, k.movimiento, titulo, opciones).Scan(&id)
	if db.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &mercadoRow{ID: id, Tipo: k.tipo, Sexo: k.sexo, Categoria: k.categoria, Movimiento: k.movimiento, Estado: "abierto", Opciones: opciones}, nil
}
