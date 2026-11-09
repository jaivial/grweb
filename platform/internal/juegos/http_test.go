package juegos

import (
	"net/http"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"

	"github.com/jaivial/grweb/platform/pkg/app"
)

// Smoke test: every endpoint registers against huma without schema errors (what would break at boot), and the
// fan session travels as cookie + header as the contract says (§3).
func TestRegistroEndpoints(t *testing.T) {
	mux := http.NewServeMux()
	api := humago.New(mux, huma.DefaultConfig("juegos-test", "test"))
	s := &Svc{a: &app.App{API: api}}
	s.registerPublic()
	s.registerAdmin()
	b, err := api.OpenAPI().YAML()
	if err != nil {
		t.Fatal(err)
	}
	for _, querido := range []string{"grcup_fan", "X-GrCup-Fan", "/juegos/porra/apuestas", "/juegos/fantasy/clausulazo", "/juegos/cartera"} {
		if !strings.Contains(string(b), querido) {
			t.Fatalf("el OpenAPI no incluye %q", querido)
		}
	}
}
