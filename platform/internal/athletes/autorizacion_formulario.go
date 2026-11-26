package athletes

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"strings"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// The guardian's authorisation form (GRS Cup 2): an A4 portrait PNG (1240×1754 px, ~150 dpi) with the athlete's data
// already filled in. The guardian only writes their name, DNI/NIE, relationship, phone, the date and signs.

const (
	formAncho  = 1240
	formAlto   = 1754
	formMargen = 100
)

// eventoAutorizacion is the event the authorisation is for (the text of the form and of the public page).
const (
	eventoAutorizacion      = "GRS Cup 2"
	eventoAutorizacionLinea = "GRS Cup 2 · Campeonato de powerlifting · 19 de diciembre de 2026 · Almussafes (Valencia)"
)

// DatosFormulario is what the form prints of the athlete.
type DatosFormulario struct {
	Nombre          string
	FechaNacimiento string // dd/mm/aaaa (empty when unknown)
	Categoria       string
}

var fuentes struct {
	once             sync.Once
	regular, negrita *opentype.Font
	err              error
}

func cara(negrita bool, tam float64) (font.Face, error) {
	fuentes.once.Do(func() {
		if fuentes.regular, fuentes.err = opentype.Parse(goregular.TTF); fuentes.err == nil {
			fuentes.negrita, fuentes.err = opentype.Parse(gobold.TTF)
		}
	})
	if fuentes.err != nil {
		return nil, fuentes.err
	}
	f := fuentes.regular
	if negrita {
		f = fuentes.negrita
	}
	return opentype.NewFace(f, &opentype.FaceOptions{Size: tam, DPI: 72, Hinting: font.HintingFull})
}

// lienzo writes text top-down inside the margins.
type lienzo struct {
	img *image.RGBA
	y   int
}

func (l *lienzo) rect(x0, y0, x1, y1 int) {
	draw.Draw(l.img, image.Rect(x0, y0, x1, y1), image.NewUniform(color.Black), image.Point{}, draw.Src)
}

// texto writes a paragraph wrapped to the width between the margins (x is the left edge) and moves down.
func (l *lienzo) texto(f font.Face, x int, s string, interlinea int) {
	ancho := formAncho - formMargen - x
	for _, linea := range partir(f, s, ancho) {
		l.y += interlinea
		d := &font.Drawer{Dst: l.img, Src: image.NewUniform(color.Black), Face: f, Dot: fixed.P(x, l.y)}
		d.DrawString(linea)
	}
}

// campo is a label followed by a line to write on (or by the prefilled value).
func (l *lienzo) campo(f font.Face, etiqueta, valor string) {
	l.y += 58
	d := &font.Drawer{Dst: l.img, Src: image.NewUniform(color.Black), Face: f, Dot: fixed.P(formMargen, l.y)}
	d.DrawString(etiqueta)
	x := formMargen + font.MeasureString(f, etiqueta).Ceil() + 16
	if valor != "" {
		d.Dot = fixed.P(x, l.y)
		d.DrawString(valor)
		return
	}
	l.rect(x, l.y+6, formAncho-formMargen, l.y+8)
}

func partir(f font.Face, s string, ancho int) []string {
	var out []string
	for _, par := range strings.Split(s, "\n") {
		linea := ""
		for _, w := range strings.Fields(par) {
			cand := strings.TrimSpace(linea + " " + w)
			if linea != "" && font.MeasureString(f, cand).Ceil() > ancho {
				out = append(out, linea)
				linea = w
				continue
			}
			linea = cand
		}
		out = append(out, linea)
	}
	return out
}

// formularioPNG draws the form.
func formularioPNG(d DatosFormulario) ([]byte, error) {
	titulo, err := cara(true, 46)
	if err != nil {
		return nil, err
	}
	seccion, err := cara(true, 30)
	if err != nil {
		return nil, err
	}
	cuerpo, err := cara(false, 26)
	if err != nil {
		return nil, err
	}
	l := &lienzo{img: image.NewRGBA(image.Rect(0, 0, formAncho, formAlto)), y: formMargen}
	draw.Draw(l.img, l.img.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)

	l.texto(titulo, formMargen, "Autorización de madre, padre o tutor legal", 56)
	l.y += 12
	l.texto(cuerpo, formMargen, eventoAutorizacionLinea, 36)
	l.y += 28
	l.rect(formMargen, l.y, formAncho-formMargen, l.y+3)

	l.y += 30
	l.texto(seccion, formMargen, "Datos del atleta menor de edad", 40)
	l.campo(cuerpo, "Nombre y apellidos:", d.Nombre)
	l.campo(cuerpo, "Fecha de nacimiento:", d.FechaNacimiento)
	l.campo(cuerpo, "Categoría:", d.Categoria)

	l.y += 40
	l.texto(seccion, formMargen, "Datos de la madre, padre o tutor legal", 40)
	l.campo(cuerpo, "Nombre y apellidos:", "")
	l.campo(cuerpo, "DNI / NIE:", "")
	l.campo(cuerpo, "Parentesco o relación con el menor:", "")
	l.campo(cuerpo, "Teléfono:", "")

	l.y += 40
	l.texto(seccion, formMargen, "Autorización", 40)
	l.y += 8
	l.texto(cuerpo, formMargen, "Como madre, padre o tutor legal del menor indicado arriba, AUTORIZO:", 36)
	l.y += 10
	l.texto(cuerpo, formMargen, "1. Su participación en la competición de powerlifting GRS Cup 2, que se celebra el 19 de diciembre de 2026 en Almussafes (Valencia).", 36)
	l.y += 10
	l.texto(cuerpo, formMargen, "2. Que la organización trate sus datos personales y utilice su imagen (fotografías y vídeos, su ficha pública de atleta, los resultados, la retransmisión en directo y los juegos de la competición, como la porra y el fantasy) para la gestión y la comunicación del evento.", 36)
	l.y += 10
	l.texto(cuerpo, formMargen, "Declaro que los datos de este documento son ciertos.", 36)

	l.y += 30
	l.campo(cuerpo, "Fecha:", "")
	l.y += 64
	d2 := &font.Drawer{Dst: l.img, Src: image.NewUniform(color.Black), Face: cuerpo, Dot: fixed.P(formMargen, l.y)}
	d2.DrawString("Firma de la madre, padre o tutor legal:")
	top, bottom := l.y+24, min(l.y+24+240, formAlto-formMargen)
	for _, r := range [][4]int{
		{formMargen, top, formAncho - formMargen, top + 3}, {formMargen, bottom - 3, formAncho - formMargen, bottom},
		{formMargen, top, formMargen + 3, bottom}, {formAncho - formMargen - 3, top, formAncho - formMargen, bottom},
	} {
		l.rect(r[0], r[1], r[2], r[3])
	}

	var b bytes.Buffer
	if err := png.Encode(&b, l.img); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
