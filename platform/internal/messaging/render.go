package messaging

import (
	"fmt"
	"html"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

var (
	reVar    = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}`)
	reBold   = regexp.MustCompile(`\*\*(.+?)\*\*`)
	reURL    = regexp.MustCompile(`https?://[^\s<"]+`)
	reBlanks = regexp.MustCompile(`\n\s*\n`)
)

// Marca is the brand of the competition in the email layout.
type Marca struct {
	Nombre string
	Web    string
	Logo   string
}

// Render is a rendered email.
type Render struct {
	Asunto string `json:"asunto"`
	HTML   string `json:"html"`
	Texto  string `json:"texto"`
}

func variablesDe(c Contenido) []string {
	seen := map[string]bool{}
	var out []string
	for _, f := range []string{c.Asunto, c.Preheader, c.Titulo, c.Cuerpo, c.BotonTexto, c.BotonURL, c.Pie} {
		for _, m := range reVar.FindAllStringSubmatch(f, -1) {
			if !seen[m[1]] {
				seen[m[1]] = true
				out = append(out, m[1])
			}
		}
	}
	return out
}

// validar rejects variables the producer never sends (422 VARIABLE_INEXISTENTE with the closest suggestion).
func validar(c Contenido, permitidas []string) error {
	ok := map[string]bool{}
	for _, v := range permitidas {
		ok[v] = true
	}
	for _, v := range variablesDe(c) {
		if !ok[v] {
			return problem.New(http.StatusUnprocessableEntity, "VARIABLE_INEXISTENTE", errVariable(v, permitidas))
		}
	}
	if u := strings.TrimSpace(c.BotonURL); c.BotonTexto != "" && u == "" {
		return problem.Unprocessable("BOTON_SIN_ENLACE", "El botón necesita un enlace (normalmente una variable como {{enlace}}).")
	}
	return nil
}

func errVariable(v string, permitidas []string) string {
	msg := "La variable {{" + v + "}} no existe en esta plantilla."
	if s := parecida(v, permitidas); s != "" {
		msg += " ¿Querías decir {{" + s + "}}?"
	}
	return msg
}

// parecida returns the allowed variable closest to v (edit distance ≤ 4 or same last segment).
func parecida(v string, permitidas []string) string {
	best, bd := "", 5
	last := v[strings.LastIndex(v, ".")+1:]
	for _, p := range permitidas {
		if p == last {
			return p
		}
		if d := distancia(v, p); d < bd {
			best, bd = p, d
		}
	}
	return best
}

func distancia(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur := make([]int, len(rb)+1)
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			c := 1
			if ra[i-1] == rb[j-1] {
				c = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+c)
		}
		prev = cur
	}
	return prev[len(rb)]
}

// sustituir replaces the variables of s; esc escapes values for HTML. Missing variables are an error (the
// template is paused until fixed) unless lenient.
func sustituir(s string, vars map[string]string, esc bool) (string, []string) {
	var faltan []string
	out := reVar.ReplaceAllStringFunc(s, func(m string) string {
		k := reVar.FindStringSubmatch(m)[1]
		v, ok := vars[k]
		if !ok {
			faltan = append(faltan, k)
		}
		if esc {
			return html.EscapeString(v)
		}
		return v
	})
	return out, faltan
}

func vacia(s string, vars map[string]string) bool {
	for _, m := range reVar.FindAllStringSubmatch(s, -1) {
		if strings.TrimSpace(vars[m[1]]) == "" {
			return true
		}
	}
	return false
}

