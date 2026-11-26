package messaging

import (
	"regexp"
	"strconv"
	"strings"
)

// Fixed email colours: every layout (transactional, athlete sign-up, campaigns and the backoffice previews, which
// show this same HTML) goes through colorFijo, so no client's light/dark mode repaints the template:
//   - Apple Mail (iOS/macOS), Outlook macOS/iOS, Samsung Mail, Hey: meta color-scheme / supported-color-schemes
//     «light only» and :root{color-scheme:light only} (no automatic dark mode), plus a prefers-color-scheme:dark
//     block that restates the same colours with !important.
//   - Outlook.com, new Outlook and the Outlook apps: [data-ogsc] / [data-ogsb] rules that put back the original
//     text and background colours they rewrite.
//   - Gmail apps (forced inversion, no media queries): dark and coloured backgrounds carry a one-colour
//     linear-gradient (Gmail never inverts background images) and the light text on them goes through gmailClaro
//     (u + .body screen/difference blend). Light backgrounds keep no gradient: Gmail would still invert the dark
//     text on them, so it inverts the whole light area consistently instead.
//   - Outlook Windows (Word engine) and old clients: inline color/background plus bgcolor on tables and cells.
//
// Logos are transparent PNGs: they always sit on a cell or table with a pinned dark background.
const cssColorFijo = `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">` +
	`<style>:root{color-scheme:light only;supported-color-schemes:light only}</style>` +
	`<style>u+.body .gmail-blend-screen{background:#000;mix-blend-mode:screen}u+.body .gmail-blend-difference{background:#000;mix-blend-mode:difference}</style>`

var (
	reEtiqueta  = regexp.MustCompile(`<[a-z][a-z0-9]*\b[^<>]*\sstyle="[^"]*"[^<>]*>`)
	reEstilo    = regexp.MustCompile(`\sstyle="([^"]*)"`)
	reColorCSS  = regexp.MustCompile(`(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b`)
	reFondoCSS  = regexp.MustCompile(`(?:^|;)\s*background(?:-color)?:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b`)
	reClase     = regexp.MustCompile(`\sclass="([^"]*)"`)
	reTablaOTd  = regexp.MustCompile(`^<(table|td|th|body)\b`)
	reBgcolor   = regexp.MustCompile(`\sbgcolor=`)
	reMetaColor = regexp.MustCompile(`<meta name="(?:color-scheme|supported-color-schemes)" content="[^"]*">`)
)

// gmailClaro wraps light text that sits on a dark or coloured background, so Gmail's forced inversion cannot
// darken it (the classes only apply in Gmail, through u + .body).
func gmailClaro(h string) string {
	return `<span class="gmail-blend-screen"><span class="gmail-blend-difference">` + h + `</span></span>`
}

// oscuro: a background Gmail would invert (anything but a light one), which gets the gradient.
func oscuro(hex string) bool {
	h := strings.TrimPrefix(hex, "#")
	if len(h) == 3 {
		h = string([]byte{h[0], h[0], h[1], h[1], h[2], h[2]})
	}
	v, _ := strconv.ParseUint(h, 16, 32)
	r, g, b := float64(v>>16&255), float64(v>>8&255), float64(v&255)
	return 0.299*r+0.587*g+0.114*b < 200
}

// colorFijo applies the techniques above to a finished email: classes, bgcolor and gradients on every tag with an
// inline colour, the head metas and the rules that restate each colour.
func colorFijo(h string) string {
	textos, fondos := map[string]bool{}, map[string]bool{}
	var ordenT, ordenF []string
	h = strings.Replace(h, "<body ", `<body class="body" `, 1)
	h = reEtiqueta.ReplaceAllStringFunc(h, func(tag string) string {
		est := reEstilo.FindStringSubmatch(tag)[1]
		var clases []string
		if m := reColorCSS.FindStringSubmatch(est); m != nil {
			c := strings.ToLower(m[1])
			clases = append(clases, "cf-t"+c[1:])
			if !textos[c] {
				textos[c] = true
				ordenT = append(ordenT, c)
			}
		}
		if m := reFondoCSS.FindStringSubmatch(est); m != nil {
			c := strings.ToLower(m[1])
			clases = append(clases, "cf-f"+c[1:])
			if !fondos[c] {
				fondos[c] = true
				ordenF = append(ordenF, c)
			}
			nuevo := est
			if oscuro(c) && !strings.Contains(est, "background-image") {
				nuevo += ";background-image:linear-gradient(" + c + "," + c + ")"
			}
			tag = strings.Replace(tag, ` style="`+est+`"`, ` style="`+nuevo+`"`, 1)
			if reTablaOTd.MatchString(tag) && !reBgcolor.MatchString(tag) {
				tag = strings.Replace(tag, ` style="`, ` bgcolor="`+c+`" style="`, 1)
			}
		}
		if len(clases) == 0 {
			return tag
		}
		if m := reClase.FindStringSubmatch(tag); m != nil {
			return strings.Replace(tag, m[0], ` class="`+m[1]+" "+strings.Join(clases, " ")+`"`, 1)
		}
		return strings.Replace(tag, ` style="`, ` class="`+strings.Join(clases, " ")+`" style="`, 1)
	})
	var ms, ol strings.Builder
	for _, c := range ordenT {
		ms.WriteString(".cf-t" + c[1:] + "{color:" + c + "!important}")
		ol.WriteString("[data-ogsc] .cf-t" + c[1:] + ",.cf-t" + c[1:] + "[data-ogsc]{color:" + c + "!important}")
	}
	for _, c := range ordenF {
		ms.WriteString(".cf-f" + c[1:] + "{background-color:" + c + "!important}")
		ol.WriteString("[data-ogsb] .cf-f" + c[1:] + ",.cf-f" + c[1:] + "[data-ogsb]{background-color:" + c + "!important}")
	}
	head := cssColorFijo + `<style>@media (prefers-color-scheme:dark){` + ms.String() + `}</style><style>` + ol.String() + `</style>`
	h = reMetaColor.ReplaceAllString(h, "")
	return strings.Replace(h, "</head>", head+"</head>", 1)
}
