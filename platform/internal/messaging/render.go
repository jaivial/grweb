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
	// Adjunto is a file attached to the email (multipart/mixed); never part of the preview.
	Adjunto *Adjunto `json:"-"`
}

func variablesDe(c Contenido) []string {
	seen := map[string]bool{}
	var out []string
	for _, f := range []string{c.Asunto, c.Preheader, c.Titulo, c.Cuerpo, c.BotonTexto, c.BotonURL, c.Pie, c.Nota, c.Imagen} {
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
func renderizar(c Contenido, vars map[string]string, permitidas []string, m Marca, operativo bool, conQR ...bool) (Render, error) {
	return renderizarCon(c, vars, permitidas, m, operativo, len(conQR) > 0 && conQR[0], "")
}

// renderizarCon is renderizar with one more block: bloque is HTML already compiled that goes under the body without
// escaping (only the form of a formularios invitation; empty = none).
func renderizarCon(c Contenido, vars map[string]string, permitidas []string, m Marca, operativo, conQR bool, bloque string) (Render, error) {
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
	qr := ""
	if conQR && strings.HasPrefix(full["qr"], "http") {
		qr = `<p style="margin:0 0 20px;text-align:center"><img src="` + html.EscapeString(full["qr"]) + `" width="200" height="200" alt="Código QR de tu entrada" style="display:inline-block;width:200px;height:200px;border:0">` +
			`<br><span style="font-family:Menlo,Consolas,monospace;font-size:14px;letter-spacing:2px;color:#141011">` + html.EscapeString(full["codigo"]) + `</span></p>`
		parrafosTxt = append([]string{"Código de tu entrada: " + full["codigo"]}, parrafosTxt...)
	}
	boton := ""
	btnURL, _ := sustituir(c.BotonURL, full, false)
	btnTxt, _ := sustituir(c.BotonTexto, full, true)
	if c.BotonTexto != "" && strings.HasPrefix(btnURL, "http") {
		boton = `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:8px auto 24px"><tr><td align="center" style="border-radius:6px;background:#c42b3e">` +
			`<a href="` + html.EscapeString(btnURL) + `" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">` + gmailClaro(btnTxt) + `</a></td></tr></table>`
		parrafosTxt = append(parrafosTxt, html.UnescapeString(btnTxt)+": "+btnURL)
	}
	// The image of the template (the photo of the request, by a signed URL that expires).
	imagen := ""
	imgURL, _ := sustituir(c.Imagen, full, false)
	if strings.HasPrefix(imgURL, "http") {
		imagen = `<p style="margin:0 0 20px;text-align:center"><img src="` + html.EscapeString(imgURL) + `" alt="Foto de la solicitud" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px"></p>`
		parrafosTxt = append([]string{"Foto de la solicitud: " + imgURL}, parrafosTxt...)
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
	if c.Nota != "" {
		nota, _ = sustituir(c.Nota, full, false)
	}
	logo := ""
	if m.Logo != "" {
		// Brand header: 72 px high (retina: the image is 588 px wide, five times the box) with the size in
		// attributes and inline, because clients ignore stylesheets.
		logo = `<img src="` + html.EscapeString(m.Logo) + `" alt="` + html.EscapeString(m.Nombre) + `" width="116" height="72" style="display:block;margin:0 auto;width:116px;height:72px;border:0">`
	}
	h := `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
		`<title>` + html.EscapeString(asunto) + `</title></head><body style="margin:0;padding:0;background:#f2eeee;color:#3d3436;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
		`<span style="display:none;max-height:0;overflow:hidden;opacity:0">` + pre + `</span>` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2eeee;color:#3d3436"><tr><td align="center" style="padding:` + margenEmail(bloque) + `">` +
		`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;color:#3d3436;border-radius:12px;overflow:hidden">` +
		`<tr><td align="center" style="background:#141011;padding:20px 32px;text-align:center">` + logo + `</td></tr>` +
		`<tr><td style="padding:32px 32px 16px"><h1 style="margin:0 0 20px;font-size:24px;line-height:30px;color:#141011">` + titulo + `</h1>` +
		qr + imagen + strings.Join(parrafosHTML, "") + filaBloque(bloque) + boton + pie + `</td></tr>` +
		`<tr><td style="padding:16px 32px 28px;border-top:1px solid #eee6e7;font-size:12px;line-height:18px;color:#9a8f91">` + html.EscapeString(nota) +
		` <a href="` + html.EscapeString(m.Web) + `" style="color:#9a8f91">` + html.EscapeString(strings.TrimPrefix(strings.TrimPrefix(m.Web, "https://"), "http://")) + `</a></td></tr>` +
		`</table></td></tr></table></body></html>`
	h = colorFijo(h)
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

// renderizarWA builds the WhatsApp text of a transactional template: the same paragraphs as the email, with the
// WhatsApp formatting (*negrita*) and the same rule (a paragraph with an empty variable is not shown).
func renderizarWA(texto string, vars map[string]string, permitidas []string) (string, error) {
	ok := map[string]bool{}
	for _, v := range permitidas {
		ok[v] = true
	}
	for _, v := range variablesDe(Contenido{Cuerpo: texto}) {
		if !ok[v] {
			return "", fmt.Errorf("%s", errVariable(v, permitidas))
		}
	}
	full := map[string]string{}
	for _, v := range permitidas {
		full[v] = vars[v]
	}
	var out []string
	for _, par := range reBlanks.Split(strings.TrimSpace(texto), -1) {
		par = strings.TrimSpace(par)
		if par == "" || vacia(par, full) {
			continue
		}
		t, _ := sustituir(par, full, false)
		out = append(out, reBold.ReplaceAllString(t, "*$1*"))
	}
	return strings.Join(out, "\n\n"), nil
}

// variablesOrdenadas is for the editor panel.
func variablesOrdenadas(vs []string) []string {
	out := append([]string(nil), vs...)
	sort.Strings(out)
	return out
}

// filaBloque saca el bloque (el formulario de la invitación) del relleno lateral de la tarjeta: cierra la celda del
// cuerpo, lo pone en su propia fila a todo el ancho, sin relleno, y abre otra celda con el mismo relleno para el botón
// y el pie. Así el formulario ocupa el 100 % del ancho del email (en el móvil, cada píxel cuenta).
func filaBloque(bloque string) string {
	if bloque == "" {
		return ""
	}
	return `</td></tr><tr><td style="padding:0">` + bloque + `</td></tr><tr><td style="padding:16px 32px 0">`
}

// margenEmail es el relleno alrededor de la tarjeta: sin margen lateral cuando lleva formulario, para que ocupe todo
// el ancho de la pantalla.
func margenEmail(bloque string) string {
	if bloque != "" {
		return "16px 0"
	}
	return "24px 12px"
}
