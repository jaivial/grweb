// porra.go: the parimutuel betting pool (contract §6.2). Markets are generated from the live scoreboard, bets only
// with porra coins (min and max configurable), automatic close at the first judged attempt and a pot split without
// a house: winners share floor(pot × own bet / total bet on the winners); ties share among the tied; if nobody hit,
// everything comes back.
package juegos

import (
	"bytes"
	"context"
	"math"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// opcionVista is one athlete of a market with its live stake and odds (contract §6.2: bote / apostado_a_ese_atleta).
type opcionVista struct {
	AtletaID uuid.UUID `json:"atletaId"`
	Nombre   string    `json:"nombre"`
	Apostado int64     `json:"apostado"`
	Cuota    float64   `json:"cuota,omitempty"`
}

// mercadoVista is one market with its pot and odds.
type mercadoVista struct {
	ID         uuid.UUID     `json:"id"`
	Tipo       string        `json:"tipo" enum:"categoria,gl,movimiento"`
	Sexo       string        `json:"sexo" enum:"F,M"`
	Categoria  string        `json:"categoria,omitempty"`
	Movimiento string        `json:"movimiento,omitempty" enum:"sq,bp,dl"`
	Titulo     string        `json:"titulo"`
	Estado     string        `json:"estado" enum:"abierto,cerrado,liquidado"`
	Opciones   []opcionVista `json:"opciones"`
	Bote       int64         `json:"bote"`
	Apuestas   int           `json:"apuestas"`
	Ganador    []uuid.UUID   `json:"ganador,omitempty"`
	// Devuelto está a true cuando el mercado se liquidó sin ganador (o lo anuló el staff): el bote volvió a las
	// apuestas y cada una recupera su importe (contract §6.2, caso «sin ganador» y «Anular y devolver»).
	Devuelto bool `json:"devuelto,omitempty"`
}

// mercadosVista lists the markets of a jornada with names, live pot and odds (botes grouped from apuestas).
func (s *Svc) mercadosVista(ctx context.Context, cid uuid.UUID, j *jornada) ([]mercadoVista, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT id, tipo, sexo, categoria, movimiento, titulo, estado, opciones, ganador
		FROM mercados WHERE jornada_id = $1 ORDER BY created_at`, j.ID)
	if err != nil {
		return nil, err
	}
	var ms []mercadoRow
	titulos := map[uuid.UUID]string{}
	ganadores := map[uuid.UUID][]uuid.UUID{}
	for rows.Next() {
		var m mercadoRow
		var t string
		var g []uuid.UUID
		if err := rows.Scan(&m.ID, &m.Tipo, &m.Sexo, &m.Categoria, &m.Movimiento, &t, &m.Estado, &m.Opciones, &g); err != nil {
			rows.Close()
			return nil, err
		}
		ms = append(ms, m)
		titulos[m.ID] = t
		ganadores[m.ID] = g
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ms) == 0 {
		return []mercadoVista{}, nil
	}
	nombres := map[uuid.UUID]string{}
	rows, err = s.a.DB.Query(ctx, `SELECT atleta_id, nombre_publico FROM fantasy_atletas WHERE jornada_id = $1`, j.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var aid uuid.UUID
		var n string
		if err := rows.Scan(&aid, &n); err != nil {
			rows.Close()
			return nil, err
		}
		nombres[aid] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	type botesKey struct {
		mercado, atleta uuid.UUID
	}
	apostado := map[botesKey]int64{}
	nApuestas := map[botesKey]int{}
	rows, err = s.a.DB.Query(ctx, `SELECT mercado_id, atleta_id, sum(importe), count(*) FROM apuestas WHERE jornada_id = $1 GROUP BY mercado_id, atleta_id`, j.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var mercadoID, atletaID uuid.UUID
		var importe int64
		var n int
		if err := rows.Scan(&mercadoID, &atletaID, &importe, &n); err != nil {
			rows.Close()
			return nil, err
		}
		k := botesKey{mercadoID, atletaID}
		apostado[k] = importe
		nApuestas[k] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]mercadoVista, 0, len(ms))
	for _, m := range ms {
		v := mercadoVista{ID: m.ID, Tipo: m.Tipo, Sexo: m.Sexo, Categoria: m.Categoria, Movimiento: m.Movimiento,
			Titulo: titulos[m.ID], Estado: m.Estado, Ganador: ganadores[m.ID], Opciones: []opcionVista{}}
		bote := int64(0)
		for _, a := range m.Opciones {
			bote += apostado[botesKey{m.ID, a}]
		}
		for _, a := range m.Opciones {
			k := botesKey{m.ID, a}
			op := opcionVista{AtletaID: a, Nombre: nombres[a], Apostado: apostado[k]}
			if op.Apostado > 0 && bote > 0 {
				op.Cuota = math.Round(float64(bote)/float64(op.Apostado)*100) / 100
			}
			v.Apuestas += nApuestas[k]
			v.Opciones = append(v.Opciones, op)
		}
		v.Bote = bote
		// Nadie acertó al ganador (o el staff anuló el mercado): el bote volvió a las apuestas (contract §6.2).
		if m.Estado == "liquidado" && v.Apuestas > 0 {
			var aGanadores int64
			for _, g := range ganadores[m.ID] {
				aGanadores += apostado[botesKey{m.ID, g}]
			}
			v.Devuelto = aGanadores == 0
		}
		out = append(out, v)
	}
	return out, nil
}

// generarMercados creates the markets of a jornada from the scoreboard (admin button «Generar mercados»): one
// `categoria` per weight class, one `gl` per sex and one `movimiento` per sex and lift. Idempotent (UNIQUE).
func (s *Svc) generarMercados(ctx context.Context, cid uuid.UUID, j jornada) (int, error) {
	m, err := s.marcador(ctx, cid, j.Dia)
	if err != nil {
		return 0, err
	}
	titulo := map[string]string{"sq": "Sentadilla", "bp": "Press banca", "dl": "Peso muerto"}
	porCat := map[string][]uuid.UUID{}
	porGL := map[string][]uuid.UUID{}
	porMov := map[string][]uuid.UUID{}
	nombres := map[string]string{}
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		kc := ma.Sexo + "|" + ma.Categoria
		porCat[kc] = append(porCat[kc], ma.AtletaID)
		porGL[ma.Sexo] = append(porGL[ma.Sexo], ma.AtletaID)
		for _, mv := range movimientos {
			porMov[ma.Sexo+"|"+mv] = append(porMov[ma.Sexo+"|"+mv], ma.AtletaID)
		}
		nombres[kc] = (map[string]string{"F": "Femenino", "M": "Masculino"})[ma.Sexo] + " " + guion(ma.Categoria) + " kg"
	}
	creados := 0
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		for kc, opts := range porCat {
			sexo, cat, _ := cortar2(kc)
			if insertarMercadoTx(ctx, tx, cid, j.ID, "categoria", sexo, cat, "", nombres[kc], opts) {
				creados++
			}
		}
		for sx, opts := range porGL {
			nombre := (map[string]string{"F": "Femenino", "M": "Masculino"})[sx]
			if insertarMercadoTx(ctx, tx, cid, j.ID, "gl", sx, "", "", "Mejor IPF GL "+nombre, opts) {
				creados++
			}
		}
		for km, opts := range porMov {
			sexo, mv, _ := cortar2(km)
			nombre := (map[string]string{"F": "Femenino", "M": "Masculino"})[sexo]
			if insertarMercadoTx(ctx, tx, cid, j.ID, "movimiento", sexo, "", mv, "Mayor "+titulo[mv]+" "+nombre, opts) {
				creados++
			}
		}
		return nil
	})
	return creados, err
}

func insertarMercadoTx(ctx context.Context, tx pgx.Tx, cid, jid uuid.UUID, tipo, sexo, categoria, movimiento, titulo string, opciones []uuid.UUID) bool {
	_, err := tx.Exec(ctx, `INSERT INTO mercados (id, competition_id, jornada_id, tipo, sexo, categoria, movimiento, titulo, opciones)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (jornada_id, tipo, sexo, categoria, movimiento) DO NOTHING`,
		newID(), cid, jid, tipo, sexo, categoria, movimiento, titulo, opciones)
	return err == nil
}

func guion(cat string) string {
	s := ""
	for i, c := range cat {
		if i == 0 && c == '-' {
			s += "−"
			continue
		}
		s += string(c)
	}
	return s
}

func cortar2(k string) (string, string, bool) {
	for i := 0; i < len(k); i++ {
		if k[i] == '|' {
			return k[:i], k[i+1:], true
		}
	}
	return k, "", false
}

func buscarMercado(mercados []mercadoRow, tipo, sexo, categoria, movimiento string) *mercadoRow {
	for i := range mercados {
		m := &mercados[i]
		if m.Tipo == tipo && m.Sexo == sexo && m.Categoria == categoria && m.Movimiento == movimiento {
			return m
		}
	}
	return nil
}

// cerrarMercadosTx closes open markets at the first judged attempt (contract §6.2): `categoria` and `gl` when any
// of their athletes has a verdict; `movimiento` when any athlete of that sex and lift has one.
func cerrarMercadosTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, m *Marcador, mercados []mercadoRow) error {
	for _, mc := range mercados {
		if mc.Estado != "abierto" || !cerrarMercado(m, mc) {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE mercados SET estado = 'cerrado', cerrado_en = now(), version = version + 1, updated_at = now() WHERE id = $1 AND estado = 'abierto'`, mc.ID); err != nil {
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "porra.mercado",
			map[string]any{"mercadoId": mc.ID.String(), "estado": "cerrado"},
			events.Competition(cid.String()), events.Audience(events.Public))); err != nil {
			return err
		}
	}
	return nil
}

