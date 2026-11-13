package messaging

import (
	"html"
	"regexp"
	"strings"
)

// Figma 78 · «Emails y WhatsApp · Alta de atleta»: the templates of the athlete sign-up (group solicitudes-atleta)
// use the dark email of the competition. The body keeps the editor rules (paragraphs, **negrita**, {{variable}});
// these patterns pick the block: «**Etiqueta:** valor» → data table, «1. …» → numbered steps, «✓ …» → checklist,
// «⚠ …» → amber notice, a lone «**Título**» titles the next block (a plain paragraph after it is a red notice).
var (
	reKV    = regexp.MustCompile(`^\*\*([^*]+?):\*\*\s*(.*)$`)
	reNum   = regexp.MustCompile(`^(\d+)\.\s+(.*)$`)
	reHead  = regexp.MustCompile(`^\*\*([^*]+)\*\*$`)
	altaGrp = "solicitudes-atleta"
)

const (
	aFont  = `font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
	aCard  = `background:#141112;border:1px solid #2e2729;border-radius:12px`
	aMuted = "#9ca3af"
)

// renderizarDe renders a catalogue template with its layout.
func renderizarDe(t Plantilla, c Contenido, vars map[string]string, m Marca) (Render, error) {
	r, err := renderizar(c, vars, t.Variables, m, t.Esencial, t.QR)
	if err != nil || t.Auto != altaGrp {
		return r, err
	}
	r.HTML = altaHTML(t.Clave, c, vars, t.Variables, m)
	return r, nil
}

type altaBloque struct {
	tipo   string // texto | kv | num | check | aviso | motivo
	titulo string
	items  [][2]string
}

