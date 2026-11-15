// Package entexto holds the English-override helpers shared by services whose public texts live outside the CMS.
// Each service keeps an «en» jsonb column; public reads with ?lang=en overlay the non-empty English values.
package entexto

// Lang is embedded in public inputs.
type Lang struct {
	Lang string `query:"lang" pattern:"^(es|en)?$" doc:"en: textos en inglés cuando existen"`
}

// En reports whether English was asked for.
func (l Lang) En() bool { return l.Lang == "en" }

// Dict maps a Spanish text to its English version (for texts without a stable id, e.g. snapshot strings).
type Dict map[string]string

// T returns the English text of s when the dictionary has a non-empty one, else s.
func (d Dict) T(s string) string {
	if v := d[s]; v != "" {
		return v
	}
	return s
}

// Pick returns en[k] when it is a non-empty string, else es.
func Pick(en map[string]any, k, es string) string {
	if v, ok := en[k].(string); ok && v != "" {
		return v
	}
	return es
}

// Or is for overrides keyed by field name: d[k] when non-empty, else es.
func (d Dict) Or(k, es string) string {
	if v := d[k]; v != "" {
		return v
	}
	return es
}