// cerrarMercadoATx closes a market by hand (staff), whatever the scoreboard says: no more bets. Only an open market
// can be closed (409 otherwise).
func cerrarMercadoATx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, mc mercadoRow) error {
	tag, err := tx.Exec(ctx, `UPDATE mercados SET estado = 'cerrado', cerrado_en = now(), version = version + 1, updated_at = now() WHERE id = $1 AND estado = 'abierto'`, mc.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return problem.Conflict("MERCADO_NO_ABIERTO", "El mercado ya está cerrado o liquidado.")
	}
	// audit: who closed it (the public event below carries no actor)
	if err := events.Enqueue(ctx, tx, events.New(ctx, "juegos.porra.cierre_manual",
		map[string]any{"mercadoId": mc.ID.String(), "por": actor(ctx)},
		events.Competition(cid.String()), events.ForPermission("directo.operar"))); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "porra.mercado",
		map[string]any{"mercadoId": mc.ID.String(), "estado": "cerrado"},
		events.Competition(cid.String()), events.Audience(events.Public)))
}

func cerrarMercado(m *Marcador, mc mercadoRow) bool {
	enOpciones := func(aid uuid.UUID) bool {
		for _, x := range mc.Opciones {
			if x == aid {
				return true
			}
		}
		return false
	}
	juzgado := func(ma *MarcadorAtleta, mov string) bool {
		for _, mi := range ma.Intentos[mov] {
			if mi.Resultado != "pendiente" {
				return true
			}
		}
		return false
	}
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		switch mc.Tipo {
		case "categoria":
			if enOpciones(ma.AtletaID) {
				for _, mv := range movimientos {
					if juzgado(ma, mv) {
						return true
					}
				}
			}
		case "gl":
			if ma.Sexo == mc.Sexo {
				for _, mv := range movimientos {
					if juzgado(ma, mv) {
						return true
					}
				}
			}
		case "movimiento":
			if ma.Sexo == mc.Sexo && juzgado(ma, mc.Movimiento) {
				return true
			}
		}
	}
	return false
}

