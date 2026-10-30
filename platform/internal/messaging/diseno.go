package messaging

import (
	"fmt"
	"html"
	"math"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

// Bloque is a block of a campaign design (Figma 61 · «Campaña · Diseño»): one design, two channels. Canal says where
// it appears: both, email only or WhatsApp only. Texts accept **negrita**, line breaks, links and {{nombre}}.
type Bloque struct {
	ID      string   `json:"id" maxLength:"40"`
	Tipo    string   `json:"tipo" doc:"cabecera, portada, titulo, texto, boton, imagen, lista, dos_columnas, cuenta_atras, horario, separador, espacio"`
	Canal   string   `json:"canal,omitempty" doc:"ambos (por defecto), email o whatsapp"`
	Texto   string   `json:"texto,omitempty" maxLength:"2000"`
	Texto2  string   `json:"texto2,omitempty" maxLength:"2000" doc:"Columna derecha (dos_columnas)"`
	URL     string   `json:"url,omitempty" maxLength:"500"`
	Imagen  string   `json:"imagen,omitempty" maxLength:"500"`
	Alt     string   `json:"alt,omitempty" maxLength:"200"`
	Items   []string `json:"items,omitempty" maxItems:"12"`
	Fecha   string   `json:"fecha,omitempty" maxLength:"25" doc:"cuenta_atras: fecha y hora ISO; horario: día AAAA-MM-DD"`
	Alinear string   `json:"alinear,omitempty" doc:"izquierda (por defecto) o centro"`
	Alto    int      `json:"alto,omitempty" doc:"espacio: 8–64 px"`
}

var tiposBloque = map[string]string{
	"cabecera": "Cabecera", "portada": "Portada", "titulo": "Título", "texto": "Texto", "boton": "Botón", "imagen": "Imagen", "lista": "Lista",
	"dos_columnas": "Dos columnas", "cuenta_atras": "Cuenta atrás", "horario": "Flight / horario", "separador": "Separador", "espacio": "Espacio",
}

// validarDiseno checks a design (from the editor or the AI) and normalises it.
func validarDiseno(d []Bloque) ([]Bloque, error) {
	if len(d) > 40 {
		return nil, fmt.Errorf("el diseño tiene %d bloques: el máximo es 40", len(d))
	}
	ids := map[string]bool{}
	out := make([]Bloque, 0, len(d))
	for i, b := range d {
		n := fmt.Sprintf("Bloque %d", i+1)
		if _, ok := tiposBloque[b.Tipo]; !ok {
			return nil, fmt.Errorf("%s: tipo «%s» desconocido", n, b.Tipo)
		}
		if b.Canal == "" {
			b.Canal = "ambos"
		}
		if b.Canal != "ambos" && b.Canal != "email" && b.Canal != "whatsapp" {
			return nil, fmt.Errorf("%s: canal «%s» no válido", n, b.Canal)
		}
		if b.ID == "" || ids[b.ID] {
			b.ID = fmt.Sprintf("b%d", i+1)
			for ids[b.ID] {
				b.ID += "x"
			}
		}
		ids[b.ID] = true
		for _, u := range []string{b.URL, b.Imagen} {
			if u != "" && !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "/") {
				return nil, fmt.Errorf("%s (%s): el enlace debe empezar por https:// o /", n, tiposBloque[b.Tipo])
			}
		}
		switch b.Tipo {
		case "titulo", "texto":
			if strings.TrimSpace(b.Texto) == "" {
				return nil, fmt.Errorf("%s (%s): escribe el texto", n, tiposBloque[b.Tipo])
			}
		case "boton":
			if strings.TrimSpace(b.Texto) == "" || b.URL == "" {
				return nil, fmt.Errorf("%s (Botón): falta el texto o el enlace", n)
			}
		case "portada", "imagen":
			if b.Imagen == "" {
				return nil, fmt.Errorf("%s (%s): falta la imagen", n, tiposBloque[b.Tipo])
			}
		case "cuenta_atras":
			if _, err := time.Parse(time.RFC3339, b.Fecha); err != nil {
				if _, err := time.Parse("2006-01-02T15:04", b.Fecha); err != nil {
					return nil, fmt.Errorf("%s (Cuenta atrás): la fecha debe ser AAAA-MM-DDTHH:MM", n)
				}
			}
		case "horario":
			if _, err := time.Parse("2006-01-02", b.Fecha); err != nil {
				return nil, fmt.Errorf("%s (Flight / horario): elige el día", n)
			}
		case "espacio":
			b.Alto = max(8, min(64, b.Alto))
		}
		out = append(out, b)
	}
	return out, nil
}

// FlightResumen is a published flight shown by the «Flight / horario» block.
type FlightResumen struct {
	Codigo string
	Titulo string
	Hora   string
}

