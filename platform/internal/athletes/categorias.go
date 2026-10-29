package athletes

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// IPF weight classes (kg). The lightest class of each sex is only for sub-juniors and juniors.
var (
	categoriasM = []string{"-53", "-59", "-66", "-74", "-83", "-93", "-105", "-120", "+120"}
	categoriasF = []string{"-43", "-47", "-52", "-57", "-63", "-69", "-76", "-84", "+84"}
)

// Divisions by age (IPF: the age reached during the calendar year of the competition).
var divisiones = []struct {
	Clave, Nombre string
	Min, Max      int
}{
	{"subjunior", "Subjúnior", 14, 18},
	{"junior", "Júnior", 19, 23},
	{"open", "Open", 24, 39},
	{"master1", "Máster 1", 40, 49},
	{"master2", "Máster 2", 50, 59},
	{"master3", "Máster 3", 60, 69},
	{"master4", "Máster 4", 70, 120},
}

// DivisionNombre returns the display name of a division key.
func DivisionNombre(k string) string {
	for _, d := range divisiones {
		if d.Clave == k {
			return d.Nombre
		}
	}
	return k
}

func validDivision(k string) bool {
	for _, d := range divisiones {
		if d.Clave == k {
			return true
		}
	}
	return false
}

// DivisionPorEdad returns the age division of someone born on nac competing in year (Open is always allowed).
func DivisionPorEdad(nac time.Time, year int) string {
	edad := year - nac.Year()
	for _, d := range divisiones {
		if edad >= d.Min && edad <= d.Max {
			return d.Clave
		}
	}
	return "open"
}

// Edad at date d.
func Edad(nac, d time.Time) int {
	e := d.Year() - nac.Year()
	if d.YearDay() < nac.YearDay() {
		e--
	}
	return e
}

// Categorias returns the classes of a sex (with or without the youth-only class).
func Categorias(sexo string, juvenil bool) []string {
	all := categoriasM
	if sexo == "F" {
		all = categoriasF
	}
	if juvenil {
		return all
	}
	return all[1:]
}

// NormCategoria turns "−63", "63", "-63 kg", "M-83" or "+84" into "-63" / "+84".
func NormCategoria(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.NewReplacer("−", "-", "–", "-", "kg", "", " ", "", "m", "", "f", "").Replace(s)
	if s == "" {
		return ""
	}
	if s[0] != '-' && s[0] != '+' {
		s = "-" + s
	}
	return s
}

// ValidarCategoria checks a class against sex and division.
func ValidarCategoria(sexo, cat, division string) error {
	if cat == "" {
		return fmt.Errorf("falta la categoría")
	}
	juvenil := division == "subjunior" || division == "junior"
	for _, c := range Categorias(sexo, juvenil) {
		if c == cat {
			return nil
		}
	}
	for _, c := range Categorias(sexo, true) {
		if c == cat {
			return fmt.Errorf("la categoría %s kg solo existe para subjúnior y júnior", cat)
		}
	}
	return fmt.Errorf("categoría %q no existe (¿%s?)", cat, closest(sexo, cat))
}

func closest(sexo, cat string) string {
	v, err := strconv.ParseFloat(strings.TrimLeft(cat, "-+"), 64)
	if err != nil {
		return Categorias(sexo, false)[0]
	}
	best, diff := "", 1e9
	for _, c := range Categorias(sexo, true) {
		w, _ := strconv.ParseFloat(strings.TrimLeft(c, "-+"), 64)
		if d := abs(w - v); d < diff {
			best, diff = c, d
		}
	}
	return best
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

// CategoriaPorPeso returns the class a body weight falls in.
func CategoriaPorPeso(sexo string, peso float64, juvenil bool) string {
	for _, c := range Categorias(sexo, juvenil) {
		if c[0] == '+' {
			return c
		}
		lim, _ := strconv.ParseFloat(c[1:], 64)
		if peso <= lim {
			return c
		}
	}
	return ""
}

// CheckPesaje reports whether a weigh-in fits the registered class and, if not, the class it fits.
func CheckPesaje(sexo, cat, division string, peso float64) (ok bool, sugerencia string) {
	juvenil := division == "subjunior" || division == "junior"
	got := CategoriaPorPeso(sexo, peso, juvenil)
	return got == cat, got
}

// Slugify builds a URL slug from a name ("Laura Gómez Ruiz" → "laura-gomez-ruiz").
func Slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range norm.NFD.String(strings.ToLower(s)) {
		switch {
		case unicode.Is(unicode.Mn, r):
			continue
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		case !dash && b.Len() > 0:
			b.WriteByte('-')
			dash = true
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if len(out) > 70 {
		out = strings.TrimRight(out[:70], "-")
	}
	if out == "" {
		out = "atleta"
	}
	return out
}

// NormLicencia uppercases and strips spaces ("val 0412" → "VAL0412" keeps the dash form "VAL-0412").
func NormLicencia(s string) string {
	return strings.ToUpper(strings.Join(strings.Fields(s), ""))
}

// NormSexo maps "Mujer", "F", "Femenino", "W" → "F" and "Hombre", "M", "Masculino" → "M".
func NormSexo(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch {
	case s == "":
		return ""
	case strings.HasPrefix(s, "f") || strings.HasPrefix(s, "mu") || s == "w" || strings.HasPrefix(s, "wom"):
		return "F"
	case strings.HasPrefix(s, "m") || strings.HasPrefix(s, "h"):
		return "M"
	}
	return ""
}

// NormDivision maps free text ("Júnior", "Master 1", "Sub-junior", "Open") to a division key.
func NormDivision(s string) string {
	t := strings.ToLower(norm.NFD.String(strings.TrimSpace(s)))
	t = strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Mn, r) || r == ' ' || r == '-' || r == '_' {
			return -1
		}
		return r
	}, t)
	switch {
	case t == "":
		return ""
	case strings.HasPrefix(t, "sub"):
		return "subjunior"
	case strings.HasPrefix(t, "jun"):
		return "junior"
	case strings.HasPrefix(t, "open") || strings.HasPrefix(t, "abs") || strings.HasPrefix(t, "senior"):
		return "open"
	case strings.HasPrefix(t, "mas"):
		for _, n := range []string{"1", "2", "3", "4"} {
			if strings.HasSuffix(t, n) || strings.HasSuffix(t, map[string]string{"1": "i", "2": "ii", "3": "iii", "4": "iv"}[n]) {
				return "master" + n
			}
		}
		return "master1"
	}
	return ""
}

// ParseFecha accepts 2006-01-02, 02/01/2006 and 2/1/2006.
func ParseFecha(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	for _, f := range []string{"2006-01-02", "02/01/2006", "2/1/2006", "02-01-2006", "2006/01/02"} {
		if t, err := time.Parse(f, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