// apostarTx places one bet (fan session): open market, configurable min and max, athlete of the market, porra
// coins with the atomic spend. Everything in one transaction; ref apuesta:<id> keeps the ledger exact.
// The market row is read FOR SHARE: the bet and the close/liquidation of the market are serialized (a bet can
// never slip into a market that is being closed or settled, contract §6.2).
func (s *Svc) apostarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, fanID uuid.UUID, alias string, mercadoID, atletaID uuid.UUID, importe int64) (uuid.UUID, error) {
	var m mercadoRow
	err := tx.QueryRow(ctx, `SELECT id, tipo, sexo, categoria, movimiento, estado, opciones FROM mercados WHERE id = $1 AND jornada_id = $2 FOR SHARE`, mercadoID, j.ID).
		Scan(&m.ID, &m.Tipo, &m.Sexo, &m.Categoria, &m.Movimiento, &m.Estado, &m.Opciones)
	if db.IsNoRows(err) {
		return uuid.Nil, problem.NotFound("Ese mercado no existe.")
	}
	if err != nil {
		return uuid.Nil, err
	}
	if m.Estado != "abierto" {
		return uuid.Nil, problem.Conflict("MERCADO_CERRADO", "El mercado está cerrado: no se aceptan más apuestas.")
	}
	if !j.jugable() {
		return uuid.Nil, problem.Conflict("JORNADA_NO_JUGABLE", "La jornada no está abierta para jugar.")
	}
	if j.apuestasCerradas() {
		return uuid.Nil, problem.Conflict("APUESTAS_CERRADAS", "Las apuestas de esta jornada ya están cerradas.")
	}
	if importe < int64(cfg.PorraMin) || importe > int64(cfg.PorraMax) {
		return uuid.Nil, problem.Unprocessable("IMPORTE_NO_VALIDO", "Cada apuesta va de "+itoa(cfg.PorraMin)+" a "+itoa(cfg.PorraMax)+" monedas.")
	}
	valido := false
	for _, x := range m.Opciones {
		if x == atletaID {
			valido = true
			break
		}
	}
	if !valido {
		return uuid.Nil, problem.Unprocessable("ATLETA_NO_EN_MERCADO", "Ese atleta no participa en este mercado.")
	}
	aid := newID()
	if err := gastarTx(ctx, tx, j, fanID, Porra, importe, "apuesta", "apuesta:"+aid.String(), alias); err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO apuestas (id, competition_id, jornada_id, mercado_id, fan_id, atleta_id, importe) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		aid, cid, j.ID, mercadoID, fanID, atletaID, importe); err != nil {
		return uuid.Nil, err
	}
	return aid, nil
}

