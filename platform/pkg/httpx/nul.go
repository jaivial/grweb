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

// RejectNUL answers 422 VALIDACION to any body holding a NUL character (U+0000): JSON (whatever the
// Content-Type casing/parameters, or none, since huma decodes it as JSON by default), form-urlencoded
// (%00) or any other text. PostgreSQL text cannot store it. Multipart bodies carry binary files, so
// their text parts are checked by the decoder of each handler (see HasNUL).
func RejectNUL(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct := strings.ToLower(r.Header.Get("Content-Type"))
		if r.Body == nil || r.Body == http.NoBody || strings.HasPrefix(strings.TrimSpace(ct), "multipart/") {
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
		if !HasNUL(b) && !(strings.Contains(ct, "x-www-form-urlencoded") && bytes.Contains(bytes.ToLower(b), []byte("%00"))) {
			next.ServeHTTP(w, r)
			return
		}
		problem.Write(w, NULProblem(b, "body"))
	})
}

// NULProblem is the 422 VALIDACION for a JSON document b holding NUL; root prefixes the location.
func NULProblem(b []byte, root string) *problem.Error {
	p := problem.Unprocessable("VALIDACION", "El texto contiene un carácter no permitido (NUL).")
	p.Errors = []*huma.ErrorDetail{{Location: rutaNUL(b, root), Message: "carácter no permitido (U+0000)"}}
	return p
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }

// HasNUL reports a raw 0x00 byte or a \u0000 escape inside a JSON string (an escaped backslash is skipped).
func HasNUL(b []byte) bool {
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

// rutaNUL returns the location (root.campo.0.x) of the first string holding NUL, or root.
func rutaNUL(b []byte, root string) string {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return root
	}
	if p, ok := buscaNUL(v, root); ok {
		return p
	}
	return root
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
