// Package httpx holds the net/http middleware shared by all services.
package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

type ctxKey int

const (
	requestIDKey ctxKey = iota
	clientIPKey
	originKey
)

// Middleware wraps an http.Handler.
type Middleware func(http.Handler) http.Handler

// Chain applies middlewares so the first one is the outermost.
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// RequestID reads X-Request-Id or creates one, and echoes it in the response.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" || len(id) > 64 {
			b := make([]byte, 8)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
			r.Header.Set("X-Request-Id", id)
		}
		w.Header().Set("X-Request-Id", id)
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		ctx = context.WithValue(ctx, clientIPKey, clientIP(r))
		ctx = context.WithValue(ctx, originKey, origin(r))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequestIDFrom returns the request id stored by RequestID.
func RequestIDFrom(ctx context.Context) string { s, _ := ctx.Value(requestIDKey).(string); return s }

// ClientIPFrom returns the client IP (first X-Forwarded-For hop set by nginx/gateway, else RemoteAddr).
func ClientIPFrom(ctx context.Context) string { s, _ := ctx.Value(clientIPKey).(string); return s }

// OriginFrom returns the declared client origin: web | cli | mcp (X-GrCup-Origen).
func OriginFrom(ctx context.Context) string { s, _ := ctx.Value(originKey).(string); return s }

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if xr := r.Header.Get("X-Real-Ip"); xr != "" {
		return xr
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func origin(r *http.Request) string {
	switch o := strings.ToLower(r.Header.Get("X-GrCup-Origen")); o {
	case "cli", "mcp", "web":
		return o
	default:
		return "web"
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }
func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

// Flush keeps SSE streaming working through the wrapper.
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Logger logs one structured line per request (never bodies or tokens).
func Logger(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
				next.ServeHTTP(w, r)
				return
			}
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(sw, r)
			lvl := slog.LevelInfo
			if sw.status >= 500 {
				lvl = slog.LevelError
			}
			log.LogAttrs(r.Context(), lvl, "http",
				slog.String("method", r.Method), slog.String("path", RedactPath(r.URL.Path)), slog.Int("status", sw.status),
				slog.Int("bytes", sw.bytes), slog.Duration("dur", time.Since(start)),
				slog.String("request_id", RequestIDFrom(r.Context())), slog.String("origin", OriginFrom(r.Context())))
		})
	}
}

// secretPaths carry one-time credentials as their next path segment (magic links, invitations,
// unsubscribe and ticket links). They are never logged.
var secretPaths = []string{"/api/auth/magic/", "/api/auth/invitaciones/", "/api/baja/", "/api/mi-entrada/"}

// RedactPath replaces secret path segments with ":token" (keeps fixed segments such as "aceptar").
func RedactPath(p string) string {
	for _, prefix := range secretPaths {
		if rest, ok := strings.CutPrefix(p, prefix); ok && rest != "" {
			seg, tail, _ := strings.Cut(rest, "/")
			if seg == "aceptar" {
				return p
			}
			if tail != "" {
				return prefix + ":token/" + tail
			}
			return prefix + ":token"
		}
	}
	return p
}

// Recover turns panics into 500 problem responses.
func Recover(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					if v == http.ErrAbortHandler {
						panic(v)
					}
					log.Error("panic", "err", v, "stack", string(debug.Stack()), "request_id", RequestIDFrom(r.Context()))
					problem.Write(w, problem.Internal())
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// MaxBody limits request bodies (default protection; uploads raise it per route).
func MaxBody(n int64) Middleware { return MaxBodyFor(n, nil) }

// MaxBodyFor is MaxBody with a per-request override (a non-zero value from fn replaces n).
func MaxBodyFor(n int64, fn func(*http.Request) int64) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				limit := n
				if fn != nil {
					if v := fn(r); v > 0 {
						limit = v
					}
				}
				r.Body = http.MaxBytesReader(w, r.Body, limit)
			}
			next.ServeHTTP(w, r)
		})
	}
}