// resultadoMercado is what the scoreboard says about a market (contract §6.2). The three cases are different and
// must not be mixed:
//   - definitivo=false: the result is NOT definitive yet (the category is not published, or some category of the
//     sex of a GL/movement market is not published): the market stays closed and its pot is not touched
//     (409 RESULTADO_PENDIENTE in the API).
//   - definitivo=true with winners: the result is definitive and there is a winner (or a tie): the pot is split
//     parimutuel.
//   - definitivo=true without winners: the result is definitive and NOBODY won (nobody finished or nobody has a
//     valid lift): the whole pot comes back to everybody and the market is settled.
//
// `devolver` is the explicit action of the staff (backoffice «Anular y devolver»): the whole pot comes back and
// the market is settled even if the result is not definitive yet. It is audited with an admin event.
type resultadoMercado struct {
	definitivo bool
	ganadores  []uuid.UUID
	devolver   bool
}

// liquidarMercadoTx settles a market with the parimutuel split (contract §6.2). The market row is locked
// FOR UPDATE: a bet that arrives while the market is being settled cannot slip in (contract §6.2). The payouts go
// in fan_id order (like every other operation of the wallet, contract §6.3): two settlements of different
// markets cannot interleave and deadlock. Idempotent by estado and premio refs.
func liquidarMercadoTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, cfg *Config, mc *mercadoRow, res resultadoMercado) error {
	if mc == nil {
		return nil // market not generated: nothing to settle
	}
	if mc.Estado == "liquidado" {
		return nil
	}
	var estadoActual string
	if err := tx.QueryRow(ctx, `SELECT estado FROM mercados WHERE id = $1 FOR UPDATE`, mc.ID).Scan(&estadoActual); err != nil {
		if db.IsNoRows(err) {
			return nil // the market is gone: nothing to settle
		}
		return err
	}
	if estadoActual == "liquidado" {
		return nil
	}
	if !res.definitivo && !res.devolver {
		// The result is not definitive yet: the market stays closed and the pot is not touched.
		return problem.Conflict("RESULTADO_PENDIENTE", "El resultado del mercado todavía no es definitivo: no se puede liquidar.")
	}
	ganadores := res.ganadores
	if res.devolver {
		ganadores = nil // nobody won: the whole pot comes back
	}
	if ganadores == nil {
		ganadores = []uuid.UUID{}
	}
	rows, err := tx.Query(ctx, `SELECT id, atleta_id, fan_id, importe FROM apuestas WHERE mercado_id = $1 ORDER BY fan_id, id`, mc.ID)
	if err != nil {
		return err
	}
	var apuestas []apuestaLote
	for rows.Next() {
		var a apuestaLote
		if err := rows.Scan(&a.ID, &a.AtletaID, &a.FanID, &a.Importe); err != nil {
			rows.Close()
			return err
		}
		apuestas = append(apuestas, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	premios := repartoBote(apuestas, ganadores)
	// The credits of a transaction always take the wallets in fan_id order (contract §6.3): two liquidations that
	// run at the same time (the worker and the backoffice) cannot deadlock each other.
	sort.Slice(premios, func(i, k int) bool {
		a, b := premios[i].FanID, premios[k].FanID
		if a != b {
			return bytes.Compare(a[:], b[:]) < 0 // the same order as `ORDER BY fan_id` of PostgreSQL
		}
		ap, bp := premios[i].ApuestaID, premios[k].ApuestaID
		return bytes.Compare(ap[:], bp[:]) < 0
	})
	for _, p := range premios {
		motivo := "premio_porra"
		if len(ganadores) == 0 {
			motivo = "devolucion"
		}
		if p.Importe <= 0 {
			continue
		}
		if _, err := acreditarTx(ctx, tx, j, p.FanID, Porra, p.Importe, motivo, "premio:"+p.ApuestaID.String(), ""); err != nil {
			return err
		}
	}
	estado := "liquidado"
	if _, err := tx.Exec(ctx, `UPDATE mercados SET estado = $2, ganador = $3, liquidado_at = now(), version = version + 1, updated_at = now()
		WHERE id = $1 AND estado <> 'liquidado'`, mc.ID, estado, ganadores); err != nil {
		return err
	}
	if res.devolver {
		// The staff annulled the market: the audit event says who did it (the actor comes from the request).
		if err := events.Enqueue(ctx, tx, events.New(ctx, "juegos.porra.devolucion",
			map[string]any{"mercadoId": mc.ID.String(), "jornadaId": j.ID.String(), "por": actor(ctx)},
			events.Competition(cid.String()), events.ForPermission("directo.operar"))); err != nil {
			return err
		}
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "porra.mercado",
		map[string]any{"mercadoId": mc.ID.String(), "estado": "liquidado"},
		events.Competition(cid.String()), events.Audience(events.Public)))
}
