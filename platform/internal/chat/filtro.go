// Package chat runs the live community chat (§4 del contrato): rooms per (competition, day) in Redis Streams,
// WebSocket + SSE + REST over the same room, moderation, limits and milestone counters. The hot path (validar →
// límites en Redis → XADD) never touches PostgreSQL; a deferred consumer persists batches into `mensajes`.
package chat

import (
	"strings"
	"unicode"
)

// maxRunas is the longest message accepted (emojis count as runes).
const maxRunas = 280

// minContables is the smallest meaningful message for the milestone counter (§4: 3 non-space characters).
const minContables = 3

// Config is the public shape of the room configuration (admin edits it; the hot path reads a cached copy).
type Config struct {
	Activo             bool     `json:"activo"`
	ModoLentoSeg       int      `json:"modoLentoSeg"`
	PalabrasProhibidas []string `json:"palabrasProhibidas"`
	DominiosPermitidos []string `json:"dominiosPermitidos"`
	MaxHitos           int      `json:"maxHitos"`
}

// configPorDefecto is used when nothing is configured (or the cache and the DB are both unavailable).
func configPorDefecto() Config {
	return Config{Activo: true, ModoLentoSeg: 0, PalabrasProhibidas: nil, DominiosPermitidos: nil, MaxHitos: 100}
}

// normalizar folds a text for matching: lowercase and without accents (á → a, Ü → u), keeping letters and digits.
func normalizar(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.ToLower(s) {
		if r == ' ' || unicode.IsDigit(r) || unicode.IsLetter(r) {
			b.WriteRune(quitarAcento(r))
		}
	}
	return b.String()
}

// quitarAcento maps the accented letters used in Spanish (and a few common ones) to their plain form.
func quitarAcento(r rune) rune {
	switch r {
	case 'á', 'à', 'ä', 'â', 'ã':
		return 'a'
	case 'é', 'è', 'ë', 'ê':
		return 'e'
	case 'í', 'ì', 'ï', 'î':
		return 'i'
	case 'ó', 'ò', 'ö', 'ô', 'õ':
		return 'o'
	case 'ú', 'ù', 'ü', 'û':
		return 'u'
	case 'ç':
		return 'c'
	case 'ñ':
		return 'ñ' // ñ is a letter of its own in Spanish, not an accented n
	}
	return r
}

// runasSinEspacios counts the characters that make a message meaningful (§4: at least 3 without spaces).
func runasSinEspacios(s string) int {
	n := 0
	for _, r := range s {
		if !unicode.IsSpace(r) {
			n++
		}
	}
	return n
}

// resultadoDelFiltro explains why a message was rejected (code estable + mensaje en español).
type resultadoDelFiltro struct {
	OK      bool
	Code    string
	Detalle string
}

var (
	filtroOK = resultadoDelFiltro{OK: true}
)

// filtrar validates a message text against the room config (pure: no Redis, no DB, easy to test).
func filtrar(texto string, cfg Config) resultadoDelFiltro {
	t := strings.TrimSpace(texto)
	if t == "" {
		return resultadoDelFiltro{Code: "TEXTO_VACIO", Detalle: "Escribe un mensaje."}
	}
	if n := len([]rune(t)); n > maxRunas {
		return resultadoDelFiltro{Code: "TEXTO_LARGO", Detalle: "El mensaje no puede superar los 280 caracteres."}
	}
	for _, w := range cfg.PalabrasProhibidas {
		if w = strings.TrimSpace(w); w != "" && strings.Contains(normalizar(t), normalizar(w)) {
			return resultadoDelFiltro{Code: "PALABRA_PROHIBIDA", Detalle: "Tu mensaje contiene una palabra no permitida."}
		}
	}
	// todos los enlaces del mensaje se validan: mirar solo el primero dejaba pasar «grcup.com y spam.example»
	for _, d := range enlaces(t) {
		if !dominioPermitido(d, cfg.DominiosPermitidos) {
			return resultadoDelFiltro{Code: "ENLACE_NO_PERMITIDO", Detalle: "Los enlaces deben apuntar a dominios permitidos por la organización."}
		}
	}
	return filtroOK
}

// enlaces extracts the hostname of every link found in the text (https://, http:// or www.).
func enlaces(texto string) []string {
	var out []string
	for _, campo := range strings.FieldsFunc(texto, esSeparador) {
		bajo := strings.ToLower(campo)
		var host string
		switch {
		case strings.HasPrefix(bajo, "http://"):
			host = bajo[len("http://"):]
		case strings.HasPrefix(bajo, "https://"):
			host = bajo[len("https://"):]
		case strings.HasPrefix(bajo, "www."):
			host = bajo
		default:
			continue
		}
		// cut the path and a trailing punctuation the writer may have added
		host = strings.Trim(host, ".,;:!?)»\"'")
		if i := strings.IndexAny(host, "/?#"); i >= 0 {
			host = host[:i]
		}
		if i := strings.Index(host, "@"); i >= 0 { // user:pass@host
			host = host[i+1:]
		}
		if host != "" {
			out = append(out, host)
		}
	}
	return out
}

// enlace extracts the hostname of the first link found in the text (the filter uses enlaces: it checks them all).
func enlace(texto string) (string, bool) {
	hosts := enlaces(texto)
	if len(hosts) == 0 {
		return "", false
	}
	return hosts[0], true
}

func esSeparador(r rune) bool { return unicode.IsSpace(r) || r == '<' || r == '>' || r == '"' }

// dominioPermitido matches the hostname against the allow list (suffix match: grcup.com also covers www.grcup.com,
// but not malicioso-grcup.com… that is why the dot is part of the comparison).
func dominioPermitido(host string, permitidos []string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	host = strings.TrimPrefix(host, "www.")
	for _, p := range permitidos {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		p = strings.TrimPrefix(p, "www.")
		if host == p || strings.HasSuffix(host, "."+p) {
			return true
		}
	}
	return false
}

// contable reports whether the message counts for the milestone counter (§4: at least 3 non-space characters).
func contable(texto string) bool { return runasSinEspacios(texto) >= minContables }
