package openlifter

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"

	"github.com/google/uuid"
)

// Matching an OpenLifter entry with an athlete of the competition.
//
// The athletes fill in their profile themselves, so the same person can be «Mª José García-López», «Maria Jose
// Garcia Lopez», «GARCIA LOPEZ, M. JOSE» or «José García» on the desk. The strategy, strongest first:
//
//  1. a link already confirmed on this desk (sticky, never recalculated);
//  2. exact keys: the federation licence in OpenLifter's MemberID, an email written in the Notes, the Instagram
//     handle, or a name the organiser already confirmed for this competition (alias);
//  3. fuzzy name: accents, case, punctuation and particles («de», «del», «la», «y») removed, common abbreviations
//     expanded (Mª, Fco., Fdez.…), tokens compared in any order (surnames first or last), typos tolerated
//     (Jaro-Winkler), initials and missing second surnames accepted;
//  4. the other facts as evidence: sex (a mismatch almost discards), birth date, weight class and club.
//
// A link is automatic only when the score is high and clearly ahead of the next candidate; otherwise the desk sees
// the candidates and confirms one. Each athlete is linked to one entry at most (best scores first).

const (
	umbralAuto     = 0.90 // automatic link
	margenAuto     = 0.08 // ahead of the entry's second candidate
	umbralSugerido = 0.60 // shown as a candidate to confirm
)

var particulas = map[string]bool{"de": true, "del": true, "la": true, "las": true, "los": true, "y": true, "i": true, "e": true,
	"da": true, "das": true, "do": true, "dos": true, "van": true, "von": true, "der": true, "den": true, "du": true, "le": true, "el": true, "di": true}

var abreviaturas = map[string]string{"ma": "maria", "mari": "maria", "fco": "francisco", "fdez": "fernandez", "fdz": "fernandez", "glez": "gonzalez",
	"gzlez": "gonzalez", "gonzales": "gonzalez", "rguez": "rodriguez", "rodz": "rodriguez", "mtnez": "martinez", "mtz": "martinez", "hdez": "hernandez",
	"hndz": "hernandez", "jgo": "jorge", "ant": "antonio", "anto": "antonio", "jav": "javier", "alej": "alejandro"}

