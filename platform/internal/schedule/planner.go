package schedule

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// planFlight is a flight proposed by the generator.
type planFlight struct {
	Dia        string
	Plataforma int
	Inicio     time.Time
	Duracion   int
	Atletas    []uuid.UUID
}

// generar splits the confirmed athletes into flights and places them on the days and platforms:
//
//   - women first, then men (unless separarSexo is off); lighter classes first;
//   - inside a class, by expected total (orden «total») or by surname (orden «categoria»);
//   - groups of at most maxPorFlight, balanced (41 athletes with max 14 → 14 + 14 + 13);
//   - each flight lasts minPorAtleta × athletes (rounded up to 5 min), takes the earliest free platform, skips the
//     lunch break, waits for a free weigh-in table (at most mesasPesaje windows at once) and moves to the next day
//     when it would end after the day's end. Flights that fit nowhere go after
//     the last one (the planner flags them «fuera de horario»).
func generar(cfg Config, loc *time.Location, ats []atleta) []planFlight {
	var grupos [][]atleta
	if cfg.SepararSexo {
		var f, m []atleta
		for _, a := range ats {
			if a.Sexo == "F" {
				f = append(f, a)
			} else {
				m = append(m, a)
			}
		}
		grupos = [][]atleta{f, m}
	} else {
		grupos = [][]atleta{ats}
	}
	var trozos [][]atleta
	for _, g := range grupos {
		if len(g) == 0 {
			continue
		}
		sort.SliceStable(g, func(i, j int) bool {
			a, b := g[i], g[j]
			if !cfg.SepararSexo && a.Sexo != b.Sexo && catKey(a.Categoria) == catKey(b.Categoria) {
				return a.Sexo < b.Sexo
			}
			if ka, kb := catKey(a.Categoria), catKey(b.Categoria); ka != kb {
				return ka < kb
			}
			if cfg.Orden == "total" {
				ta, tb := tot(a), tot(b)
				if ta != tb {
					return ta < tb
				}
			}
			return strings.ToLower(a.Nombre) < strings.ToLower(b.Nombre)
		})
		n := int(math.Ceil(float64(len(g)) / float64(cfg.MaxPorFlight)))
		base, extra := len(g)/n, len(g)%n
		i := 0
		for k := 0; k < n; k++ {
			size := base
			if k < extra {
				size++
			}
			trozos = append(trozos, g[i:i+size])
			i += size
		}
	}
	return colocar(cfg, loc, trozos)
}

func tot(a atleta) float64 {
	if a.TotalPrevisto == nil {
		return 0
	}
	return *a.TotalPrevisto
}

func ceil5(t time.Time) time.Time {
	r := t.Truncate(5 * time.Minute)
	if r.Before(t) {
		r = r.Add(5 * time.Minute)
	}
	return r
}

func colocar(cfg Config, loc *time.Location, trozos [][]atleta) []planFlight {
	dias := cfg.Dias
	if len(dias) == 0 {
		dias = []Dia{{Fecha: time.Now().In(loc).AddDate(0, 0, 7).Format("2006-01-02"), Inicio: "09:00", Fin: "20:00"}}
	}
	d := 0
	libre := make([]time.Time, cfg.Plataformas)
	reset := func() {
		for p := range libre {
			libre[p] = dayTime(dias[d].Fecha, dias[d].Inicio, loc)
		}
	}
	reset()
	var out []planFlight
	type ventana struct{ ini, fin time.Time }
	var pesajes []ventana
	// cabe moves ini forward until the flight skips the break and its weigh-in finds a free table.
	cabe := func(dia Dia, ini time.Time, dur int) time.Time {
		pi, pf := dayTime(dia.Fecha, dia.PausaInicio, loc), dayTime(dia.Fecha, dia.PausaFin, loc)
		for range 50 {
			if !pi.IsZero() && !pf.IsZero() && overlap(ini, ini.Add(time.Duration(dur)*time.Minute), pi, pf) {
				ini = pf
			}
			wi, wf := pesaje(cfg, ini)
			var libreAt []time.Time
			for _, w := range pesajes {
				if overlap(wi, wf, w.ini, w.fin) {
					libreAt = append(libreAt, w.fin)
				}
			}
			if len(libreAt) < cfg.MesasPesaje {
				return ini
			}
			first := libreAt[0]
			for _, x := range libreAt[1:] {
				if x.Before(first) {
					first = x
				}
			}
			ini = ceil5(ini.Add(first.Sub(wi))) // the window opens when the first table frees up
		}
		return ini
	}
	for _, t := range trozos {
		dur := (len(t)*cfg.MinPorAtleta + 4) / 5 * 5
		var ini time.Time
		plat := 0
		for {
			plat = 0
			for p := range libre {
				if libre[p].Before(libre[plat]) {
					plat = p
				}
			}
			dia := dias[d]
			ini = cabe(dia, libre[plat], dur)
			// The earliest platform is the only candidate: if it does not fit today, no other platform does.
			fin := dayTime(dia.Fecha, dia.Fin, loc)
			if fin.IsZero() || !ini.Add(time.Duration(dur)*time.Minute).After(fin) || d == len(dias)-1 {
				break // fits (on the last day it goes anyway and the planner flags it «fuera de horario»)
			}
			d++
			reset()
		}
		ids := make([]uuid.UUID, len(t))
		for i, a := range t {
			ids[i] = a.ID
		}
		out = append(out, planFlight{Dia: dias[d].Fecha, Plataforma: plat + 1, Inicio: ini, Duracion: dur, Atletas: ids})
		wi, wf := pesaje(cfg, ini)
		pesajes = append(pesajes, ventana{wi, wf})
		libre[plat] = ceil5(ini.Add(time.Duration(dur+cfg.DescansoMin) * time.Minute))
	}
	return out
}

// pesaje returns the weigh-in window of a flight: opens pesajeAntesMin before and lasts pesajeDuracionMin
// (never past the start).
func pesaje(cfg Config, inicio time.Time) (time.Time, time.Time) {
	ini := inicio.Add(-time.Duration(cfg.PesajeAntesMin) * time.Minute)
	fin := ini.Add(time.Duration(cfg.PesajeDuracionMin) * time.Minute)
	if fin.After(inicio) {
		fin = inicio
	}
	return ini, fin
}