// Contexto is what the compiler needs besides the design.
type Contexto struct {
	Marca    Marca
	Asunto   string
	Pre      string
	Ahora    time.Time
	Flights  map[string][]FlightResumen // by day (AAAA-MM-DD)
	Absoluto func(string) string        // makes /relative links absolute (web of the competition)
}

func enEmail(b Bloque) bool    { return b.Canal != "whatsapp" }
func enWhatsApp(b Bloque) bool { return b.Canal != "email" }

// textoHTML: escaped text with **negrita**, links and line breaks; {{nombre}} stays as a token (filled per recipient).
func textoHTML(s string) string {
	h := html.EscapeString(strings.TrimSpace(s))
	h = reBold.ReplaceAllString(h, `<strong style="color:#141011">$1</strong>`)
	return linkify(strings.ReplaceAll(h, "\n", "<br>"))
}

func cuenta(b Bloque, ahora time.Time) (int, int) {
	t, err := time.Parse(time.RFC3339, b.Fecha)
	if err != nil {
		t, _ = time.ParseInLocation("2006-01-02T15:04", b.Fecha, madrid)
	}
	d := t.Sub(ahora)
	if d < 0 {
		return 0, 0
	}
	return int(d.Hours()) / 24, int(math.Mod(d.Hours(), 24))
}

