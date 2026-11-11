package athletes

// Own places of each competition of the alta (Backoffice › Atletas › Solicitudes) and the short
// in-memory cache of the public config of the form.

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"golang.org/x/sync/singleflight"
)

// configTTL: the stable part of the public config (competition, state, legal texts and places) is
// shared for a short time; the antibot challenge and the time token are always new.
const configTTL = 2 * time.Second

type configMemo struct {
	mu  sync.Mutex
	m   map[string]configEntrada
	grp singleflight.Group
}

type configEntrada struct {
	v   ConfigAlta
	exp time.Time
}

// get returns the cached value of the key or runs the loader once for all the concurrent misses.
func (c *configMemo) get(key string, load func() (ConfigAlta, error)) (ConfigAlta, error) {
	c.mu.Lock()
	if e, ok := c.m[key]; ok && time.Now().Before(e.exp) {
		c.mu.Unlock()
		return e.v, nil
	}
	c.mu.Unlock()
	v, err, _ := c.grp.Do(key, func() (any, error) {
		v, err := load()
		if err != nil {
			return v, err
		}
		c.mu.Lock()
		if c.m == nil {
			c.m = map[string]configEntrada{}
		}
		c.m[key] = configEntrada{v: v, exp: time.Now().Add(configTTL)}
		c.mu.Unlock()
		return v, nil
	})
	if err != nil {
		return ConfigAlta{}, err
	}
	return v.(ConfigAlta), nil
}

// CupoPrueba is the own places of one competition of the alta.
type CupoPrueba struct {
	Codigo     string `json:"codigo"`
	Nombre     string `json:"nombre"`
	Plazas     int    `json:"plazas"`
	Ocupadas   int    `json:"ocupadas"`
	PorDefecto bool   `json:"porDefecto" doc:"Sin cupo propio: plazas totales / número de pruebas"`
}

func (s *Svc) listaCupos(ctx context.Context, cid uuid.UUID) ([]CupoPrueba, error) {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return nil, err
	}
	propios := map[string]bool{}
	rows, err := s.a.DB.Query(ctx, `SELECT prueba FROM alta_cupos WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			propios[k] = true
		}
	}
	rows.Close()
	cupo := s.cupos(ctx, s.a.DB, cid, c.Inscripcion.Plazas)
	ocup := ocupadas(ctx, s.a.DB, cid)
	out := make([]CupoPrueba, 0, len(pruebasAlta))
	for _, p := range pruebasAlta {
		out = append(out, CupoPrueba{Codigo: p.codigo, Nombre: p.nombre, Plazas: cupo[p.codigo], Ocupadas: ocup[p.codigo], PorDefecto: !propios[p.codigo]})
	}
	return out, nil
}

func (s *Svc) registerAltaCupos() {
	api := s.a.API
	path := "/api/admin/competiciones/{cid}/atletas/solicitudes/cupos"
	type cuposIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type cuposOut struct {
		Body struct {
			Cupos []CupoPrueba `json:"cupos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-cupos", Method: http.MethodGet, Path: path,
		Summary: "Cupo propio de cada competición del alta", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cuposIn) (*cuposOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			out := &cuposOut{}
			var err error
			out.Body.Cupos, err = s.listaCupos(ctx, in.CID)
			return out, err
		})
	type guardaIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Cupos map[string]int `json:"cupos" doc:"Plazas por código de prueba (aep2, aep3)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-cupos-guardar", Method: http.MethodPut, Path: path,
		Summary: "Guardar el cupo propio de cada competición del alta", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *guardaIn) (*cuposOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			for k, n := range in.Body.Cupos {
				if k == "" || !pruebaValida(k) || n < 0 || n > 100000 {
					return nil, problem.Unprocessable("CUPO_NO_VALIDO", "Cupo no válido: "+k)
				}
			}
			ocup := ocupadas(ctx, s.a.DB, in.CID)
			for k, n := range in.Body.Cupos {
				if n > 0 && n < ocup[k] {
					return nil, problem.Unprocessable("CUPO_MENOR_QUE_OCUPADAS",
						fmt.Sprintf("El cupo de %s no puede ser menor que las plazas ya ocupadas (%d).", pruebaTexto(k), ocup[k]))
				}
			}
			for k, n := range in.Body.Cupos {
				if _, err := s.a.DB.Exec(ctx, `INSERT INTO alta_cupos (competition_id, prueba, plazas) VALUES ($1,$2,$3)
					ON CONFLICT (competition_id, prueba) DO UPDATE SET plazas = EXCLUDED.plazas, updated_at = now()`, in.CID, k, n); err != nil {
					return nil, err
				}
			}
			s.a.Log.Info("cupos del alta guardados", "competicion", in.CID.String(), "cupos", in.Body.Cupos)
			out := &cuposOut{}
			var err error
			out.Body.Cupos, err = s.listaCupos(ctx, in.CID)
			return out, err
		})
}