func altaHTML(clave string, c Contenido, vars map[string]string, permitidas []string, m Marca) string {
	full := map[string]string{}
	for _, v := range permitidas {
		full[v] = vars[v]
	}
	ev := escVars(full)
	sub := func(s string) string { h, _ := sustituir(html.EscapeString(s), ev, false); return h }
	strong := func(h string) string {
		return reBold.ReplaceAllString(h, `<strong style="color:#ffffff;font-weight:600">$1</strong>`)
	}

	// Paragraphs after substitution (a variable may carry several paragraphs, e.g. {{pasos}}).
	var pars []string
	for _, par := range reBlanks.Split(strings.TrimSpace(c.Cuerpo), -1) {
		par = strings.TrimSpace(par)
		if par == "" || vacia(par, full) {
			continue
		}
		t, _ := sustituir(par, full, false)
		for _, x := range reBlanks.Split(strings.TrimSpace(t), -1) {
			if x = strings.TrimSpace(x); x != "" {
				pars = append(pars, x)
			}
		}
	}
	var bs []*altaBloque
	titulo := ""
	add := func(tipo string, it [2]string) {
		if n := len(bs); n > 0 && bs[n-1].tipo == tipo && tipo != "texto" && tipo != "aviso" && titulo == "" {
			bs[n-1].items = append(bs[n-1].items, it)
			return
		}
		bs = append(bs, &altaBloque{tipo: tipo, titulo: titulo, items: [][2]string{it}})
		titulo = ""
	}
	for _, p := range pars {
		switch {
		case reKV.MatchString(p):
			g := reKV.FindStringSubmatch(p)
			add("kv", [2]string{g[1], g[2]})
		case reHead.MatchString(p):
			titulo = reHead.FindStringSubmatch(p)[1]
		case reNum.MatchString(p):
			g := reNum.FindStringSubmatch(p)
			add("num", [2]string{g[1], g[2]})
		case strings.HasPrefix(p, "✓"):
			add("check", [2]string{"", strings.TrimSpace(strings.TrimPrefix(p, "✓"))})
		case strings.HasPrefix(p, "⚠"):
			t, d, _ := strings.Cut(strings.TrimSpace(strings.TrimPrefix(p, "⚠")), ". ")
			add("aviso", [2]string{t, d})
		case titulo != "":
			add("motivo", [2]string{"", p})
		default:
			add("texto", [2]string{"", p})
		}
	}
	// The button goes after the last box (steps, checklist or notice), as in Figma; otherwise at the end.
	posBoton := len(bs) - 1
	for i, b := range bs {
		if b.tipo != "texto" && b.tipo != "kv" {
			posBoton = i
		}
	}
	imgURL, _ := sustituir(c.Imagen, full, false)
	foto := strings.HasPrefix(imgURL, "http")

	esc := html.EscapeString
	tabla := func(b *altaBloque) string {
		h := `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`
		if b.titulo != "" {
			h += `<tr><td colspan="2" style="padding:0 0 8px;font-size:13px;line-height:18px;font-weight:500;color:#ebe5e5">` + esc(b.titulo) + `</td></tr>`
		}
		for _, it := range b.items {
			v := it[1]
			if strings.TrimSpace(v) == "" {
				v = "—"
			}
			h += `<tr><td class="kl" width="46%" valign="top" style="padding:8px 8px 8px 0;border-bottom:1px solid #2e2729;font-size:12px;line-height:16px;font-weight:500;color:` + aMuted + `">` + esc(it[0]) +
				`</td><td valign="top" style="padding:7px 0;border-bottom:1px solid #2e2729;font-size:13px;line-height:17px;color:#ebe5e5;word-break:break-word">` + linkify(esc(v)) + `</td></tr>`
		}
		return h + `</table>`
	}
	caja := func(b *altaBloque) string {
		h := `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="` + aCard + `;margin:0 0 20px"><tr><td class="pad" style="padding:20px 20px 12px">`
		if b.titulo != "" {
			h += `<p style="margin:0 0 10px;font-size:12px;line-height:16px;font-weight:500;color:#ebe5e5">` + esc(b.titulo) + `</p>`
		}
		h += `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">`
		for _, it := range b.items {
			marca := `<span style="display:inline-block;width:14px;height:14px;border:1px solid #948f91;border-radius:50%;font-size:10px;line-height:14px;text-align:center;color:#d1d5db">` + esc(it[0]) + `</span>`
			if b.tipo == "check" {
				marca = `<span style="font-size:14px;line-height:20px;font-weight:700;color:#22c55e">✓</span>`
			}
			h += `<tr><td width="24" valign="top" style="padding:2px 0 10px">` + marca + `</td><td valign="top" style="padding:0 0 10px;font-size:14px;line-height:20px;color:#d1d5db">` + strong(linkify(esc(it[1]))) + `</td></tr>`
		}
		return h + `</table></td></tr></table>`
	}
	aviso := func(color, borde, fondo, t, d string) string {
		return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:` + fondo + `;border:1px solid ` + borde + `;border-radius:8px;margin:0 0 20px"><tr><td style="padding:12px 14px">` +
			`<p style="margin:0 0 4px;font-size:12px;line-height:16px;font-weight:500;color:` + color + `">` + esc(t) + `</p>` +
			`<p style="margin:0;font-size:12px;line-height:16px;color:#d9d9e0">` + strong(linkify(esc(d))) + `</p></td></tr></table>`
	}
	boton := ""
	btnURL, _ := sustituir(c.BotonURL, full, false)
	btnTxt, _ := sustituir(c.BotonTexto, full, true)
	if c.BotonTexto != "" && strings.HasPrefix(btnURL, "http") {
		boton = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" bgcolor="#c42b3e" style="border-radius:8px;background:#c42b3e;background-image:linear-gradient(90deg,#c42b3e,#6e1420)">` +
			`<a href="` + esc(btnURL) + `" style="display:block;padding:14px 24px;font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none">` + btnTxt + `</a></td></tr></table>`
	}

	var cuerpo strings.Builder
	fotoHecha := false
	for i, b := range bs {
		switch b.tipo {
		case "texto":
			if i > 0 && bs[i-1].tipo == "kv" { // a note after a data table, as in Figma
				cuerpo.WriteString(`<p style="margin:0 0 20px;font-size:12px;line-height:18px;color:#948f91">` + strong(linkify(esc(b.items[0][1]))) + `</p>`)
				break
			}
			cuerpo.WriteString(`<p style="margin:0 0 20px;font-size:16px;line-height:25px;color:#d1d5db">` + strong(linkify(esc(b.items[0][1]))) + `</p>`)
		case "kv":
			if foto && !fotoHecha {
				fotoHecha = true
				alt := "Foto de la solicitud · " + strings.TrimSpace(full["nombre"]+" "+full["apellidos"]) + " (blanco y negro)"
				cuerpo.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>` +
					`<td class="col" width="180" valign="top" style="width:180px;padding:0 16px 16px 0"><img src="` + esc(imgURL) + `" alt="` + esc(alt) + `" width="180" height="225" style="display:block;width:180px;max-width:100%;height:225px;object-fit:cover;border:1px dashed #2e2729;border-radius:8px;background:#141112;color:#d1d5db;font-size:11px;line-height:15px;text-align:center">` +
					`<p style="margin:8px 0 0;font-size:11px;line-height:14px;color:#948f91">Foto · blanco y negro</p></td>` +
					`<td class="col" valign="top">` + tabla(b) + `</td></tr></table>`)
			} else {
				cuerpo.WriteString(`<div style="margin:0 0 12px">` + tabla(b) + `</div>`)
			}
		case "num", "check":
			cuerpo.WriteString(caja(b))
		case "aviso":
			cuerpo.WriteString(aviso("#f2c773", "rgba(242,199,115,.35)", "#221d14", b.items[0][0], b.items[0][1]))
		case "motivo":
			cuerpo.WriteString(aviso("#f28b8b", "rgba(196,43,62,.5)", "#221416", b.titulo, b.items[0][1]))
		}
		if i == posBoton {
			cuerpo.WriteString(boton)
			boton = ""
		}
	}
	cuerpo.WriteString(boton)
	if c.Pie != "" && !vacia(c.Pie, full) {
		pie := c.Pie
		if foto {
			pie = "La foto de este mensaje caduca en 7 días por seguridad. " + pie
		}
		cuerpo.WriteString(`<p style="margin:0;font-size:12px;line-height:18px;color:#6b7280">` + linkify(sub(pie)) + `</p>`)
	}

	asunto, _ := sustituir(c.Asunto, full, false)
	pre, _ := sustituir(c.Preheader, full, true)
	tit, _ := sustituir(c.Titulo, full, true)
	nota, _ := sustituir(c.Nota, full, false)
	web := strings.TrimRight(m.Web, "/")
	link := func(u, t string) string {
		return `<a href="` + esc(u) + `" style="color:#d1d5db;text-decoration:none">` + t + `</a>`
	}
	enlaces := link(web+"/atletas", "Atletas") + " · " + link(web+"/area-atleta", "Área de atleta")
	if clave == "atleta-solicitud-nueva" {
		enlaces = link(btnURL, "Panel de solicitudes")
	}
	enlaces += " · " + link(web+"/privacidad", "Política de privacidad")
	logo := `<span style="font-size:18px;font-weight:700;color:#ffffff">` + esc(m.Nombre) + `</span>`
	if m.Logo != "" {
		logo = `<img src="` + esc(m.Logo) + `" alt="` + esc(m.Nombre) + `" height="40" style="display:block;height:40px;border:0;color:#ffffff;font-size:14px;font-weight:700">`
	}
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">` +
		`<title>` + esc(asunto) + `</title><link href="https://fonts.googleapis.com/css2?family=Contrail+One&amp;family=Inter:wght@400;500;600&amp;display=swap" rel="stylesheet">` +
		`<style>@media (max-width:480px){.pad{padding-left:24px!important;padding-right:24px!important}.hd{padding:24px!important}.h1{font-size:32px!important;line-height:38px!important}.col{display:block!important;width:100%!important;padding-right:0!important}.col img{width:180px!important}}</style></head>` +
		`<body style="margin:0;padding:0;background:#0b0a0a;` + aFont + `">` +
		`<span style="display:none;max-height:0;overflow:hidden;opacity:0">` + pre + `</span>` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a0a"><tr><td align="center">` +
		`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#0e0c0d;` + aFont + `">` +
		`<tr><td class="hd" style="padding:24px 32px 24px 38px;border-bottom:1px solid #2e2729"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>` + logo +
		`</td><td align="right" style="font-size:12px;line-height:16px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;color:#6b7280">` + esc(m.Nombre) + `</td></tr></table></td></tr>` +
		`<tr><td class="pad" style="padding:36px 40px 32px">` +
		`<h1 class="h1" style="margin:0 0 24px;font-family:'Contrail One',Impact,'Arial Narrow',sans-serif;font-weight:400;font-size:36px;line-height:44px;letter-spacing:2px;text-transform:uppercase;color:#ffffff">` + tit + `</h1>` +
		cuerpo.String() + `</td></tr>` +
		`<tr><td class="pad" style="padding:28px 40px 32px;border-top:1px solid #2e2729;text-align:center;font-size:12px;line-height:18px;color:#6b7280">` +
		`<p style="margin:0 0 8px">GRStrength · Almussafes (Valencia) · <a href="mailto:admin@grstrength.com" style="color:#6b7280;text-decoration:none">admin@grstrength.com</a></p>` +
		`<p style="margin:0 0 8px">` + esc(nota) + `</p><p style="margin:0">` + enlaces + `</p></td></tr>` +
		`</table></td></tr></table></body></html>`
}
