// nota.go: the 0–10 grade of an athlete (BIZ-143). Pure functions over the live scoreboard: a jury correction just
// yields another grade on the next sync, so the recalculation is idempotent by construction.
//
//	nota = A + B + C − nulo × nulos, acotada a 0–10
//	A = intentos × válidos ÷ 9 · B = puesto en su categoría · C = pleno 9/9, récord y total (tope 2,0)
//	3 nulos en un mismo movimiento (blanqueo) = 0,0 absoluto.
package juegos

import (
	"math"

	"github.com/google/uuid"
)

// topeBonus caps C (pleno + récord + total).
const topeBonus = 2.0

// notaLinea is one line of the breakdown of a grade («Intentos válidos 6/9 · +3,33»).
type notaLinea struct {
	Concepto string  `json:"concepto" enum:"intentos,puesto,pleno,record_personal,record_competicion,total,nulos,blanqueo"`
	Valor    float64 `json:"valor"`
}

// notaAtleta is the grade of one athlete with its breakdown.
type notaAtleta struct {
	Nota float64 `json:"valor" doc:"0,00–10,00"`
	// TieneNota is false while no attempt of the athlete has been judged: he does not count in the provisional
	// average of a lineup.
	TieneNota bool        `json:"tieneNota"`
	Blanqueo  bool        `json:"blanqueo" doc:"3 nulos en un mismo movimiento: nota 0,0"`
	Validos   int         `json:"validos"`
	Nulos     int         `json:"nulos"`
	Desglose  []notaLinea `json:"desglose"`
}

// notaExtras are the bonuses the scoreboard does not bring yet.
// shortcut: live does not expose personal or competition records per athlete, so both stay false; wire them here
// when the scoreboard brings them.
type notaExtras struct {
	RecordPersonal    bool
	RecordCompeticion bool
}

func redondeo2(v float64) float64 { return math.Round(v*100) / 100 }

// calcularNota grades one athlete of the scoreboard.
func calcularNota(p PuntosCfg, ma *MarcadorAtleta, ex notaExtras) notaAtleta {
	n := notaAtleta{Desglose: []notaLinea{}}
	for _, mv := range movimientos {
		for _, mi := range ma.Intentos[mv] {
			switch mi.Resultado {
			case "valido":
				n.Validos++
			case "nulo":
				n.Nulos++
			}
		}
		if ma.Blanqueo[mv] {
			n.Blanqueo = true
		}
	}
	n.TieneNota = n.Validos+n.Nulos > 0 || n.Blanqueo
	if n.Blanqueo {
		n.Desglose = append(n.Desglose, notaLinea{"blanqueo", 0})
		return n
	}
	if !n.TieneNota {
		return n
	}
	linea := func(concepto string, v float64) float64 {
		if v != 0 {
			n.Desglose = append(n.Desglose, notaLinea{concepto, redondeo2(v)})
		}
		return v
	}
	total := linea("intentos", p.Intentos*float64(n.Validos)/9)
	if ma.PuestoCategoria >= 1 && ma.PuestoCategoria <= len(p.Puesto) {
		total += linea("puesto", p.Puesto[ma.PuestoCategoria-1])
	}
	bonus := 0.0
	sumar := func(concepto string, v float64) {
		if v = math.Min(v, topeBonus-bonus); v > 0 {
			bonus += linea(concepto, v)
		}
	}
	if n.Validos == 9 {
		sumar("pleno", p.Pleno)
	}
	if ex.RecordCompeticion { // replaces the personal record
		sumar("record_competicion", p.RecordCompeticion)
	} else if ex.RecordPersonal {
		sumar("record_personal", p.RecordPersonal)
	}
	if ma.Total != nil && ma.Terminado {
		sumar("total", p.Total)
	}
	total += bonus + linea("nulos", -p.Nulo*float64(n.Nulos))
	n.Nota = redondeo2(math.Max(0, math.Min(10, total)))
	return n
}

// notasDelMarcador grades every athlete of a scoreboard.
func notasDelMarcador(p PuntosCfg, m *Marcador) map[uuid.UUID]notaAtleta {
	out := map[uuid.UUID]notaAtleta{}
	if m == nil {
		return out
	}
	for i := range m.Atletas {
		out[m.Atletas[i].AtletaID] = calcularNota(p, &m.Atletas[i], notaExtras{})
	}
	return out
}

// notaAlineacion is the grade of a lineup: the average of its 5 athletes. Provisional (the day is not over):
// athletes without a judged attempt do not count and an empty slot counts 0. Final: always ÷ 5 (an athlete who
// never lifted, DNS, counts 0).
func notaAlineacion(notas []notaAtleta, huecos int, final bool) (media float64, conNota int) {
	suma := 0.0
	for _, n := range notas {
		if n.TieneNota {
			conNota++
			suma += n.Nota
		}
	}
	div := conNota + huecos
	if final {
		div = len(notas) + huecos
	}
	if div == 0 {
		return 0, conNota
	}
	return redondeo2(suma / float64(div)), conNota
}

// plazasSala is the size of a room: floor(athletes of the day ÷ lineup), at most 10; under 2 no room can exist.
func plazasSala(atletas, alineacion int) (int, bool) {
	if alineacion <= 0 {
		return 0, false
	}
	p := atletas / alineacion
	if p > 10 {
		p = 10
	}
	return p, p >= 2
}
