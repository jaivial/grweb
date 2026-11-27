package formularios

import (
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
)

var reNegrita = regexp.MustCompile(`\*\*([^*]+)\*\*`)

// temaEmail es el tema ya saneado para usarlo en estilos en línea: cada valor es un color válido, un tamaño o una
// familia conocida (nunca texto libre), así que no puede inyectar CSS.
type temaEmail struct {
	acento, fondo, superficie, texto, fuente string
	radio, gap                               int
}

// CompilarEmailHTML compila el formulario para pegarlo en el email (§6): un <form method="post"> con tablas y estilos
// en línea (sin JS ni CSS externo), nombres f_<campoId>, colores del tema, el botón de enviar y, debajo, el enlace a la
// web. Los formularios con archivos son solo web: devuelve "" para ellos. accion y enlace van escapados.
func CompilarEmailHTML(e Esquema, accion, enlace string) string {
	if SoloWeb(e) {
		return ""
	}
	t := temaVisual(e.Ajustes.Tema)
	boton := e.Ajustes.BotonEnviar
	if strings.TrimSpace(boton) == "" {
		boton = DefaultBoton
	}
	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:` + t.fondo + `">` +
		// Sin margen lateral y poco relleno: el email ya tiene el suyo, y en el móvil cada píxel de ancho cuenta.
		`<tr><td style="padding:12px 0">` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:` + t.superficie + `;border-radius:` + strconv.Itoa(t.radio) + `px">` +
		`<tr><td style="padding:16px 12px;font-family:` + t.fuente + `;font-size:16px;color:` + t.texto + `">`)
	b.WriteString(`<form action="` + esc(accion) + `" method="post" style="margin:0;padding:0">`)
	if d := strings.TrimSpace(e.Ajustes.Descripcion); d != "" {
		b.WriteString(`<p style="margin:0 0 ` + strconv.Itoa(t.gap) + `px;font-size:15px;line-height:1.5">` + formato(d) + `</p>`)
	}
	for _, c := range e.Campos {
		b.WriteString(bloqueEmail(c, t))
	}
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr><td align="center">` +
		`<input type="submit" value="` + esc(boton) + `" style="background:` + t.acento + `;color:#FFFFFF;border:0;border-radius:` + strconv.Itoa(t.radio) +
		`px;padding:12px 24px;font-size:16px;font-weight:bold;font-family:` + t.fuente + `;cursor:pointer">` +
		`</td></tr></table>`)
	b.WriteString(`</form>`)
	b.WriteString(`<p style="margin:16px 0 0;font-size:13px;color:#666666;text-align:center">¿No puedes enviarlo desde aquí? ` +
		`<a href="` + esc(enlace) + `" style="color:` + t.acento + `">Rellénalo en la web</a></p>`)
	b.WriteString(`</td></tr></table></td></tr></table>`)
	return b.String()
}

func temaVisual(t Tema) temaEmail {
	d := DefaultTema()
	gap := map[string]int{"compacta": 8, "normal": 14, "amplia": 22}[t.Densidad]
	if gap == 0 {
		gap = 14
	}
	return temaEmail{
		acento:     colorO(t.Acento, d.Acento),
		fondo:      colorO(t.Fondo, d.Fondo),
		superficie: colorO(t.Superficie, d.Superficie),
		texto:      colorO(t.Texto, d.Texto),
		fuente:     fuenteCSS(t.Fuente),
		radio:      min(max(t.Radio, 0), 24),
		gap:        gap,
	}
}

