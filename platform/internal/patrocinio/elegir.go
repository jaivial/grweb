package patrocinio

import (
	"sort"

	"github.com/google/uuid"
)

// BannerSel is one candidate for the picker of a tic: everything the choice needs, no side effects.
type BannerSel struct {
	ID          uuid.UUID
	Tier        string // oro | plata | bronce
	Orden       int
	Peso        int // weight of its tier (config_patrocinio)
	Apariciones int // appearances today
}

// Estado is the smooth weighted round-robin state: current_weight per banner (kept in Redis per competition and
// día, so the choice is deterministic and fair whichever pod leads).
type Estado = map[uuid.UUID]int

// tierRank orders the tiers: oro > plata > bronce.
func tierRank(t string) int {
	switch t {
	case "oro":
		return 3
	case "plata":
		return 2
	case "bronce":
		return 1
	}
	return 0
}

// menos orders candidates: tier first (oro before plata before bronce), then orden, then id as a deterministic
// tie-break.
func menos(a, b BannerSel) bool {
	if ra, rb := tierRank(a.Tier), tierRank(b.Tier); ra != rb {
		return ra > rb
	}
	if a.Orden != b.Orden {
		return a.Orden < b.Orden
	}
	return a.ID.String() < b.ID.String()
}

// Elegir is the pure banner picker of each tic:
//
//  1. First the banners without any appearance today, by tier and orden: everyone out at least once per día,
//     bronze included.
//  2. When everyone has shown up, smooth weighted round-robin (nginx): each candidate adds its weight to its
//     current weight, the highest wins and subtracts the total; with oro 3 and bronce 1 the oro shows three
//     times per every bronce, in the smoothest possible order.
//
// Returns the chosen banner (uuid.Nil when there is nothing to show) and the new state, pruned to the current
// banners.
func Elegir(banners []BannerSel, estado Estado) (uuid.UUID, Estado) {
	nuevo := make(Estado, len(banners))
	orden := make([]BannerSel, len(banners))
	copy(orden, banners)
	sort.Slice(orden, func(i, j int) bool { return menos(orden[i], orden[j]) })
	for _, b := range orden {
		if w, ok := estado[b.ID]; ok {
			nuevo[b.ID] = w
		}
	}
	if len(orden) == 0 {
		return uuid.Nil, nuevo
	}
	// 1) pendientes del día.
	for _, b := range orden {
		if b.Apariciones == 0 {
			return b.ID, nuevo
		}
	}
	// 2) round-robin ponderado suave.
	total := 0
	for _, b := range orden {
		total += b.Peso
	}
	if total <= 0 {
		return uuid.Nil, nuevo
	}
	elegido, mejor := uuid.Nil, 0
	for i, b := range orden {
		w := nuevo[b.ID] + b.Peso
		nuevo[b.ID] = w
		if i == 0 || w > mejor {
			elegido, mejor = b.ID, w
		}
	}
	nuevo[elegido] -= total
	return elegido, nuevo
}
