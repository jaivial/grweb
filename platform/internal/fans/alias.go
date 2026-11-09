package fans

import (
	"strings"
	"unicode"
)

// Alias rules (§3): 3–20 characters of letters, numbers and _ . -, unique per competition (citext in the
// table) and filtered against a basic forbidden-word list (staff impersonation and common insults). The
// check normalises the alias so «P._u t-a» does not slip a word through the separators.

func aliasValido(s string) bool {
	s = strings.TrimSpace(s)
	if n := len([]rune(s)); n < 3 || n > 20 {
		return false
	}
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' && r != '.' && r != '-' && r != ' ' {
			return false
		}
	}
	// No leading/trailing separators and no runs of them: keeps «Nombre _Apellido» readable.
	if strings.Trim(s, " _.-") != s || strings.ContainsAny(s[:1], "._- ") || strings.Contains(s, "  ") {
		return false
	}
	return true
}

// forbidden words: long ones match as substring of the normalised alias, short ones only as a whole token
// (so «modelo» is fine but the alias «mod» is not).
var prohibidas = []string{
	// staff / suplantación
	"admin", "administrador", "moderador", "moderacion", "moderar", "arbitro", "árbitro", "juez", "jueces",
	"staff", "root", "grcup", "organizador", "organizacion", "delegado",
	// insultos básicos
	"mierda", "joder", "jodido", "cabron", "gilipollas", "idiota", "imbecil", "subnormal", "maricon",
	"pendejo", "pinche", "coño", "polla", "verga", "chingar", "puta", "puto", "zorra", "putada", "violador",
	"fuck", "fucking", "shit", "bitch", "asshole", "bastard", "nigger", "nigga", "cunt", "whore", "slut",
}

func normalizar(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch r {
		case '_', '.', '-', ' ':
			b.WriteRune('·') // separators vanish from the word view
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// aliasProhibido reports whether the alias contains a forbidden word.
func aliasProhibido(s string) bool {
	norm := normalizar(s)
	for _, pal := range prohibidas {
		p := normalizar(pal)
		if len([]rune(p)) >= 5 {
			if strings.Contains(norm, p) {
				return true
			}
			continue
		}
		for _, tok := range strings.FieldsFunc(s, func(r rune) bool { return unicode.IsSpace(r) || r == '_' || r == '.' || r == '-' }) {
			if strings.ToLower(tok) == p || strings.ToLower(tok) == pal {
				return true
			}
		}
	}
	return false
}

// validarAlias returns the cleaned alias or "" when it breaks the rules.
func validarAlias(s string) string {
	s = strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
	if !aliasValido(s) || aliasProhibido(s) {
		return ""
	}
	return s
}
