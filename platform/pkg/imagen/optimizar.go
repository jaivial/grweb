package imagen

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"

	"golang.org/x/image/draw"
)

// MaxLadoFoto is the longest side of an optimised photo: 3 × the widest box the web shows it in (the athlete
// profile, ~520 CSS px), so it stays sharp on phones.
const MaxLadoFoto = 1600

// Optimizar returns the photo as it is published on the CDN: colour kept, EXIF orientation applied, the longest
// side at most maxLado, transparency flattened on black (the web is dark) and JPEG q82 without metadata. A 2.3 MB
// PNG of 1024 × 1536 becomes ~150-250 KB. Same input checks as EstandarizarBN.
func Optimizar(data []byte, maxLado int) ([]byte, error) {
	sem <- struct{}{}
	defer func() { <-sem }()

	if len(data) == 0 {
		return nil, ErrTipo
	}
	if len(data) > MaxBytes {
		return nil, ErrDemasiado
	}
	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	tipo := http.DetectContentType(head)
	switch tipo {
	case "image/jpeg", "image/png", "image/webp":
	default:
		return nil, ErrTipo
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, ErrDecodificar
	}
	if cfg.Width*cfg.Height > MaxPixeles {
		return nil, ErrMegapixeles
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrDecodificar
	}
	if tipo == "image/jpeg" {
		src = rotar(src, orientacionExif(data))
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if l := max(w, h); l > maxLado {
		w, h = max(1, w*maxLado/l), max(1, h*maxLado/l)
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.Black), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 82}); err != nil {
		return nil, ErrDecodificar
	}
	return buf.Bytes(), nil
}
