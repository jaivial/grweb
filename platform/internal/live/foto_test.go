package live

import "testing"

// The scoreboard passes the photo only for a public profile (athletes sends it only with image consent).
func TestFotoPublicaDelMarcador(t *testing.T) {
	a := &atleta{Publico: true, FotoURL: "https://cdn.example.com/a.jpg"}
	if got := fotoPublica(a); got != a.FotoURL {
		t.Fatalf("perfil público: %q", got)
	}
	a.Publico = false
	if got := fotoPublica(a); got != "" {
		t.Fatalf("perfil privado no debe llevar foto: %q", got)
	}
}