// plano lowercases and removes accents and anything that is not a letter or a digit (ñ → n, ç → c, l·l → ll).
func plano(s string) string {
	var b strings.Builder
	for _, r := range norm.NFKD.String(strings.ToLower(s)) {
		switch {
		case unicode.Is(unicode.Mn, r):
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == 'ß':
			b.WriteString("ss")
		case r == '·' || r == '\'' || r == '’':
		default:
			b.WriteByte(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

// tokens of a name: plain words, abbreviations expanded, particles removed, no repeats.
func tokens(nombre string) []string {
	var out []string
	vistos := map[string]bool{}
	for _, w := range strings.Fields(plano(nombre)) {
		if x, ok := abreviaturas[w]; ok {
			w = x
		}
		if particulas[w] || vistos[w] {
			continue
		}
		vistos[w] = true
		out = append(out, w)
	}
	return out
}

// clave is the order-free key of a name (alias of a confirmed link).
func clave(nombre string) string {
	t := tokens(nombre)
	sort.Strings(t)
	return strings.Join(t, " ")
}

func jaroWinkler(a, b string) float64 {
	if a == b {
		return 1
	}
	ra, rb := []rune(a), []rune(b)
	la, lb := len(ra), len(rb)
	if la == 0 || lb == 0 {
		return 0
	}
	win := max(la, lb)/2 - 1
	if win < 0 {
		win = 0
	}
	ma, mb := make([]bool, la), make([]bool, lb)
	m := 0
	for i := range ra {
		for j := max(0, i-win); j < min(lb, i+win+1); j++ {
			if !mb[j] && ra[i] == rb[j] {
				ma[i], mb[j] = true, true
				m++
				break
			}
		}
	}
	if m == 0 {
		return 0
	}
	t, k := 0, 0
	for i := range ra {
		if ma[i] {
			for !mb[k] {
				k++
			}
			if ra[i] != rb[k] {
				t++
			}
			k++
		}
	}
	fm := float64(m)
	j := (fm/float64(la) + fm/float64(lb) + (fm-float64(t)/2)/fm) / 3
	p := 0
	for p < min(4, la, lb) && ra[p] == rb[p] {
		p++
	}
	return j + float64(p)*0.1*(1-j)
}

// simToken compares two name words: equal, typo, shortened form or initial.
func simToken(a, b string) float64 {
	switch {
	case a == b:
		return 1
	case len(a) == 1 || len(b) == 1:
		if a[0] == b[0] {
			return 0.6 // initial: «M.» for «María»
		}
		return 0
	case min(len(a), len(b)) >= 4 && (strings.HasPrefix(a, b) || strings.HasPrefix(b, a)):
		return 0.85 // «Javi» / «Javier»
	}
	if min(len(a), len(b)) >= 4 {
		if j := jaroWinkler(a, b); j >= 0.92 {
			return j
		}
	}
	return 0
}

// simNombre scores two names in [0,1] and returns how many words matched well.
func simNombre(a, b []string) (float64, int) {
	if len(a) == 0 || len(b) == 0 {
		return 0, 0
	}
	// «Juancarlos» / «Juan Carlos»: the same letters without spaces in either order of the words.
	ja, jb := strings.Join(a, ""), strings.Join(b, "")
	sa, sb := append([]string(nil), a...), append([]string(nil), b...)
	sort.Strings(sa)
	sort.Strings(sb)
	if ja == jb || strings.Join(sa, "") == strings.Join(sb, "") {
		return 1, max(len(a), len(b))
	}
	type par struct {
		i, j int
		s    float64
	}
	var pares []par
	for i, x := range a {
		for j, y := range b {
			if s := simToken(x, y); s > 0 {
				pares = append(pares, par{i, j, s})
			}
		}
	}
	sort.Slice(pares, func(x, y int) bool { return pares[x].s > pares[y].s })
	ua, ub := map[int]bool{}, map[int]bool{}
	var suma float64
	buenos := 0
	for _, p := range pares {
		if ua[p.i] || ub[p.j] {
			continue
		}
		ua[p.i], ub[p.j] = true, true
		suma += p.s
		if p.s >= 0.85 {
			buenos++
		}
	}
	nmin, nmax := float64(min(len(a), len(b))), float64(max(len(a), len(b)))
	s := 0.75*suma/nmin + 0.25*suma/nmax
	if buenos < 2 && nmin >= 2 {
		s = min(s, 0.55) // one shared word («María») is not the same person
	}
	if nmin == 1 && nmax > 1 {
		s = min(s, 0.7) // a single word against a full name: at most a suggestion
	}
	return s, buenos
}

// Entrada is an OpenLifter entry (the fields of OpenLifter's Entry the platform uses).
type Entrada struct {
	ID                    int       `json:"id" minimum:"0"`
	Day                   int       `json:"day"`
	Platform              int       `json:"platform"`
	Flight                string    `json:"flight" maxLength:"2"`
	Name                  string    `json:"name" maxLength:"200"`
	Sex                   string    `json:"sex" maxLength:"2"`
	BirthDate             string    `json:"birthDate" maxLength:"10"`
	IntendedWeightClassKg string    `json:"intendedWeightClassKg" maxLength:"10"`
	Divisions             []string  `json:"divisions,omitempty" maxItems:"20"`
	Lot                   int       `json:"lot"`
	MemberID              string    `json:"memberId" maxLength:"64"`
	Team                  string    `json:"team" maxLength:"200"`
	Instagram             string    `json:"instagram,omitempty" maxLength:"100"`
	Notes                 string    `json:"notes" maxLength:"2000"`
	BodyweightKg          float64   `json:"bodyweightKg"`
	SquatRackInfo         string    `json:"squatRackInfo" maxLength:"40"`
	BenchRackInfo         string    `json:"benchRackInfo" maxLength:"40"`
	SquatKg               []float64 `json:"squatKg" maxItems:"5"`
	BenchKg               []float64 `json:"benchKg" maxItems:"5"`
	DeadliftKg            []float64 `json:"deadliftKg" maxItems:"5"`
	SquatStatus           []int     `json:"squatStatus" maxItems:"5"`
	BenchStatus           []int     `json:"benchStatus" maxItems:"5"`
	DeadliftStatus        []int     `json:"deadliftStatus" maxItems:"5"`
}

// identidad is an athlete as athletes reports it (internal, personal data).
type identidad struct {
	ID              uuid.UUID `json:"id"`
	Nombre          string    `json:"nombre"`
	Apellidos       string    `json:"apellidos"`
	Email           string    `json:"email"`
	Licencia        string    `json:"licencia"`
	Sexo            string    `json:"sexo"`
	FechaNacimiento string    `json:"fechaNacimiento"`
	Categoria       string    `json:"categoria"`
	Division        string    `json:"division"`
	Club            string    `json:"club"`
	Instagram       string    `json:"instagram"`
	Flight          string    `json:"flight"`
	Plataforma      *int      `json:"plataforma"`
	PesoCorporal    *float64  `json:"pesoCorporal"`
	Primeros        struct {
		SQ *float64 `json:"sq"`
		BP *float64 `json:"bp"`
		DL *float64 `json:"dl"`
	} `json:"primeros"`
	RackSQ *int   `json:"rackSq"`
	RackBP string `json:"rackBp"`

	toks []string
}

func (x *identidad) nombreCompleto() string { return strings.TrimSpace(x.Nombre + " " + x.Apellidos) }

// Candidato is a possible athlete for an entry.
type Candidato struct {
	AtletaID   uuid.UUID `json:"atletaId"`
	Nombre     string    `json:"nombre"`
	Categoria  string    `json:"categoria"`
	Club       string    `json:"club,omitempty"`
	Puntuacion float64   `json:"puntuacion" doc:"0–1"`
	Motivos    []string  `json:"motivos"`
	exacto     bool
}

var reEmail = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)

func alfanum(s string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func handle(s string) string { return strings.TrimPrefix(strings.ToLower(strings.TrimSpace(s)), "@") }

// clase normalises a weight class: «-83», «83», «83 kg» → «83»; «+120», «120+» → «120+».
func clase(s string) string {
	s = strings.ReplaceAll(strings.ToLower(strings.TrimSpace(s)), "kg", "")
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "+") || strings.HasSuffix(s, "+") {
		return strings.Trim(s, "+ ") + "+"
	}
	return strings.Trim(s, "- ")
}

// puntuar scores an entry against an athlete. alias: athlete confirmed before for the same name key.
func puntuar(e *Entrada, eToks []string, x *identidad, alias uuid.UUID) Candidato {
	c := Candidato{AtletaID: x.ID, Nombre: x.nombreCompleto(), Categoria: x.Categoria, Club: x.Club}
	sexoDistinto := (e.Sex == "M" || e.Sex == "F") && e.Sex != x.Sexo
	exacto := func(motivo string) Candidato {
		c.Puntuacion, c.Motivos, c.exacto = 1, []string{motivo}, true
		if sexoDistinto {
			c.Puntuacion, c.exacto = 0.7, false
			c.Motivos = append(c.Motivos, "Sexo distinto")
		}
		return c
	}
	if m := alfanum(e.MemberID); m != "" && m == alfanum(x.Licencia) {
		return exacto("Licencia")
	}
	if x.Email != "" {
		for _, m := range reEmail.FindAllString(e.Notes, 3) {
			if strings.EqualFold(m, x.Email) {
				return exacto("Email")
			}
		}
	}
	if alias == x.ID {
		return exacto("Confirmado antes con este nombre")
	}
	s, _ := simNombre(eToks, x.toks)
	c.Motivos = append(c.Motivos, fmt.Sprintf("Nombre %d %%", int(s*100+0.5)))
	if h := handle(e.Instagram); h != "" && h == handle(x.Instagram) {
		s = max(s, 0.97)
		c.Motivos = append(c.Motivos, "Instagram")
	}
	switch {
	case e.BirthDate == "" || x.FechaNacimiento == "":
	case e.BirthDate == x.FechaNacimiento:
		s += 0.12
		c.Motivos = append(c.Motivos, "Fecha de nacimiento")
	case len(e.BirthDate) == 10 && e.BirthDate[:4] == x.FechaNacimiento[:4] && e.BirthDate[5:7] == x.FechaNacimiento[8:10] && e.BirthDate[8:10] == x.FechaNacimiento[5:7]:
		s += 0.08 // day and month swapped
		c.Motivos = append(c.Motivos, "Fecha de nacimiento (día y mes cambiados)")
	default:
		s -= 0.25
		c.Motivos = append(c.Motivos, "Otra fecha de nacimiento")
	}
	if k := clase(e.IntendedWeightClassKg); k != "" && k == clase(x.Categoria) {
		s += 0.04
		c.Motivos = append(c.Motivos, "Categoría")
	}
	if e.Team != "" && x.Club != "" {
		if cs, _ := simNombre(tokens(e.Team), tokens(x.Club)); cs >= 0.8 {
			s += 0.04
			c.Motivos = append(c.Motivos, "Club")
		}
	}
	if sexoDistinto {
		s *= 0.3
		c.Motivos = append(c.Motivos, "Sexo distinto")
	}
	c.Puntuacion = max(0, min(1, s))
	return c
}

// Resultado of matching one entry.
type emparejado struct {
	atleta     *uuid.UUID
	vinculo    string // auto · sugerido · sin_coincidencia
	puntuacion float64
	motivo     string
	candidatos []Candidato
}

// emparejar links the entries that are not fixed. fijos: athletes already taken by a confirmed link on this desk.
func emparejar(entradas []*Entrada, ids []*identidad, fijos map[uuid.UUID]bool, alias map[string]uuid.UUID) map[int]emparejado {
	type par struct {
		e int
		c Candidato
	}
	porEntrada := map[int][]Candidato{}
	var pares []par
	for _, e := range entradas {
		et := tokens(e.Name)
		al := alias[clave(e.Name)]
		var cs []Candidato
		for _, x := range ids {
			if fijos[x.ID] {
				continue
			}
			c := puntuar(e, et, x, al)
			if c.Puntuacion >= 0.35 {
				cs = append(cs, c)
			}
		}
		sort.Slice(cs, func(i, j int) bool { return cs[i].Puntuacion > cs[j].Puntuacion })
		porEntrada[e.ID] = cs
		for _, c := range cs {
			pares = append(pares, par{e.ID, c})
		}
	}
	// Best scores first; an athlete goes to one entry only.
	sort.SliceStable(pares, func(i, j int) bool { return pares[i].c.Puntuacion > pares[j].c.Puntuacion })
	out := map[int]emparejado{}
	tomados := map[uuid.UUID]bool{}
	for _, p := range pares {
		if _, ok := out[p.e]; ok || tomados[p.c.AtletaID] {
			continue
		}
		cs := porEntrada[p.e]
		segundo := 0.0
		for _, c := range cs {
			if c.AtletaID != p.c.AtletaID {
				segundo = c.Puntuacion
				break
			}
		}
		if p.c.exacto || (p.c.Puntuacion >= umbralAuto && p.c.Puntuacion-segundo >= margenAuto) {
			id := p.c.AtletaID
			tomados[id] = true
			out[p.e] = emparejado{atleta: &id, vinculo: "auto", puntuacion: p.c.Puntuacion, motivo: strings.Join(p.c.Motivos, " · ")}
		}
	}
	for _, e := range entradas {
		if _, ok := out[e.ID]; ok {
			continue
		}
		var cs []Candidato
		for _, c := range porEntrada[e.ID] {
			if !tomados[c.AtletaID] && c.Puntuacion >= umbralSugerido && len(cs) < 3 {
				cs = append(cs, c)
			}
		}
		r := emparejado{vinculo: "sin_coincidencia", candidatos: cs}
		if len(cs) > 0 {
			r.vinculo, r.puntuacion = "sugerido", cs[0].Puntuacion
		}
		out[e.ID] = r
	}
	return out
}