// compilarEmail turns the design into a 600 px email with inline styles. {{nombre}} and {{baja}} stay as tokens.
func compilarEmail(d []Bloque, c Contexto) string {
	var body strings.Builder
	header := ""
	for _, b := range d {
		if !enEmail(b) {
			continue
		}
		al := "left"
		if b.Alinear == "centro" {
			al = "center"
		}
		pad := `padding:0 32px 16px;text-align:` + al
		switch b.Tipo {
		case "cabecera":
			logo := ""
			if c.Marca.Logo != "" {
				logo = `<img src="` + html.EscapeString(c.Marca.Logo) + `" alt="` + html.EscapeString(c.Marca.Nombre) + `" height="40" style="display:inline-block;height:40px;border:0">`
			}
			header = `<tr><td style="background:#141011;padding:20px 32px;text-align:center">` + logo + `</td></tr>`
			body.WriteString(header)
		case "portada":
			body.WriteString(`<tr><td style="padding:0 0 24px"><img src="` + html.EscapeString(c.Absoluto(b.Imagen)) + `" alt="` + html.EscapeString(b.Alt) + `" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`)
		case "titulo":
			body.WriteString(`<tr><td style="` + pad + `"><h1 style="margin:8px 0 4px;font-size:26px;line-height:32px;color:#141011">` + textoHTML(b.Texto) + `</h1></td></tr>`)
		case "texto":
			body.WriteString(`<tr><td style="` + pad + `"><p style="margin:0;font-size:16px;line-height:24px;color:#3d3436">` + textoHTML(b.Texto) + `</p></td></tr>`)
		case "boton":
			btn := `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;display:inline-table"><tr><td style="border-radius:6px;background:#c42b3e">` +
				`<a href="` + html.EscapeString(c.Absoluto(b.URL)) + `" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">` + html.EscapeString(b.Texto) + `</a></td></tr></table>`
			body.WriteString(`<tr><td style="` + pad + `">` + btn + `</td></tr>`)
		case "imagen":
			img := `<img src="` + html.EscapeString(c.Absoluto(b.Imagen)) + `" alt="` + html.EscapeString(b.Alt) + `" width="536" style="display:block;width:100%;height:auto;border:0;border-radius:8px">`
			if b.URL != "" {
				img = `<a href="` + html.EscapeString(c.Absoluto(b.URL)) + `">` + img + `</a>`
			}
			body.WriteString(`<tr><td style="padding:0 32px 16px">` + img + `</td></tr>`)
		case "lista":
			var li strings.Builder
			for _, it := range b.Items {
				if strings.TrimSpace(it) != "" {
					li.WriteString(`<li style="margin:0 0 6px">` + textoHTML(it) + `</li>`)
				}
			}
			body.WriteString(`<tr><td style="` + pad + `"><ul style="margin:0;padding-left:20px;font-size:16px;line-height:24px;color:#3d3436">` + li.String() + `</ul></td></tr>`)
		case "dos_columnas":
			col := func(s string) string {
				return `<td valign="top" width="50%" style="padding:0 8px;font-size:15px;line-height:22px;color:#3d3436">` + textoHTML(s) + `</td>`
			}
			body.WriteString(`<tr><td style="padding:0 24px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` + col(b.Texto) + col(b.Texto2) + `</tr></table></td></tr>`)
		case "cuenta_atras":
			dias, horas := cuenta(b, c.Ahora)
			caja := func(v int, l string) string {
				return `<td style="padding:0 4px"><div style="background:#141011;border-radius:8px;padding:10px 14px;text-align:center;color:#ffffff"><div style="font-size:26px;font-weight:700;line-height:30px">` +
					fmt.Sprintf("%02d", v) + `</div><div style="font-size:11px;letter-spacing:1px;color:#b8acae">` + l + `</div></div></td>`
			}
			txt := ""
			if b.Texto != "" {
				txt = `<p style="margin:0 0 8px;font-size:14px;color:#7a7072">` + textoHTML(b.Texto) + `</p>`
			}
			body.WriteString(`<tr><td style="padding:0 32px 20px;text-align:center">` + txt + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>` + caja(dias, "DÍAS") + caja(horas, "HORAS") + `</tr></table></td></tr>`)
		case "horario":
			fl := c.Flights[b.Fecha]
			var rows strings.Builder
			for _, f := range fl {
				rows.WriteString(`<tr><td style="padding:8px 0;border-bottom:1px solid #eee6e7;font-size:15px;color:#3d3436">Flight ` + html.EscapeString(f.Codigo) + ` · ` + html.EscapeString(f.Titulo) +
					`</td><td style="padding:8px 0;border-bottom:1px solid #eee6e7;text-align:right;font-family:Menlo,Consolas,monospace;font-size:14px;color:#c42b3e">` + html.EscapeString(f.Hora) + `</td></tr>`)
			}
			if len(fl) == 0 {
				rows.WriteString(`<tr><td style="padding:8px 0;font-size:15px;color:#7a7072">Los horarios de este día aún no están publicados.</td></tr>`)
			}
			body.WriteString(`<tr><td style="padding:0 32px 16px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;color:#9a8f91">` + strings.ToUpper(diaLargo(b.Fecha)) + ` · FLIGHTS</p>` +
				`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` + rows.String() + `</table></td></tr>`)
		case "separador":
			body.WriteString(`<tr><td style="padding:8px 32px 24px"><div style="border-top:1px solid #eee6e7"></div></td></tr>`)
		case "espacio":
			body.WriteString(fmt.Sprintf(`<tr><td style="height:%dpx;line-height:%dpx">&nbsp;</td></tr>`, b.Alto, b.Alto))
		}
	}
	web := strings.TrimPrefix(strings.TrimPrefix(c.Marca.Web, "https://"), "http://")
	pie := `<tr><td style="padding:20px 32px 28px;border-top:1px solid #eee6e7;font-size:12px;line-height:18px;color:#9a8f91;text-align:center">` + html.EscapeString(c.Marca.Nombre) +
		` · <a href="` + html.EscapeString(c.Marca.Web) + `" style="color:#9a8f91">` + html.EscapeString(web) + `</a><br>Recibes este email porque aceptaste recibir novedades. <a href="{{baja}}" style="color:#9a8f91">Darme de baja</a></td></tr>`
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">` +
		`<title>` + html.EscapeString(c.Asunto) + `</title></head><body style="margin:0;padding:0;background:#f2eeee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
		`<span style="display:none;max-height:0;overflow:hidden;opacity:0">` + html.EscapeString(c.Pre) + `</span>` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2eeee"><tr><td align="center" style="padding:24px 12px">` +
		`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">` +
		body.String() + pie + `</table></td></tr></table></body></html>`
}

// textoPlano is the text/plain part of the campaign email.
func textoPlano(d []Bloque, c Contexto) string {
	var out []string
	for _, b := range d {
		if !enEmail(b) {
			continue
		}
		switch b.Tipo {
		case "titulo", "texto":
			out = append(out, reBold.ReplaceAllString(strings.TrimSpace(b.Texto), "$1"))
		case "dos_columnas":
			out = append(out, reBold.ReplaceAllString(strings.TrimSpace(b.Texto+"\n\n"+b.Texto2), "$1"))
		case "boton":
			out = append(out, b.Texto+": "+c.Absoluto(b.URL))
		case "lista":
			l := []string{}
			for _, it := range b.Items {
				l = append(l, "- "+reBold.ReplaceAllString(it, "$1"))
			}
			out = append(out, strings.Join(l, "\n"))
		case "cuenta_atras":
			dias, _ := cuenta(b, c.Ahora)
			out = append(out, fmt.Sprintf("Faltan %d días", dias))
		case "horario":
			l := []string{strings.ToUpper(diaLargo(b.Fecha))}
			for _, f := range c.Flights[b.Fecha] {
				l = append(l, "Flight "+f.Codigo+" · "+f.Titulo+" · "+f.Hora)
			}
			out = append(out, strings.Join(l, "\n"))
		}
	}
	return strings.Join(out, "\n\n") + "\n\n— " + c.Marca.Nombre + " · " + c.Marca.Web + "\nDarme de baja: {{baja}}\n"
}

// WhatsApp is the message derived from the design: text (WhatsApp formatting), the first image and the links.
type WhatsApp struct {
	Texto   string   `json:"texto"`
	Imagen  string   `json:"imagen,omitempty"`
	Enlaces []Enlace `json:"enlaces"`
}

// Enlace is a button of the design, shown as a link in WhatsApp.
type Enlace struct {
	Texto string `json:"texto"`
	URL   string `json:"url"`
}

// derivarWhatsApp writes the WhatsApp version: «Solo email» blocks are left out, bold is *x*, buttons become links
// and the opt-out line goes at the end.
func derivarWhatsApp(d []Bloque, c Contexto) WhatsApp {
	w := WhatsApp{Enlaces: []Enlace{}}
	var parts []string
	for _, b := range d {
		if !enWhatsApp(b) {
			continue
		}
		bold := func(s string) string { return reBold.ReplaceAllString(strings.TrimSpace(s), "*$1*") }
		switch b.Tipo {
		case "portada", "imagen":
			if w.Imagen == "" {
				w.Imagen = c.Absoluto(b.Imagen)
			}
		case "titulo":
			parts = append(parts, "*"+reBold.ReplaceAllString(strings.TrimSpace(b.Texto), "$1")+"*")
		case "texto":
			parts = append(parts, bold(b.Texto))
		case "dos_columnas":
			parts = append(parts, bold(b.Texto)+"\n\n"+bold(b.Texto2))
		case "boton":
			u := c.Absoluto(b.URL)
			w.Enlaces = append(w.Enlaces, Enlace{b.Texto, u})
			parts = append(parts, b.Texto+": "+u)
		case "lista":
			l := []string{}
			for _, it := range b.Items {
				if strings.TrimSpace(it) != "" {
					l = append(l, "• "+bold(it))
				}
			}
			parts = append(parts, strings.Join(l, "\n"))
		case "cuenta_atras":
			dias, horas := cuenta(b, c.Ahora)
			pre := "Faltan"
			if strings.TrimSpace(b.Texto) != "" {
				pre = bold(b.Texto)
			}
			parts = append(parts, fmt.Sprintf("%s *%d días y %d horas*", pre, dias, horas))
		case "horario":
			l := []string{"*" + strings.ToUpper(diaLargo(b.Fecha)) + "*"}
			for _, f := range c.Flights[b.Fecha] {
				l = append(l, "Flight "+f.Codigo+" · "+f.Titulo+" · "+f.Hora)
			}
			parts = append(parts, strings.Join(l, "\n"))
		case "separador":
			parts = append(parts, "—")
		}
	}
	parts = append(parts, "_Responde BAJA si no quieres recibir más avisos por WhatsApp._")
	w.Texto = strings.Join(parts, "\n\n")
	return w
}

// personalizar fills the per-recipient tokens of a compiled text.
func personalizar(s, nombre, baja string, esHTML bool) string {
	if nombre == "" {
		nombre = "hola"
	}
	if esHTML {
		nombre, baja = html.EscapeString(nombre), html.EscapeString(baja)
	}
	return strings.NewReplacer("{{nombre}}", nombre, "{{ nombre }}", nombre, "{{baja}}", baja).Replace(s)
}

func diaLargo(f string) string {
	t, err := time.Parse("2006-01-02", f)
	if err != nil {
		return f
	}
	return diasSemana[t.Weekday()] + " " + t.Format("2") + " de " + mesesLargos[t.Month()]
}

var diasSemana = [...]string{"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"}
var mesesLargos = [...]string{"", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// absoluto makes a /relative link absolute against the public web.
func absoluto(web string) func(string) string {
	return func(u string) string {
		if strings.HasPrefix(u, "/") {
			return strings.TrimRight(web, "/") + u
		}
		return u
	}
}

// conUTM tags the campaign links of the web (utm_source=email|whatsapp, utm_campaign=<slug of the name>).
func conUTM(u, fuente, campana, web string) string {
	if !strings.HasPrefix(u, web) {
		return u
	}
	p, err := url.Parse(u)
	if err != nil {
		return u
	}
	q := p.Query()
	if q.Get("utm_source") == "" {
		q.Set("utm_source", fuente)
		q.Set("utm_medium", "campana")
		q.Set("utm_campaign", campana)
	}
	p.RawQuery = q.Encode()
	return p.String()
}

func slugCampana(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	guion := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			guion = false
		default:
			if r, ok := sinTilde[r]; ok {
				b.WriteRune(r)
				guion = false
			} else if !guion && b.Len() > 0 {
				b.WriteByte('-')
				guion = true
			}
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if utf8.RuneCountInString(out) > 50 {
		out = string([]rune(out)[:50])
	}
	return out
}

var sinTilde = map[rune]rune{'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n', 'à': 'a', 'è': 'e', 'ò': 'o', 'ç': 'c'}
