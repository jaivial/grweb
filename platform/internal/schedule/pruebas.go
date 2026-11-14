package schedule

import "strings"

// Competitions of the event: AEP-2 runs on the first date, AEP-3 on the second one (the same split the athletes
// service uses for the alta). Extra dates added with «+» have no competition of their own.
var ordenPruebas = []string{"aep2", "aep3"}

func nombrePrueba(p string) string { return strings.ToUpper(strings.Replace(p, "aep", "AEP-", 1)) }

// pruebaDeDia: competition of the i-th date ('' for a one-day event or the dates after the second one).
func pruebaDeDia(ds []Dia, i int) string {
	if len(ds) < len(ordenPruebas) || i >= len(ordenPruebas) {
		return ""
	}
	return ordenPruebas[i]
}

// diaDePrueba: the date of competition p ('' when the event has fewer dates than competitions).
func diaDePrueba(ds []Dia, p string) string {
	for i := range ds {
		if pruebaDeDia(ds, i) == p {
			return ds[i].Fecha
		}
	}
	return ""
}
