package cms

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/storage"
)

func codigo(err error) string {
	var p *problem.Error
	if errors.As(err, &p) {
		return p.Code
	}
	return ""
}

func TestTipoMapa(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	var pngB, jpgB bytes.Buffer
	if err := png.Encode(&pngB, img); err != nil {
		t.Fatal(err)
	}
	if err := jpeg.Encode(&jpgB, img, nil); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		nombre    string
		datos     []byte
		tipo, ext string
		codigoErr string
	}{
		{"png", pngB.Bytes(), "image/png", ".png", ""},
		{"jpeg", jpgB.Bytes(), "image/jpeg", ".jpg", ""},
		{"pdf", []byte("%PDF-1.7\n1 0 obj"), "", "", "TIPO_NO_PERMITIDO"},
		{"html con extensión de imagen", []byte("<html><script>alert(1)</script></html>"), "", "", "TIPO_NO_PERMITIDO"},
		{"svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), "", "", "TIPO_NO_PERMITIDO"},
		{"vacío", nil, "", "", "TIPO_NO_PERMITIDO"},
		{"cabecera de png sin imagen", append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...), "", "", "IMAGEN_INVALIDA"},
		{"más de 10 MB", append(append([]byte{}, pngB.Bytes()...), make([]byte, maxMapa)...), "", "", "ARCHIVO_GRANDE"},
	} {
		tipo, ext, err := tipoMapa(c.datos)
		if tipo != c.tipo || ext != c.ext || codigo(err) != c.codigoErr {
			t.Errorf("%s: tipoMapa = (%q, %q, %q), se esperaba (%q, %q, %q)", c.nombre, tipo, ext, codigo(err), c.tipo, c.ext, c.codigoErr)
		}
	}
}

// Only the files this flow uploaded are deleted with their map: the key must be under «mapas/».
func TestClaveDeMapa(t *testing.T) {
	const cdn = "https://grcup.b-cdn.net"
	for url, quiere := range map[string]string{
		cdn + "/mapas/0198.png":           "mapas/0198.png",
		cdn + "/atletas/ana-12345678.jpg": "atletas/ana-12345678.jpg",
	} {
		if key, ok := storage.ClaveDeURL(cdn, url); !ok || key != quiere {
			t.Errorf("ClaveDeURL(%q) = %q, %v", url, key, ok)
		}
	}
	if _, ok := storage.ClaveDeURL(cdn, "https://otro.example.com/mapas/a.png"); ok {
		t.Error("una URL de otro host no pertenece al almacén")
	}
}
