package messaging

import (
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// WhatsApp from HTML (a pasted email or the compiled campaign email): headings and <strong> become *bold*, <em>
// becomes _italic_, list items become «• x», the first real image travels as media and the links that look like a
// button (an <a> alone in its block, or styled as a button) become the buttons of the message. Tracking pixels,
// <head>, <style>, the preheader and the opt-out footer are left out.

var (
	reEspacios    = regexp.MustCompile(`[ \t\r\f\v\x{00a0}]+`)
	reLineasVacia = regexp.MustCompile(`\n{3,}`)
)

type conversorHTML struct {
	abs     func(string) string
	out     strings.Builder
	w       WhatsApp
	vistos  map[string]bool
	enBoton int
}

// desdeHTML converts an email or HTML fragment into a WhatsApp message.
func desdeHTML(src string, abs func(string) string) WhatsApp {
	if abs == nil {
		abs = func(u string) string { return u }
	}
	c := &conversorHTML{abs: abs, w: WhatsApp{Enlaces: []Enlace{}}, vistos: map[string]bool{}}
	doc, err := html.Parse(strings.NewReader(src))
	if err != nil {
		return c.w
	}
	c.nodo(doc)
	t := c.out.String()
	lineas := strings.Split(t, "\n")
	for i, l := range lineas {
		lineas[i] = strings.TrimSpace(reEspacios.ReplaceAllString(l, " "))
	}
	t = reLineasVacia.ReplaceAllString(strings.Join(lineas, "\n"), "\n\n")
	// *  * or __ left by empty bold/italic tags
	t = strings.NewReplacer("**", "", "* *", "", "__", "").Replace(t)
	c.w.Texto = strings.TrimSpace(t)
	return c.w
}

func atributo(n *html.Node, k string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, k) {
			return strings.TrimSpace(a.Val)
		}
	}
	return ""
}

func oculto(n *html.Node) bool {
	st := strings.ToLower(strings.ReplaceAll(atributo(n, "style"), " ", ""))
	return strings.Contains(st, "display:none") || strings.Contains(st, "max-height:0") || atributo(n, "hidden") != "" || atributo(n, "aria-hidden") == "true"
}

func textoDe(n *html.Node) string {
	var b strings.Builder
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(n)
	return strings.TrimSpace(reEspacios.ReplaceAllString(strings.ReplaceAll(b.String(), "\n", " "), " "))
}

// esBoton: a link with a button look, or alone in its block (the usual «call to action» of an email).
func esBoton(n *html.Node) bool {
	st := strings.ToLower(atributo(n, "style") + " " + atributo(n, "class"))
	if strings.Contains(st, "background") || strings.Contains(st, "btn") || strings.Contains(st, "button") || strings.Contains(st, "padding") {
		return true
	}
	p := n.Parent
	if p == nil {
		return false
	}
	return strings.TrimSpace(textoDe(p)) == strings.TrimSpace(textoDe(n))
}

func bajaOPie(u, t string) bool {
	l := strings.ToLower(u + " " + t)
	return strings.Contains(l, "{{baja}}") || strings.Contains(l, "/baja") || strings.Contains(l, "darme de baja") || strings.Contains(l, "unsubscribe")
}

func (c *conversorHTML) bloque() {
	s := c.out.String()
	if s != "" && !strings.HasSuffix(s, "\n\n") {
		if strings.HasSuffix(s, "\n") {
			c.out.WriteString("\n")
		} else {
			c.out.WriteString("\n\n")
		}
	}
}

func (c *conversorHTML) hijos(n *html.Node) {
	for h := n.FirstChild; h != nil; h = h.NextSibling {
		c.nodo(h)
	}
}

