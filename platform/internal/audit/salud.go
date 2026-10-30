package audit

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
)

// Servicio is the state of a service of the platform (its /readyz: database and Redis reachable).
type Servicio struct {
	Nombre string `json:"nombre"`
	OK     bool   `json:"ok"`
	Ms     int64  `json:"ms"`
	Error  string `json:"error,omitempty"`
}

// Grupo is a consumer group of the event stream: how far behind it is.
type Grupo struct {
	Nombre     string `json:"nombre"`
	Pendientes int64  `json:"pendientes" doc:"Entregados y aún sin confirmar"`
	Retraso    int64  `json:"retraso" doc:"Eventos por leer"`
	Consumers  int64  `json:"consumers"`
}

// Salud is «Sistema › Salud» (Figma 64).
type Salud struct {
	Servicios    []Servicio `json:"servicios"`
	Grupos       []Grupo    `json:"grupos"`
	Eventos      int64      `json:"eventos" doc:"Longitud del stream de eventos"`
	Espectadores int        `json:"espectadores" doc:"Conexiones SSE públicas de esta competición"`
	Generado     time.Time  `json:"generado"`
}

// The gateway is not listed: this request came through it (and its network policy only admits web traffic).
var servicios = []string{"identity", "competition", "cms", "athletes", "schedule", "live", "ticketing", "raffle", "crm", "messaging", "ai", "realtime"}

func (s *Svc) salud(ctx context.Context, cid uuid.UUID) Salud {
	o := Salud{Generado: time.Now().UTC(), Servicios: make([]Servicio, len(servicios)), Grupos: []Grupo{}}
	var wg sync.WaitGroup
	cli := &http.Client{Timeout: 3 * time.Second}
	for i, n := range servicios {
		wg.Add(1)
		go func(i int, n string) {
			defer wg.Done()
			url := strings.TrimRight(config.Str("UPSTREAM_"+strings.ToUpper(n), "http://"+n+":8080"), "/") + "/readyz"
			t0 := time.Now()
			sv := Servicio{Nombre: n}
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			res, err := cli.Do(req)
			sv.Ms = time.Since(t0).Milliseconds()
			switch {
			case err != nil:
				sv.Error = "no responde"
			case res.StatusCode >= 300:
				sv.Error = "HTTP " + strconv.Itoa(res.StatusCode)
				res.Body.Close()
			default:
				sv.OK = true
				res.Body.Close()
			}
			o.Servicios[i] = sv
		}(i, n)
	}
	wg.Wait()
	if n, err := s.a.Redis.XLen(ctx, s.a.Stream()).Result(); err == nil {
		o.Eventos = n
	}
	if gs, err := s.a.Redis.XInfoGroups(ctx, s.a.Stream()).Result(); err == nil {
		for _, g := range gs {
			o.Grupos = append(o.Grupos, Grupo{Nombre: g.Name, Pendientes: g.Pending, Retraso: g.Lag, Consumers: g.Consumers})
		}
		sort.Slice(o.Grupos, func(i, j int) bool { return o.Grupos[i].Nombre < o.Grupos[j].Nombre })
	}
	// public SSE connections reported by the realtime pods (set of pods + one counter each)
	if pods, err := s.a.Redis.SMembers(ctx, s.a.Keys.Of("rt", "pods", cid.String())).Result(); err == nil && len(pods) > 0 {
		keys := make([]string, len(pods))
		for i, p := range pods {
			keys[i] = s.a.Keys.Of("rt", "conexiones", cid.String(), p)
		}
		if vals, err := s.a.Redis.MGet(ctx, keys...).Result(); err == nil {
			for _, v := range vals {
				if str, ok := v.(string); ok {
					n, _ := strconv.Atoi(str)
					o.Espectadores += n
				}
			}
		}
	}
	return o
}

func (s *Svc) registerSalud() {
	type in struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "sistema-salud", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/sistema/salud", Summary: "Salud: servicios, bus de eventos y conexiones en tiempo real", Tags: tagAudit, Security: bearer},
		func(ctx context.Context, in *in) (*struct{ Body Salud }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			return &struct{ Body Salud }{s.salud(ctx, in.CID)}, nil
		})
}

var _ = redis.Nil
