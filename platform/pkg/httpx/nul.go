package httpx

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// RejectNUL answers 422 VALIDACION to any JSON body holding a NUL character (U+0000) in a string:
// PostgreSQL text cannot store it, so it must never reach a handler of any service.
func RejectNUL(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || r.Body == http.NoBody || !strings.Contains(r.Header.Get("Content-Type"), "json") {
			next.ServeHTTP(w, r)
			return
		}
		b, err := io.ReadAll(r.Body)
		if err != nil {
			// the handler's decoder must see the same read error (e.g. too large → 413), not a truncated body
			r.Body = io.NopCloser(io.MultiReader(bytes.NewReader(b), errReader{err}))
			next.ServeHTTP(w, r)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(b))
		if !tieneNUL(b) {
			next.ServeHTTP(w, r)
			return
		}
		p := problem.Unprocessable("VALIDACION", "El texto contiene un carácter no permitido (NUL).")
		p.Errors = []*huma.ErrorDetail{{Location: rutaNUL(b), Message: "carácter no permitido (U+0000)"}}
		problem.Write(w, p)
	})
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }

// tieneNUL reports a raw 0x00 byte or a \u0000 escape inside a JSON string (an escaped backslash is skipped).
func tieneNUL(b []byte) bool {
	if bytes.IndexByte(b, 0) >= 0 {
		return true
	}
	if !bytes.Contains(b, []byte("u0000")) {
		return false
	}
	for i := 0; i < len(b); i++ {
		if b[i] != '\\' || i+1 >= len(b) {
			continue
		}
		if b[i+1] == 'u' && i+6 <= len(b) && string(b[i+2:i+6]) == "0000" {
			return true
		}
		i++ // skip the escaped character
	}
	return false
}

// rutaNUL returns the location (body.campo.0.x) of the first string holding NUL, or "body".
func rutaNUL(b []byte) string {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return "body"
	}
	if p, ok := buscaNUL(v, "body"); ok {
		return p
	}
	return "body"
}

func buscaNUL(v any, path string) (string, bool) {
	switch t := v.(type) {
	case string:
		return path, strings.IndexByte(t, 0) >= 0
	case map[string]any:
		for k, x := range t {
			if strings.IndexByte(k, 0) >= 0 {
				return path, true
			}
			if p, ok := buscaNUL(x, path+"."+k); ok {
				return p, true
			}
		}
	case []any:
		for i, x := range t {
			if p, ok := buscaNUL(x, path+"."+strconv.Itoa(i)); ok {
				return p, true
			}
		}
	}
	return "", false
}
