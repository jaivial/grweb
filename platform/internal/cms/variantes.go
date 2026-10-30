package cms

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/image/draw"
)

// Resized copies of the media library images, for grids and srcset («/api/medios/{id}?w=480»).
// Only these widths exist, so a client cannot fill the disk with arbitrary sizes. A copy is made once, on the first
// request, next to the original («<id>.jpg.w480.jpg») and served from disk afterwards.
var anchosVariante = map[int]bool{480: true, 960: true, 1600: true}

// At most two images are decoded and scaled at the same time (memory and CPU stay bounded on the first visit).
var semVariantes = make(chan struct{}, 2)

// Images above this many pixels are served as they are: decoding them could take gigabytes (the upload limit is on
// the file size, and a 10 MB PNG of a flat colour can be 20 000 × 20 000 px).
const maxPixelesVariante = 50_000_000

func rutaVariante(orig string, w int) string { return fmt.Sprintf("%s.w%d.jpg", orig, w) }

// variante returns the path of the w-wide JPEG copy of orig, creating it if needed. It returns orig itself when the
// image is not wider than w, when its type cannot be scaled (GIF, PDF) or when its EXIF orientation is a mirror.
func variante(orig, tipo string, w int) (string, error) {
	if !anchosVariante[w] || (tipo != "image/jpeg" && tipo != "image/png" && tipo != "image/webp") {
		return orig, nil
	}
	dst := rutaVariante(orig, w)
	if _, err := os.Stat(dst); err == nil {
		return dst, nil
	}
	semVariantes <- struct{}{}
	defer func() { <-semVariantes }()
	if _, err := os.Stat(dst); err == nil { // made by another request while this one waited
		return dst, nil
	}
	data, err := os.ReadFile(orig)
	if err != nil {
		return "", err
	}
	orient := 1
	if tipo == "image/jpeg" {
		orient = orientacionExif(data)
	}
	if orient == 2 || orient == 4 || orient == 5 || orient == 7 { // mirrored: rare, serve the original as it is
		return orig, nil
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	girada := orient == 6 || orient == 8 // stored sideways: the displayed width is the stored height
	visible := cfg.Width
	if girada {
		visible = cfg.Height
	}
	if visible <= w || cfg.Width*cfg.Height > maxPixelesVariante {
		return orig, nil
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	// scale first and rotate the small copy (rotating pixel by pixel at full size takes seconds and a second image)
	b := src.Bounds()
	tw, th := w, b.Dy()*w/b.Dx()
	if girada {
		tw, th = b.Dx()*w/b.Dy(), w
	}
	small := image.NewRGBA(image.Rect(0, 0, tw, th))
	draw.CatmullRom.Scale(small, small.Bounds(), src, b, draw.Src, nil)
	out := rotar(small, orient)
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".variante-*")
	if err != nil {
		return "", err
	}
	if err := jpeg.Encode(tmp, out, &jpeg.Options{Quality: 80}); err != nil {
		tmp.Close()
		_ = os.Remove(tmp.Name())
		return "", err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmp.Name())
		return "", err
	}
	return dst, os.Rename(tmp.Name(), dst)
}

// borrarVariantes removes the resized copies of orig (when the medio is deleted).
func borrarVariantes(orig string) {
	for w := range anchosVariante {
		_ = os.Remove(rutaVariante(orig, w))
	}
}

// rotar applies the EXIF orientations without mirroring (3: 180°, 6: 90° clockwise, 8: 90° counter-clockwise).
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

// orientacionExif reads the Orientation tag (0x0112) of a JPEG's EXIF block; 1 when there is none or it is unreadable.
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
