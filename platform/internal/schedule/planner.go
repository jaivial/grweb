package schedule

import (
	"sort"
	"time"

	"github.com/google/uuid"
)

// generar assigns the confirmed athletes to the dates: each one to the date of its competition (AEP-2 the first,
// AEP-3 the second; a one-day event or an athlete without competition: the first date), in lot order (women
// first, lighter class, lower expected total). Returns the athletes of each date in order.
func generar(cfg Config, ats []atleta) map[string][]uuid.UUID {
	out := map[string][]uuid.UUID{}
	if len(cfg.Dias) == 0 {
		return out
	}
	por := map[string][]AtletaPlan{}
	for _, a := range ats {
		f := diaDePrueba(cfg.Dias, a.Prueba)
		if f == "" {
			f = cfg.Dias[0].Fecha
		}
		por[f] = append(por[f], toAP(a, 0))
	}
	for f, l := range por {
		sort.SliceStable(l, func(i, j int) bool { return ordenSalida(l[i], l[j]) })
		for _, a := range l {
			out[f] = append(out[f], a.ID)
		}
	}
	return out
}

// pesaje returns the weigh-in window of a day: opens pesajeAntesMin before the start and lasts pesajeDuracionMin
// (never past the start).
func pesaje(cfg Config, inicio time.Time) (time.Time, time.Time) {
	ini := inicio.Add(-time.Duration(cfg.PesajeAntesMin) * time.Minute)
	fin := ini.Add(time.Duration(cfg.PesajeDuracionMin) * time.Minute)
	if fin.After(inicio) {
		fin = inicio
	}
	return ini, fin
}