// renderizar builds subject, HTML and plain text. Paragraphs with an empty variable are left out (e.g. the referral
// code of a registration in the reserve list). Errors list the variables the producer did not send.
func renderizar(c Contenido, vars map[string]string, permitidas []string, m Marca, operativo bool) (Render, error) {
	ok := map[string]bool{}
	for _, v := range permitidas {
		ok[v] = true
	}
	for _, v := range variablesDe(c) {
		if !ok[v] {
			return Render{}, fmt.Errorf("%s", errVariable(v, permitidas))
		}
	}
	if vars == nil {
		vars = map[string]string{}
	}
	full := map[string]string{}
	for _, v := range permitidas {
		full[v] = vars[v]
	}
	asunto, _ := sustituir(c.Asunto, full, false)
	pre, _ := sustituir(c.Preheader, full, true)
	titulo, _ := sustituir(c.Titulo, full, true)
	var parrafosHTML, parrafosTxt []string
	for _, par := range reBlanks.Split(strings.TrimSpace(c.Cuerpo), -1) {
		par = strings.TrimSpace(par)
		if par == "" || vacia(par, full) {
			continue
		}
		h, _ := sustituir(html.EscapeString(par), escVars(full), false)
		h = reBold.ReplaceAllString(h, `<strong style="color:#141011">$1</strong>`)
		h = linkify(strings.ReplaceAll(h, "\n", "<br>"))
		parrafosHTML = append(parrafosHTML, `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#3d3436">`+h+`</p>`)
		t, _ := sustituir(par, full, false)
		parrafosTxt = append(parrafosTxt, reBold.ReplaceAllString(t, "$1"))
	}
	boton := ""
	btnURL, _ := sustituir(c.BotonURL, full, false)
	btnTxt, _ := sustituir(c.BotonTexto, full, true)
	if c.BotonTexto != "" && strings.HasPrefix(btnURL, "http") {
		boton = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:6px;background:#c42b3e">` +
			`<a href="` + html.EscapeString(btnURL) + `" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">` + btnTxt + `</a></td></tr></table>`
		parrafosTxt = append(parrafosTxt, html.UnescapeString(btnTxt)+": "+btnURL)
	}
	pie := ""
	if c.Pie != "" && !vacia(c.Pie, full) {
		ph, _ := sustituir(html.EscapeString(c.Pie), escVars(full), false)
		pie = `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#7a7072">` + linkify(ph) + `</p>`
		pt, _ := sustituir(c.Pie, full, false)
		parrafosTxt = append(parrafosTxt, pt)
	}
	nota := "Email operativo de tu participación en " + m.Nombre + "."
	if !operativo {
		nota = "Recibes este email porque lo pediste en " + m.Nombre + "."
	}
	logo := ""
	if m.Logo != "" {
		logo = `<img src="` + html.EscapeString(m.Logo) + `" alt="` + html.EscapeString(m.Nombre) + `" height="40" style="display:block;height:40px;border:0">`
	}
	h := `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">` +
		`<title>` + html.EscapeString(asunto) + `</title></head><body style="margin:0;padding:0;background:#f2eeee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
		`<span style="display:none;max-height:0;overflow:hidden;opacity:0">` + pre + `</span>` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2eeee"><tr><td align="center" style="padding:24px 12px">` +
		`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">` +
		`<tr><td style="background:#141011;padding:20px 32px">` + logo + `</td></tr>` +
		`<tr><td style="padding:32px 32px 16px"><h1 style="margin:0 0 20px;font-size:24px;line-height:30px;color:#141011">` + titulo + `</h1>` +
		strings.Join(parrafosHTML, "") + boton + pie + `</td></tr>` +
		`<tr><td style="padding:16px 32px 28px;border-top:1px solid #eee6e7;font-size:12px;line-height:18px;color:#9a8f91">` + html.EscapeString(nota) +
		` <a href="` + html.EscapeString(m.Web) + `" style="color:#9a8f91">` + html.EscapeString(strings.TrimPrefix(strings.TrimPrefix(m.Web, "https://"), "http://")) + `</a></td></tr>` +
		`</table></td></tr></table></body></html>`
	texto := html.UnescapeString(titulo) + "\n\n" + strings.Join(parrafosTxt, "\n\n") + "\n\n— " + nota + " " + m.Web + "\n"
	return Render{Asunto: asunto, HTML: h, Texto: texto}, nil
}

func escVars(v map[string]string) map[string]string {
	out := make(map[string]string, len(v))
	for k, x := range v {
		out[k] = html.EscapeString(x)
	}
	return out
}

func linkify(h string) string {
	return reURL.ReplaceAllStringFunc(h, func(u string) string {
		return `<a href="` + u + `" style="color:#c42b3e">` + u + `</a>`
	})
}

// variablesOrdenadas is for the editor panel.
func variablesOrdenadas(vs []string) []string {
	out := append([]string(nil), vs...)
	sort.Strings(out)
	return out
}
