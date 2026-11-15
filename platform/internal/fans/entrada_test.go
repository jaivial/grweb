package fans

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

// huma only fills parameters of EXPORTED embedded structs: with unexported ones (sesionIn, slugIn) the slug and
// the session arrive empty and every endpoint fails. This guards the input types of the service.
func TestEntradasEmbebidasSeRellenan(t *testing.T) {
	mux := http.NewServeMux()
	api := humago.New(mux, huma.DefaultConfig("t", "1"))
	type in struct {
		SesionIn
		SlugIn
	}
	type out struct {
		Body struct{ Session, Header, Slug string }
	}
	huma.Register(api, huma.Operation{OperationID: "x", Method: http.MethodGet, Path: "/api/competiciones/{slug}/fans/x"},
		func(_ context.Context, i *in) (*out, error) {
			o := &out{}
			o.Body.Session, o.Body.Header, o.Body.Slug = i.Session, i.Header, i.Slug
			return o, nil
		})
	r := httptest.NewRequest(http.MethodGet, "/api/competiciones/grcup/fans/x", nil)
	r.AddCookie(&http.Cookie{Name: "grcup_fan", Value: "tok"})
	r.Header.Set("X-GrCup-Fan", "hdr")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	var got struct{ Session, Header, Slug string }
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.Session != "tok" || got.Header != "hdr" || got.Slug != "grcup" {
		t.Fatalf("entradas embebidas = %+v (%d %s)", got, w.Code, w.Body.String())
	}
}

// The destination of a magic link is an internal fantasy route or nothing: no open redirect (BIZ-143).
func TestNextValido(t *testing.T) {
	for _, ok := range []string{"/fantasy", "/fantasy/salas", "/fantasy/unirse/ABCD2345XY", "/fantasy/salas/0198c1a2-7b3c-7def-8123-456789abcdef"} {
		if nextValido(ok) != ok {
			t.Fatalf("nextValido(%q) debía aceptarse", ok)
		}
	}
	for _, malo := range []string{"", "https://evil.example/fantasy", "//evil.example/fantasy", "/fantasy/../admin", "/fantasy?next=//evil.example",
		"/fantasy#x", "/fantasyevil", "/en-directo", "fantasy/salas", "/fantasy//evil.example", "/fantasy/\\evil", "/fantasy/unirse/ABC%2F..", "javascript:alert(1)",
		"/fantasy/" + strings.Repeat("a", 200)} {
		if got := nextValido(malo); got != "" {
			t.Fatalf("nextValido(%q) = %q; debía rechazarse", malo, got)
		}
	}
}
