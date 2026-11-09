// reglas.go: pure rules of GRS Fantasy and the porra (contract §6.2–6.3, coordinator update: «Pleno 9/9» +5,
// max 3 clausulazos per fan and jornada, fantasy tie-break by squad value → saldo → who arrived first). No
// database here: everything is unit-tested without PostgreSQL.
package juegos

import (
	"math"

	"github.com/google/uuid"
)

// variarClausula applies a percentage variation (may be negative) and clamps it to [min, max], rounding to 1.000
// (contract §6.3). It returns the new clause and the applied delta (new − old, after rounding).
func variarClausula(clausula int64, pct int, min, max int64) (int64, int64) {
	nueva := redondeo1000(clausula + int64(math.Round(float64(clausula)*float64(pct)/100)))
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

// puntosPuestoCat scores the place in the weight class (1.º, 2.º, 3.º, 4.º–5.º, resto que acaba; 0 = sin total).
func puntosPuestoCat(p PuntosCfg, puesto int) int {
	if puesto <= 0 {
		return 0
	}
	if puesto <= 3 {
		return p.Cat[puesto-1]
	}
	if puesto <= 5 {
		return p.Cat[3]
	}
	return p.Cat[4]
}

// puntosPuestoGL scores the IPF GL place within the sex (1.º–3.º, 4.º–10.º, resto 0).
func puntosPuestoGL(p PuntosCfg, puesto int) int {
	if puesto <= 0 {
		return 0
	}
	if puesto <= 3 {
		return p.GL[puesto-1]
	}
	if puesto <= 10 {
		return p.GL[3]
	}
	return 0
}

// puntosPuestoMov scores the place by best lift within the sex (only the podium scores).
func puntosPuestoMov(p PuntosCfg, puesto int) int {
	if puesto >= 1 && puesto <= 3 {
		return p.Mov[puesto-1]
	}
	return 0
}

// puntosIntento scores one judged attempt: valid + puntos.IntentoValido (nothing for null or renunciation).
func puntosIntento(p PuntosCfg, resultado string) int {
	if resultado == "valido" {
		return p.IntentoValido
	}
	return 0
}

// apuestaLote is one bet of a pot for the parimutuel split.
type apuestaLote struct {
	ID       uuid.UUID
	AtletaID uuid.UUID
	FanID    uuid.UUID
	Importe  int64
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
// winners means «no result yet» and never reaches here: liquidarMercadoTx refuses to settle the market.
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