// bloqueEmail compila un campo: decorativos sin etiqueta y el resto con su etiqueta, ayuda y control.
func bloqueEmail(c Campo, t temaEmail) string {
	color := colorO(c.Estilo.Color, t.texto)
	estilo := "text-align:" + alineacion(c.Estilo.Alinear) + ";color:" + color + ";font-family:" + t.fuente + ";"
	if c.Estilo.Negrita {
		estilo += "font-weight:bold;"
	}
	switch c.Tipo {
	case TipoSeparador:
		return fmt.Sprintf(`<hr style="border:0;border-top:1px solid #DDDDDD;margin:0 0 %dpx">`, t.gap)
	case TipoTitulo:
		return fmt.Sprintf(`<h2 style="margin:0 0 %dpx;font-size:%dpx;%s">%s</h2>`, t.gap, tituloPx(c.Estilo.Tamano), estilo, formato(c.Etiqueta))
	case TipoParrafo:
		return fmt.Sprintf(`<p style="margin:0 0 %dpx;font-size:%dpx;line-height:1.5;%s">%s</p>`, t.gap, textoPx(c.Estilo.Tamano), estilo, formato(c.Etiqueta))
	case TipoImagen:
		if !strings.HasPrefix(c.Imagen, "https://") {
			return ""
		}
		return fmt.Sprintf(`<img src="%s" alt="%s" width="100%%" style="display:block;width:100%%;max-width:100%%;height:auto;border:0;margin:0 0 %dpx">`,
			esc(c.Imagen), esc(c.Alt), t.gap)
	case TipoCasilla:
		req := ""
		if c.Obligatorio {
			req = " *"
		}
		return fmt.Sprintf(`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 %dpx">`+
			`<tr><td width="28" valign="top"><input type="checkbox" name="f_%s" value="on"></td>`+
			`<td style="font-size:15px">%s%s</td></tr></table>`, t.gap, esc(c.ID), formato(c.Etiqueta), req)
	}
	req := ""
	if c.Obligatorio {
		req = ` <span style="color:` + t.acento + `">*</span>`
	}
	ayuda := ""
	if a := strings.TrimSpace(c.Ayuda); a != "" {
		ayuda = `<tr><td style="font-size:13px;color:#666666;padding-bottom:6px">` + formato(a) + `</td></tr>`
	}
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ` + strconv.Itoa(t.gap) + `px">` +
		`<tr><td style="font-weight:bold;font-size:15px;padding-bottom:4px">` + formato(c.Etiqueta) + req + `</td></tr>` +
		ayuda + `<tr><td>` + controlEmail(c, t) + `</td></tr></table>`
}

// controlEmail es el control de entrada del campo.
func controlEmail(c Campo, t temaEmail) string {
	name := ` name="f_` + esc(c.ID) + `"`
	ph := ""
	if c.Placeholder != "" {
		ph = ` placeholder="` + esc(c.Placeholder) + `"`
	}
	input := func(typ string) string {
		return `<input type="` + typ + `"` + name + ph + ` style="` + estiloInput(t) + `">`
	}
	switch c.Tipo {
	case TipoTextoCorto:
		return input("text")
	case TipoEmail:
		return input("email")
	case TipoTelefono:
		return input("tel")
	case TipoFecha:
		return input("date")
	case TipoNumero:
		attrs := ""
		if c.Min != nil {
			attrs += ` min="` + fmtNum(*c.Min) + `"`
		}
		if c.Max != nil {
			attrs += ` max="` + fmtNum(*c.Max) + `"`
		}
		if c.Paso != nil {
			attrs += ` step="` + fmtNum(*c.Paso) + `"`
		}
		return `<input type="number"` + name + ph + attrs + ` style="` + estiloInput(t) + `">`
	case TipoTextoLargo:
		return `<textarea` + name + ph + ` rows="4" style="` + estiloInput(t) + `"></textarea>`
	case TipoOpcionUnica:
		return listaEmail("radio", name, c.Opciones)
	case TipoCasillas, TipoSeleccionMultiple:
		return listaEmail("checkbox", name, c.Opciones)
	case TipoDesplegable:
		var b strings.Builder
		vacio := c.Placeholder
		if vacio == "" {
			vacio = "Elige una opción"
		}
		b.WriteString(`<select` + name + ` style="` + estiloInput(t) + `"><option value="">` + esc(vacio) + `</option>`)
		for _, o := range c.Opciones {
			b.WriteString(`<option value="` + esc(o.ID) + `">` + esc(o.Texto) + `</option>`)
		}
		b.WriteString(`</select>`)
		return b.String()
	case TipoSiNo:
		return filaRadios(name, [][2]string{{"si", "Sí"}, {"no", "No"}})
	case TipoDeslizador:
		var pares [][2]string
		for _, o := range c.Opciones {
			pares = append(pares, [2]string{o.ID, o.Texto})
		}
		return filaRadios(name, pares) + extremos(c, t)
	case TipoEscala:
		mn, mx := valorF(c.Min, 0), valorF(c.Max, 10)
		paso := valorF(c.Paso, 1)
		var pares [][2]string
		// Como mucho 11 puntos (la escala va de 0 a 10): un paso diminuto no puede generar miles de radios.
		for v := mn; v <= mx && paso > 0 && len(pares) <= 10; v += paso {
			pares = append(pares, [2]string{fmtNum(v), fmtNum(v)})
		}
		return filaRadios(name, pares) + extremos(c, t)
	case TipoValoracion:
		var pares [][2]string
		for k := 1; k <= int(valorF(c.Max, DefaultValoracion)); k++ {
			pares = append(pares, [2]string{strconv.Itoa(k), "★"})
		}
		return filaRadios(name, pares)
	}
	return ""
}

