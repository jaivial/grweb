// Package bodylimit is the single table of request body limits above the 1 MiB default. Every service uses
// For(name) as its BodyLimitFor and the gateway uses Of with the service it routes to, so an upload route
// cannot be allowed by one and cut by the other (add new upload routes here only).
package bodylimit

import (
	"net/http"
	"strings"
)

// Default is the limit of every request not listed in Rules.
const Default = 1 << 20

// Limits of the upload routes (file + multipart overhead).
const (
	Foto   = 9 << 20  // athletes: 8 MB photo or signed authorisation
	Import = 6 << 20  // athletes: 5 MB AEP sheet
	Upload = 11 << 20 // cms: 10 MB image or PDF
	Sync   = 4 << 20  // openlifter: state of the table
	Intern = 2 << 20  // internal PUTs between services
)

// Rule raises the limit of Method + Path ("*" matches one segment; Path "**" every path of the service).
type Rule struct {
	Svc, Method, Path string
	Limit             int64
}

// Rules lists every route whose handler accepts more than Default.
var Rules = []Rule{
	{"athletes", http.MethodPost, "/api/admin/competiciones/*/atletas/importaciones", Import},
	{"athletes", http.MethodPost, "/api/area-atleta/foto", Foto},
	{"athletes", http.MethodPost, "/api/competiciones/*/alta-atleta", Foto},
	{"athletes", http.MethodPost, "/api/admin/competiciones/*/atletas/solicitudes/*/autorizacion", Foto},
	{"athletes", http.MethodPut, "/internal/competiciones/*/horarios", Intern},
	{"cms", http.MethodPost, "/api/admin/competiciones/*/medios", Upload},
	{"cms", http.MethodPost, "/api/admin/competiciones/*/web/mapas/imagen", Upload},
	{"cms", http.MethodPost, "/api/admin/competiciones/*/voluntarios/*/autorizacion", Upload},
	{"cms", http.MethodPost, "/internal/medios", Upload},
	{"live", http.MethodPut, "/internal/competiciones/*/directo/openlifter", Intern},
	{"openlifter", "", "**", Sync},
}

// For returns the BodyLimitFor of service svc (0 keeps the default).
func For(svc string) func(*http.Request) int64 {
	return func(r *http.Request) int64 { return Of(svc, r) }
}

// Of is the limit of r in service svc (0 when not listed).
func Of(svc string, r *http.Request) int64 {
	for _, x := range Rules {
		if x.Svc == svc && (x.Method == "" || x.Method == r.Method) && matches(x.Path, r.URL.Path) {
			return x.Limit
		}
	}
	return 0
}

func matches(pat, p string) bool {
	if pat == "**" {
		return true
	}
	a, b := strings.Split(pat, "/"), strings.Split(p, "/")
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] == "*" && b[i] == "" || a[i] != "*" && a[i] != b[i] {
			return false
		}
	}
	return true
}
