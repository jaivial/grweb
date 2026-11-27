package openlifter

// One OpenLifter meet with several competition levels, one per day (GR STRENGTH CUP II: day 1 AEP 2, day 2 AEP 3).
// meets.niveles maps the day to its level; the level of an entry is the level of its day. A desk without niveles
// keeps the level of its key («aep2 · …») on every day, as before.

import (
	"context"
	"errors"
	"sort"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// consultor is a pool or a transaction.
type consultor interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// niveles maps an OpenLifter day (1…lengthDays) to its AEP level.
type niveles map[int]string

func leerNiveles(raw map[string]string) niveles {
	n := niveles{}
	for k, v := range raw {
		if d, err := strconv.Atoi(k); err == nil && d >= 1 && (v == "aep2" || v == "aep3") {
			n[d] = v
		}
	}
	return n
}

// nivelesDe reads the levels by day of a desk's meet (empty: a desk of one level, or none).
func nivelesDe(ctx context.Context, q consultor, cid uuid.UUID, mesa string) (niveles, error) {
	var raw map[string]string
	err := q.QueryRow(ctx, `SELECT niveles FROM meets WHERE competition_id = $1 AND mesa = $2`, cid, mesa).Scan(&raw)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return leerNiveles(raw), nil
}

// de is the level of an entry on that day of the desk ("" when the day has no level).
func (n niveles) de(day int, mesa string) string {
	if len(n) > 0 {
		return n[day]
	}
	return nivelMesa(mesa)
}

// dias are the days of a level in the meet, in order (AEP 2 on 18 and 19 December: 1, 2).
func (n niveles) dias(nivel string) []int {
	var ds []int
	for d, v := range n {
		if v == nivel && nivel != "" {
			ds = append(ds, d)
		}
	}
	sort.Ints(ds)
	return ds
}

// dia is the day of a level in the meet (the lowest one when the level is on several days; 0 when it is not in it).
func (n niveles) dia(nivel string) int {
	if ds := n.dias(nivel); len(ds) > 0 {
		return ds[0]
	}
	return 0
}

// todos are the levels of the desk, in day order and once each (one level for a desk of one level, none for any other).
func (n niveles) todos(mesa string) []string {
	if len(n) == 0 {
		if x := nivelMesa(mesa); x != "" {
			return []string{x}
		}
		return nil
	}
	dias := make([]int, 0, len(n))
	for d := range n {
		dias = append(dias, d)
	}
	sort.Ints(dias)
	out := make([]string, 0, len(dias))
	vistos := map[string]bool{}
	for _, d := range dias {
		if vistos[n[d]] {
			continue
		}
		vistos[n[d]] = true
		out = append(out, n[d])
	}
	return out
}

// noFusionada refuses a desk key that was merged into another meet: a browser that still holds the old meet must
// not recreate it (the desk opens the meet it was merged into after signing in again).
func noFusionada(ctx context.Context, q consultor, cid uuid.UUID, mesa string) error {
	var destino string
	err := q.QueryRow(ctx, `SELECT destino FROM mesas_fusionadas WHERE competition_id = $1 AND mesa = $2`, cid, mesa).Scan(&destino)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return problem.Conflict("MESA_FUSIONADA", "Esta competición de OpenLifter se ha unido a «"+destino+"». Recarga la página para abrirla: no se ha guardado nada en la antigua.")
}

// emparejarPorNivel matches the entries of a meet with several levels: an entry only matches athletes of its
// day's level (or athletes without a level), so an AEP 3 lifter is never linked on the AEP 2 day. An athlete taken
// automatically by one level is not offered to the next.
func emparejarPorNivel(libres []*Entrada, ids []*identidad, fijos map[uuid.UUID]bool, alias map[string]uuid.UUID, niv niveles, mesa string) map[int]emparejado {
	if len(niv) == 0 {
		return emparejar(libres, ids, fijos, alias)
	}
	grupos := map[string][]*Entrada{}
	for _, e := range libres {
		grupos[niv.de(e.Day, mesa)] = append(grupos[niv.de(e.Day, mesa)], e)
	}
	orden := append(niv.todos(mesa), "") // entries on a day without a level match any athlete, last
	tomados := map[uuid.UUID]bool{}
	for id := range fijos {
		tomados[id] = true
	}
	res := map[int]emparejado{}
	vistos := map[string]bool{}
	for _, nivel := range orden {
		if vistos[nivel] || len(grupos[nivel]) == 0 {
			continue
		}
		vistos[nivel] = true
		var candidatos []*identidad
		for _, x := range ids {
			if nivel == "" || x.Prueba == "" || x.Prueba == nivel {
				candidatos = append(candidatos, x)
			}
		}
		fijosG := make(map[uuid.UUID]bool, len(tomados))
		for id := range tomados {
			fijosG[id] = true
		}
		for id, r := range emparejar(grupos[nivel], candidatos, fijosG, alias) {
			res[id] = r
			if r.atleta != nil {
				tomados[*r.atleta] = true
			}
		}
	}
	return res
}
