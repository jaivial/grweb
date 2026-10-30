package httpx

import (
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

// Metrics counts requests by method, route pattern and status class and keeps a latency histogram per route, served
// as Prometheus text at /metrics (internal port only: the gateway proxies /api). No dependencies.
type Metrics struct {
	mu     sync.Mutex
	rutas  map[string]*serie
	inicio time.Time
}

type serie struct {
	codigos map[string]uint64 // 2xx · 3xx · 4xx · 5xx
	cubos   []uint64          // cumulative per bucket
	suma    float64
	total   uint64
}

var cubos = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5}

// NewMetrics returns an empty registry.
func NewMetrics() *Metrics { return &Metrics{rutas: map[string]*serie{}, inicio: time.Now()} }

type metricWriter struct {
	http.ResponseWriter
	code int
}

func (w *metricWriter) WriteHeader(c int)           { w.code = c; w.ResponseWriter.WriteHeader(c) }
func (w *metricWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Middleware records every request except the probes and /metrics itself. SSE streams are recorded when they end.
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/healthz", "/readyz", "/metrics":
			next.ServeHTTP(w, r)
			return
		}
		sw := &metricWriter{ResponseWriter: w, code: http.StatusOK}
		t0 := time.Now()
		next.ServeHTTP(sw, r)
		ruta := r.Pattern // set by http.ServeMux (huma registers its operations there)
		if ruta == "" {
			ruta = r.Method + " (sin ruta)"
		}
		m.observar(ruta, sw.code, time.Since(t0).Seconds())
	})
}

func (m *Metrics) observar(ruta string, code int, seg float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.rutas[ruta]
	if s == nil {
		s = &serie{codigos: map[string]uint64{}, cubos: make([]uint64, len(cubos))}
		m.rutas[ruta] = s
	}
	s.codigos[fmt.Sprintf("%dxx", code/100)]++
	for i, c := range cubos {
		if seg <= c {
			s.cubos[i]++
		}
	}
	s.suma += seg
	s.total++
}

// Handler serves the metrics in Prometheus text format.
func (m *Metrics) Handler(servicio string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		var b strings.Builder
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		fmt.Fprintf(&b, "# TYPE grcup_up gauge\ngrcup_up{servicio=%q} 1\n", servicio)
		fmt.Fprintf(&b, "# TYPE grcup_uptime_seconds gauge\ngrcup_uptime_seconds{servicio=%q} %.0f\n", servicio, time.Since(m.inicio).Seconds())
		fmt.Fprintf(&b, "# TYPE go_goroutines gauge\ngo_goroutines %d\n", runtime.NumGoroutine())
		fmt.Fprintf(&b, "# TYPE go_memstats_heap_alloc_bytes gauge\ngo_memstats_heap_alloc_bytes %d\n", ms.HeapAlloc)
		fmt.Fprintf(&b, "# TYPE go_gc_cycles_total counter\ngo_gc_cycles_total %d\n", ms.NumGC)
		m.mu.Lock()
		rutas := make([]string, 0, len(m.rutas))
		for r := range m.rutas {
			rutas = append(rutas, r)
		}
		sort.Strings(rutas)
		b.WriteString("# TYPE grcup_http_requests_total counter\n")
		for _, r := range rutas {
			for c, n := range m.rutas[r].codigos {
				fmt.Fprintf(&b, "grcup_http_requests_total{servicio=%q,ruta=%q,codigo=%q} %d\n", servicio, r, c, n)
			}
		}
		b.WriteString("# TYPE grcup_http_request_duration_seconds histogram\n")
		for _, r := range rutas {
			s := m.rutas[r]
			for i, c := range cubos {
				fmt.Fprintf(&b, "grcup_http_request_duration_seconds_bucket{servicio=%q,ruta=%q,le=\"%g\"} %d\n", servicio, r, c, s.cubos[i])
			}
			fmt.Fprintf(&b, "grcup_http_request_duration_seconds_bucket{servicio=%q,ruta=%q,le=\"+Inf\"} %d\n", servicio, r, s.total)
			fmt.Fprintf(&b, "grcup_http_request_duration_seconds_sum{servicio=%q,ruta=%q} %g\n", servicio, r, s.suma)
			fmt.Fprintf(&b, "grcup_http_request_duration_seconds_count{servicio=%q,ruta=%q} %d\n", servicio, r, s.total)
		}
		m.mu.Unlock()
		_, _ = w.Write([]byte(b.String()))
	})
}

// P95 is the 95th percentile latency (seconds, bucket upper bound) of all routes together, and the request count.
func (m *Metrics) P95() (float64, uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	acc := make([]uint64, len(cubos))
	var total uint64
	for _, s := range m.rutas {
		for i := range cubos {
			acc[i] += s.cubos[i]
		}
		total += s.total
	}
	if total == 0 {
		return 0, 0
	}
	obj := uint64(float64(total) * 0.95)
	for i, c := range cubos {
		if acc[i] >= obj {
			return c, total
		}
	}
	return cubos[len(cubos)-1], total
}

// Flush keeps SSE streaming working through the wrapper.
func (w *metricWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
