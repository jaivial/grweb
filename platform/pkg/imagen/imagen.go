// Package imagen processes the athlete photos of the public «alta de atleta» form: every photo is
// turned into the same black-and-white editorial piece (luminance BT.601 + soft S curve, 4:5 crop
// around the focal point, 960×1200 CatmullRom, JPEG grayscale q85 without metadata).
//
// It is pure Go (no cgo), so the distroless image of the services does not change. Only the
// processed file is kept: the original is never stored (it would carry EXIF/GPS and a face in
// full resolution without a published consent).
package imagen

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"net/http"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	_ "image/png" // decoders registered for image.Decode
)

// Errors returned by EstandarizarBN.
var (
	// ErrTipo: the file is not a JPEG, PNG or WebP (checked by magic bytes).
	ErrTipo = errors.New("el fichero no es una imagen admitida (JPG, PNG o WebP)")
	// ErrMegapixeles: the image declares more than MaxPixeles pixels (decompression bomb).
	ErrMegapixeles = errors.New("la imagen es demasiado grande")
	// ErrDecodificar: the bytes say «image» but they cannot be decoded.
	ErrDecodificar = errors.New("no se ha podido leer la imagen")
	// ErrDemasiado: the file is bigger than MaxBytes.
	ErrDemasiado = errors.New("la imagen supera el tamaño máximo")
)

// Size of the published piece and safety limits.
const (
	Ancho       = 960
	Alto        = 1200
	MaxPixeles  = 48_000_000
	MaxBytes    = 12 << 20
	calidadJPEG = 85
)

// sem limits how many photos are processed at the same time (memory and CPU stay bounded).
var sem = make(chan struct{}, 2)

// EstandarizarBN returns the standard black-and-white JPEG of a photo (960×1200, grayscale,
// q85, no metadata). focalX/focalY are the focus of the crop in percent (50/35 by default).
func EstandarizarBN(r io.Reader, focalX, focalY int) ([]byte, error) {
	sem <- struct{}{}
	defer func() { <-sem }()

	data, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
	if err != nil {
		return nil, ErrDecodificar
	}
	if len(data) > MaxBytes {
		return nil, ErrDemasiado
	}
	if len(data) == 0 {
		return nil, ErrTipo
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
	orient := 1
	if tipo == "image/jpeg" {
		orient = orientacionExif(data)
	}
	src = rotar(src, orient)
	gris := aGris(src)
	rec := recorta(gris, focalX, focalY)
	dst := image.NewGray(image.Rect(0, 0, Ancho, Alto))
	draw.CatmullRom.Scale(dst, dst.Bounds(), rec, rec.Bounds(), draw.Src, nil)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: calidadJPEG}); err != nil {
		return nil, ErrDecodificar
	}
	return buf.Bytes(), nil
}

// lut is the tone curve: identity + 35 % of smoothstep (contrast in the shadows and the lights
// without burning the mid tones) and a 1.5 % sink of the blacks.
var lut = func() [256]uint8 {
	var t [256]uint8
	for i := range t {
		x := float64(i) / 255
		s := x * x * (3 - 2*x) // smoothstep
		y := x + 0.35*(s-x) - 0.015
		if y < 0 {
			y = 0
		}
		if y > 1 {
			y = 1
		}
		t[i] = uint8(y*255 + 0.5)
	}
	return t
}()

// aGris converts to grayscale with the BT.601 luminance and applies the tone curve.
func aGris(src image.Image) *image.Gray {
	b := src.Bounds()
	dst := image.NewGray(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			r, g, bl, _ := src.At(b.Min.X+x, b.Min.Y+y).RGBA()
			// BT.601 luma in 16 bits (the same coefficients Go's color.GrayModel uses).
			y16 := (19595*r + 38470*g + 7471*bl + 1<<15) >> 16
			dst.Pix[y*dst.Stride+x] = lut[y16>>8]
		}
	}
	return dst
}

// recorta cuts the 4:5 window around the focal point (50 % of the width, 35 % of the height).
func recorta(src *image.Gray, focalX, focalY int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	ch := h
	cw := int(float64(h) * (float64(Ancho) / float64(Alto)))
	if cw > w {
		cw = w
		ch = int(float64(w) * (float64(Alto) / float64(Ancho)))
	}
	if cw < 1 {
		cw = 1
	}
	if ch < 1 {
		ch = 1
	}
	fx := float64(w) * float64(clampPct(focalX)) / 100
	fy := float64(h) * float64(clampPct(focalY)) / 100
	x := int(fx - float64(cw)*0.5)
	y := int(fy - float64(ch)*0.35)
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if x+cw > w {
		x = w - cw
	}
	if y+ch > h {
		y = h - ch
	}
	return src.SubImage(image.Rect(b.Min.X+x, b.Min.Y+y, b.Min.X+x+cw, b.Min.Y+y+ch))
}

func clampPct(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// rotar applies the EXIF orientations without mirroring (3: 180°, 6: 90° clockwise, 8: 90°
// counter-clockwise). Mirrored orientations (2, 4, 5, 7) are left as they are.
func rotar(src image.Image, orient int) image.Image {
	if orient != 3 && orient != 6 && orient != 8 {
		return src
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	var dst *image.RGBA
	if orient == 3 {
		dst = image.NewRGBA(image.Rect(0, 0, w, h))
	} else {
		dst = image.NewRGBA(image.Rect(0, 0, h, w))
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := src.At(b.Min.X+x, b.Min.Y+y)
			switch orient {
			case 3:
				dst.Set(w-1-x, h-1-y, c)
			case 6:
				dst.Set(h-1-y, x, c)
			case 8:
				dst.Set(y, w-1-x, c)
			}
		}
	}
	return dst
}

// orientacionExif reads the Orientation tag (0x0112) of a JPEG's EXIF block; 1 when there is
// none or it is unreadable.
func orientacionExif(data []byte) int {
	r := bytes.NewReader(data)
	var soi [2]byte
	if _, err := io.ReadFull(r, soi[:]); err != nil || soi != [2]byte{0xFF, 0xD8} {
		return 1
	}
	for {
		var m [4]byte
		if _, err := io.ReadFull(r, m[:]); err != nil || m[0] != 0xFF {
			return 1
		}
		n := int(binary.BigEndian.Uint16(m[2:])) - 2
		if n < 0 {
			return 1
		}
		if m[1] == 0xDA { // start of scan: no EXIF before the image data
			return 1
		}
		seg := make([]byte, n)
		if _, err := io.ReadFull(r, seg); err != nil {
			return 1
		}
		if m[1] != 0xE1 || len(seg) < 14 || string(seg[:6]) != "Exif\x00\x00" {
			continue
		}
		t := seg[6:]
		var bo binary.ByteOrder
		switch string(t[:2]) {
		case "II":
			bo = binary.LittleEndian
		case "MM":
			bo = binary.BigEndian
		default:
			return 1
		}
		ifd := int(bo.Uint32(t[4:8]))
		if ifd+2 > len(t) {
			return 1
		}
		cnt := int(bo.Uint16(t[ifd:]))
		for i := 0; i < cnt; i++ {
			e := ifd + 2 + i*12
			if e+12 > len(t) {
				return 1
			}
			if bo.Uint16(t[e:]) == 0x0112 {
				if v := int(bo.Uint16(t[e+8:])); v >= 1 && v <= 8 {
					return v
				}
				return 1
			}
		}
		return 1
	}
}