// listaEmail: una opción por línea (radios o casillas).
func listaEmail(typ, name string, ops []Opcion) string {
	var b strings.Builder
	for _, o := range ops {
		b.WriteString(`<label style="display:block;margin:6px 0;font-size:15px"><input type="` + typ + `"` + name + ` value="` + esc(o.ID) + `"> ` + esc(o.Texto) + `</label>`)
	}
	return b.String()
}

// filaRadios: radios en una fila (deslizador, escala, valoración y sí/no).
func filaRadios(name string, pares [][2]string) string {
	if len(pares) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`)
	for _, p := range pares {
		b.WriteString(`<td align="center" style="font-size:13px;padding:0 2px"><input type="radio"` + name + ` value="` + esc(p[0]) + `"><br>` + esc(p[1]) + `</td>`)
	}
	b.WriteString(`</tr></table>`)
	return b.String()
}

// extremos: las etiquetas de los extremos de una escala o un deslizador.
func extremos(c Campo, t temaEmail) string {
	if c.MinEtiqueta == "" && c.MaxEtiqueta == "" {
		return ""
	}
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
		`<td align="left" style="font-size:12px;color:#666666">` + esc(c.MinEtiqueta) + `</td>` +
		`<td align="right" style="font-size:12px;color:#666666">` + esc(c.MaxEtiqueta) + `</td></tr></table>`
}

func estiloInput(t temaEmail) string {
	return "box-sizing:border-box;width:100%;padding:10px;border:1px solid #CCCCCC;border-radius:" + strconv.Itoa(t.radio) +
		"px;font-size:16px;font-family:" + t.fuente + ";color:" + t.texto + ";background:#FFFFFF"
}

// formato escapa el texto y convierte **negrita** y saltos de línea.
func formato(s string) string {
	out := reNegrita.ReplaceAllString(esc(s), "<strong>$1</strong>")
	return strings.ReplaceAll(out, "\n", "<br>")
}

func esc(s string) string { return html.EscapeString(s) }

func colorO(c, def string) string {
	if reColor.MatchString(c) {
		return c
	}
	return def
}

func alineacion(a string) string {
	switch a {
	case "centro", "derecha":
		return a
	}
	return "left"
}

func tituloPx(tamano string) int { return map[string]int{"s": 18, "m": 22, "l": 28}[tamano] }

func textoPx(tamano string) int { return map[string]int{"s": 14, "m": 16, "l": 20}[tamano] }

func fuenteCSS(f string) string {
	switch f {
	case "serif":
		return "Georgia,'Times New Roman',serif"
	case "mono":
		return "'Courier New',Courier,monospace"
	}
	return "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
}