func (c *conversorHTML) nodo(n *html.Node) {
	switch n.Type {
	case html.TextNode:
		c.out.WriteString(strings.ReplaceAll(n.Data, "\n", " "))
		return
	case html.DocumentNode:
		c.hijos(n)
		return
	case html.ElementNode:
	default:
		return
	}
	if oculto(n) {
		return
	}
	switch n.DataAtom {
	case atom.Head, atom.Style, atom.Script, atom.Title, atom.Meta, atom.Link, atom.Noscript:
		return
	case atom.Br:
		c.out.WriteString("\n")
	case atom.Img:
		src := atributo(n, "src")
		w, _ := strconv.Atoi(strings.TrimSuffix(atributo(n, "width"), "px"))
		h, _ := strconv.Atoi(strings.TrimSuffix(atributo(n, "height"), "px"))
		// tracking pixels and the brand logo of the header (≤ 60 px high) are not the image of the message
		if c.w.Imagen == "" && src != "" && (strings.HasPrefix(src, "http") || strings.HasPrefix(src, "/")) && w != 1 && h != 1 && (h == 0 || h > 60) {
			c.w.Imagen = c.abs(src)
		}
	case atom.H1, atom.H2, atom.H3, atom.H4, atom.H5, atom.H6:
		c.bloque()
		if t := textoDe(n); t != "" {
			c.out.WriteString("*" + strings.ReplaceAll(t, "*", "") + "*")
		}
		c.bloque()
	case atom.Strong, atom.B:
		t := textoDe(n)
		if t == "" {
			return
		}
		c.out.WriteString("*" + strings.ReplaceAll(t, "*", "") + "*")
	case atom.Em, atom.I:
		t := textoDe(n)
		if t == "" {
			return
		}
		c.out.WriteString("_" + strings.ReplaceAll(t, "_", "") + "_")
	case atom.Li:
		c.out.WriteString("\n• ")
		c.hijos(n)
	case atom.Ul, atom.Ol:
		c.bloque()
		c.hijos(n)
		c.bloque()
	case atom.Hr:
		c.bloque()
		c.out.WriteString("—")
		c.bloque()
	case atom.A:
		href, t := atributo(n, "href"), textoDe(n)
		if bajaOPie(href, t) {
			return
		}
		if href == "" || strings.HasPrefix(href, "#") || strings.HasPrefix(href, "mailto:") || strings.HasPrefix(href, "tel:") {
			c.hijos(n)
			return
		}
		u := c.abs(href)
		if t != "" && esBoton(n) {
			if !c.vistos[u] {
				c.vistos[u] = true
				if r := []rune(t); len(r) > 25 {
					t = strings.TrimSpace(string(r[:25]))
				}
				c.w.Enlaces = append(c.w.Enlaces, Enlace{Texto: t, URL: u})
			}
			return
		}
		if t == "" {
			c.hijos(n) // linked image
			return
		}
		if strings.Contains(u, t) || strings.Contains(t, "://") {
			c.out.WriteString(u)
		} else {
			c.out.WriteString(t + " (" + u + ")")
		}
	case atom.P, atom.Div, atom.Td, atom.Tr, atom.Table, atom.Section, atom.Article, atom.Header, atom.Footer, atom.Blockquote, atom.Center:
		if n.DataAtom == atom.Footer || n.DataAtom == atom.Td && esPie(n) {
			return
		}
		c.bloque()
		c.hijos(n)
		c.bloque()
	default:
		c.hijos(n)
	}
}

// esPie: the legal footer of an email («Recibes este email…», opt-out), which WhatsApp replaces with its own line. Only a
// cell without nested tables: the layout cells around the whole email contain the footer too.
func esPie(n *html.Node) bool {
	var anidada func(*html.Node) bool
	anidada = func(x *html.Node) bool {
		for h := x.FirstChild; h != nil; h = h.NextSibling {
			if h.Type == html.ElementNode && (h.DataAtom == atom.Table || h.DataAtom == atom.Td) || anidada(h) {
				return true
			}
		}
		return false
	}
	if anidada(n) {
		return false
	}
	t := strings.ToLower(textoDe(n))
	return len(t) < 400 && (strings.Contains(t, "recibes este email") || strings.Contains(t, "darme de baja") || strings.Contains(t, "unsubscribe"))
}
