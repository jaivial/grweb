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
//
// The body is scanned while the handler reads it (no copy of the whole body): at the first NUL the
// read fails, whatever the handler then writes is dropped and the 422 is answered instead.
func RejectNUL(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct := strings.ToLower(r.Header.Get("Content-Type"))
		if r.Body == nil || r.Body == http.NoBody || binario(ct) {
			next.ServeHTTP(w, r)
			return
		}
		sc := &nulScanner{rc: r.Body, form: strings.Contains(ct, "x-www-form-urlencoded")}
		r.Body = sc
		nw := &nulWriter{ResponseWriter: w, sc: sc}
		next.ServeHTTP(nw, r)
		if sc.hit && !nw.wrote {
			problem.Write(w, NULProblem(sc.head, "body"))
		}
	})
}

var errNUL = problem.Unprocessable("VALIDACION", "El texto contiene un carácter no permitido (NUL).")

// nulHead: bytes kept to locate the field holding NUL (only for the 422 location).
const nulHead = 64 << 10

// nulScanner passes the body through and fails the read at the first raw 0x00, JSON escape \u0000
// or (form) %00, even when the sequence is split across reads.
type nulScanner struct {
	rc   io.ReadCloser
	form bool
	esc  int // 0 none, 1 after '\\', 2.. after '\\u' + (esc-2) zeros
	pct  int // 0 none, 1 after '%', 2 after '%0'
	hit  bool
	head []byte
}

func (s *nulScanner) Close() error { return s.rc.Close() }

func (s *nulScanner) Read(p []byte) (int, error) {
	if s.hit {
		return 0, errNUL
	}
	n, err := s.rc.Read(p)
	if len(s.head) < nulHead {
		s.head = append(s.head, p[:min(n, nulHead-len(s.head))]...)
	}
	for _, c := range p[:n] {
		if c == 0 || s.step(c) {
			s.hit = true
			return 0, errNUL
		}
	}
	return n, err
}

// step advances the escape state machines; true when a NUL escape completes.
func (s *nulScanner) step(c byte) bool {
	switch {
	case s.esc == 0:
		if c == '\\' {
			s.esc = 1
		}
	case s.esc == 1:
		s.esc = 0
		if c == 'u' {
			s.esc = 2
		}
	case c == '0':
		if s.esc++; s.esc == 6 {
			return true
		}
	default:
		s.esc = 0
		if c == '\\' {
			s.esc = 1
		}
	}
	if s.form {
		switch {
		case c == '%':
			s.pct = 1
		case c == '0' && s.pct > 0:
			if s.pct++; s.pct == 3 {
				return true
			}
		default:
			s.pct = 0
		}
	}
	return false
}

// nulWriter drops the handler's response once the body was found holding NUL.
type nulWriter struct {
	http.ResponseWriter
	sc    *nulScanner
	wrote bool
}

func (w *nulWriter) WriteHeader(code int) {
	if w.sc.hit && !w.wrote {
		return
	}
	w.wrote = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *nulWriter) Write(b []byte) (int, error) {
	if w.sc.hit && !w.wrote {
		return len(b), nil
	}
	w.wrote = true
	return w.ResponseWriter.Write(b)
}

func (w *nulWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// NULProblem is the 422 VALIDACION for a JSON document b holding NUL; root prefixes the location.
func NULProblem(b []byte, root string) *problem.Error {
	p := problem.Unprocessable("VALIDACION", "El texto contiene un carácter no permitido (NUL).")
	p.Errors = []*huma.ErrorDetail{{Location: rutaNUL(b, root), Message: "carácter no permitido (U+0000)"}}
	return p
}

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

// binario: bodies that legitimately carry 0x00 bytes (files); their text parts are checked by the handler.
func binario(ct string) bool {
	ct = strings.TrimSpace(ct)
	for _, p := range []string{"multipart/", "image/", "audio/", "video/", "application/octet-stream", "application/pdf", "application/zip"} {
		if strings.HasPrefix(ct, p) {
			return true
		}
	}
	return false
}
