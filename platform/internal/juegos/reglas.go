// reglas.go: pure rules of the clauses and the porra (contract §6.2–6.3; the 0–10 grade lives in nota.go). No
// database here: everything is unit-tested without PostgreSQL.
package juegos

import (
	"math"

	"github.com/google/uuid"
)

// variarClausula applies a percentage variation (may be negative) and clamps it to [min, max], rounding to 1.000
// (contract §6.3). It returns the new clause and the applied delta (new − old, after rounding).
func variarClausula(clausula int64, pct float64, min, max int64) (int64, int64) {
	nueva := redondeo1000(clausula + int64(math.Round(float64(clausula)*pct/100)))
	if nueva < min {
		nueva = min
	}
	if nueva > max {
		nueva = max
	}
	return nueva, nueva - clausula
}

// redondeo1000 rounds to the nearest 1.000 (contract: «se redondea a 1.000»).
func redondeo1000(v int64) int64 {
	if v < 0 {
		v = 0
	}
	r := v % 1000
	if r >= 500 {
		return v - r + 1000
	}
	return v - r
}

// apuestaLote is one bet of a pot for the parimutuel split.
type apuestaLote struct {
	ID       uuid.UUID
	AtletaID uuid.UUID
	FanID    uuid.UUID
	Importe  int64
}

// categoriasDelSexo returns the weight categories of a sex that the scoreboard brings (contract §6.2): the result of
// the `gl` and `movimiento` markets of a sex depends on all of them being published.
func categoriasDelSexo(m *Marcador, sexo string) []string {
	out := []string{}
	vistas := map[string]bool{}
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		if ma.Sexo != sexo {
			continue
		}
		k := ma.Sexo + ma.Categoria
		if vistas[k] {
			continue
		}
		vistas[k] = true
		out = append(out, k)
	}
	return out
}

// resultadoDefinitivoDeCategorias says whether the result of a market is definitive: there have to be categories in
// play and all of them have to be published (contract §6.2). Without categories the scoreboard is degraded: the
// result is unknown, not definitive, and the market must not be settled (409 RESULTADO_PENDIENTE).
func resultadoDefinitivoDeCategorias(publicadas map[string]bool, categorias []string) bool {
	if len(categorias) == 0 {
		return false
	}
	for _, k := range categorias {
		if !publicadas[k] {
			return false
		}
	}
	return true
}

// tieneAtletasCategoria says whether the scoreboard brings an athlete of a category: without them nobody can have
// won it, so the result of its market is unknown (contract §6.2).
func tieneAtletasCategoria(m *Marcador, sexo, categoria string) bool {
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		if ma.Sexo == sexo && ma.Categoria == categoria {
			return true
		}
	}
	return false
}

// premioBote is the payout of one bet after liquidation.
type premioBote struct {
	ApuestaID uuid.UUID
	FanID     uuid.UUID
	Importe   int64
}

// repartoBote splits the pot parimutuel (contract §6.2): every winner gets floor(pot × own bet / total bet on the
// winners); with several tied winners the pot is shared among the bets of all of them; the rounding remainder is
// ignored. If nobody bet on the winners (the result IS definitive), everything is returned. An empty list of
// winners means that nobody won: the whole pot comes back (the caller decides if the result was definitive).
func repartoBote(apuestas []apuestaLote, ganadores []uuid.UUID) []premioBote {
	ganado := map[uuid.UUID]bool{}
	for _, g := range ganadores {
		ganado[g] = true
	}
	var totalGanador int64
	for _, a := range apuestas {
		if ganado[a.AtletaID] {
			totalGanador += a.Importe
		}
	}
	if totalGanador == 0 {
		// nobody hit: the whole pot comes back
		out := make([]premioBote, 0, len(apuestas))
		for _, a := range apuestas {
			out = append(out, premioBote{ApuestaID: a.ID, FanID: a.FanID, Importe: a.Importe})
		}
		return out
	}
	bote := int64(0)
	for _, a := range apuestas {
		bote += a.Importe
	}
	out := make([]premioBote, 0, len(apuestas))
	for _, a := range apuestas {
		if ganado[a.AtletaID] {
			out = append(out, premioBote{ApuestaID: a.ID, FanID: a.FanID, Importe: bote * a.Importe / totalGanador})
		}
	}
	return out
}
