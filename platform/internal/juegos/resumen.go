package juegos

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// resumen.go: the two public summaries of the home (Figma 05 · «Section / Juegos · Porra de GRS» and «GRS Fantasy»).
// Anonymous, cached 10 s in process (one query per competition and pod every 10 s, whatever the traffic) and in the
// browser, never fan ids. Without any jornada they answer 200 with jornada null (the home hides the live numbers and
// keeps the call to action). The home refetches them when the public SSE announces a change.

const ttlResumen = 10 * time.Second

type opcionResumen struct {
	AtletaID uuid.UUID `json:"atletaId"`
	Nombre   string    `json:"nombre"`
	Cuota    float64   `json:"cuota,omitempty"`
}

type destacadoPorra struct {
	MercadoID uuid.UUID       `json:"mercadoId"`
	Titulo    string          `json:"titulo"`
	Sexo      string          `json:"sexo"`
	Categoria string          `json:"categoria,omitempty"`
	Bote      int64           `json:"bote"`
	Opciones  []opcionResumen `json:"opciones"`
}

type resumenPorra struct {
	Jornada          *jornadaOut `json:"jornada"`
	Bote             int64       `json:"bote"`
	Participantes    int         `json:"participantes"`
	MercadosAbiertos int         `json:"mercadosAbiertos"`
	// CierreAt is the close of the bets of the jornada (its «hora de cierre», backoffice juegos/config); null if unset.
	CierreAt   *time.Time        `json:"cierreAt"`
	Destacado  *destacadoPorra   `json:"destacado"`
	Top3       []filaPorraPublic `json:"top3"`
	ServerTime time.Time         `json:"serverTime"`
}

type atletaAlineacion struct {
	AtletaID    uuid.UUID `json:"atletaId"`
	Nombre      string    `json:"nombre"`
	Categoria   string    `json:"categoria"`
	Puntos      int       `json:"puntos"`
	Compitiendo bool      `json:"compitiendo"`
}

type alineacionDestacada struct {
	Alias   string             `json:"alias"`
	Puntos  int                `json:"puntos"`
	Atletas []atletaAlineacion `json:"atletas"`
}

// mejorNota is the leader of the jornada and their average score per jornada played (Figma «nota media»).
type mejorNota struct {
	Alias     string  `json:"alias"`
	NotaMedia float64 `json:"notaMedia"`
}

type resumenFantasy struct {
	Jornada             *jornadaOut          `json:"jornada"`
	EquiposCreados      int                  `json:"equiposCreados"`
	AtletasFichados     int                  `json:"atletasFichados"`
	MejorNota           *mejorNota           `json:"mejorNota"`
	Top3                []filaFantasyPublic  `json:"top3"`
	AlineacionDestacada *alineacionDestacada `json:"alineacionDestacada"`
	ServerTime          time.Time            `json:"serverTime"`
}

// memo is a tiny in-process cache with singleflight: concurrent misses of one key run the loader once.
type memo struct {
	mu sync.Mutex
	m  map[string]memoItem
	sf singleflight.Group
}

type memoItem struct {
	v   any
	exp time.Time
}

func (c *memo) get(key string, ttl time.Duration, load func() (any, error)) (any, error) {
	c.mu.Lock()
	if it, ok := c.m[key]; ok && time.Now().Before(it.exp) {
		c.mu.Unlock()
		return it.v, nil
	}
	c.mu.Unlock()
	v, err, _ := c.sf.Do(key, func() (any, error) {
		v, err := load()
		if err != nil {
			return nil, err
		}
		c.mu.Lock()
		if c.m == nil {
			c.m = map[string]memoItem{}
		}
		now := time.Now()
		for k, it := range c.m { // few keys (two per competition): sweep the expired ones on write
			if now.After(it.exp) {
				delete(c.m, k)
			}
		}
		c.m[key] = memoItem{v: v, exp: now.Add(ttl)}
		c.mu.Unlock()
		return v, nil
	})
	return v, err
}

// jornadaHome is the jornada the home shows: today's active one, else the next open one, else the last one.
func (s *Svc) jornadaHome(ctx context.Context, cid uuid.UUID) (*jornada, error) {
	if j, err := s.jornadaActiva(ctx, s.a.DB, cid); err != nil || j != nil {
		return j, err
	}
	j, err := scanJornada(s.a.DB.QueryRow(ctx, selJornada+` FROM jornadas WHERE competition_id = $1 AND estado <> 'borrador'
		ORDER BY (dia >= (now() AT TIME ZONE 'Europe/Madrid')::date) DESC,
		CASE WHEN dia >= (now() AT TIME ZONE 'Europe/Madrid')::date THEN dia END ASC, dia DESC LIMIT 1`, cid))
	if db.IsNoRows(err) {
		return nil, nil
	}
	return &j, err
}

func (s *Svc) cargarResumenPorra(ctx context.Context, cid uuid.UUID) (resumenPorra, error) {
	o := resumenPorra{Top3: []filaPorraPublic{}, ServerTime: time.Now()}
	j, err := s.jornadaHome(ctx, cid)
	if err != nil || j == nil {
		return o, err
	}
	o.Jornada = ptr(j.out())
	o.CierreAt = j.CierreAt
	ms, err := s.mercadosVista(ctx, cid, j)
	if err != nil {
		return o, err
	}
	var best *mercadoVista
	for i := range ms {
		m := &ms[i]
		// a market without options cannot take bets: it is not «open» for the home (QA U04-R1-12)
		if m.Estado != "abierto" || len(m.Opciones) == 0 {
			continue
		}
		o.MercadosAbiertos++
		o.Bote += m.Bote
		if best == nil || m.Bote > best.Bote {
			best = m
		}
	}
	if best != nil {
		d := &destacadoPorra{MercadoID: best.ID, Titulo: best.Titulo, Sexo: best.Sexo, Categoria: best.Categoria, Bote: best.Bote, Opciones: []opcionResumen{}}
		for _, op := range best.Opciones {
			if len(d.Opciones) == 4 { // Figma: four athlete cards
				break
			}
			d.Opciones = append(d.Opciones, opcionResumen{AtletaID: op.AtletaID, Nombre: op.Nombre, Cuota: op.Cuota})
		}
		o.Destacado = d
	}
	if err := s.a.DB.QueryRow(ctx, `SELECT count(DISTINCT fan_id) FROM apuestas WHERE jornada_id = $1`, j.ID).Scan(&o.Participantes); err != nil {
		return o, err
	}
	top, _ := s.rankingPorra(ctx, *j, uuid.Nil)
	if len(top) > 3 {
		top = top[:3]
	}
	o.Top3 = publicaPorra(top)
	return o, nil
}

func (s *Svc) cargarResumenFantasy(ctx context.Context, cid uuid.UUID) (resumenFantasy, error) {
	o := resumenFantasy{Top3: []filaFantasyPublic{}, ServerTime: time.Now()}
	j, err := s.jornadaHome(ctx, cid)
	if err != nil || j == nil {
		return o, err
	}
	o.Jornada = ptr(j.out())
	if err := s.a.DB.QueryRow(ctx, `SELECT count(DISTINCT dueno_fan_id), count(dueno_fan_id) FROM fantasy_atletas WHERE jornada_id = $1`, j.ID).
		Scan(&o.EquiposCreados, &o.AtletasFichados); err != nil {
		return o, err
	}
	todos, _ := s.rankingFantasy(ctx, *j, uuid.Nil)
	// only fans with a team (a wallet alone is not a team: QA U04-R1-13)
	top := make([]filaFantasy, 0, 3)
	for _, f := range todos {
		if len(top) == 3 {
			break
		}
		if f.Valor > 0 || f.Puntos != 0 {
			top = append(top, f)
		}
	}
	o.Top3 = publicaFantasy(top)
	if len(top) == 0 {
		return o, nil
	}
	lider := top[0]
	var media float64
	if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(avg(t), 0)::float8 FROM (SELECT sum(p.puntos) t FROM puntos p JOIN jornadas jj ON jj.id = p.jornada_id
		WHERE jj.competition_id = $1 AND p.fan_id = $2 GROUP BY p.jornada_id) x`, cid, lider.FanID).Scan(&media); err != nil {
		return o, err
	}
	o.MejorNota = &mejorNota{Alias: lider.Alias, NotaMedia: media}
	enCurso := map[uuid.UUID]bool{}
	if ats, err := s.mercadoFantasy(ctx, cid, *j, uuid.Nil); err == nil {
		for _, a := range ats {
			enCurso[a.AtletaID] = a.FlightEnCurso
		}
	}
	rows, err := s.a.DB.Query(ctx, `SELECT fa.atleta_id, fa.nombre_publico, fa.categoria, COALESCE(sum(p.puntos), 0)::int
		FROM fantasy_atletas fa
		LEFT JOIN puntos p ON p.jornada_id = fa.jornada_id AND p.atleta_id = fa.atleta_id AND p.fan_id = fa.dueno_fan_id
		WHERE fa.jornada_id = $1 AND fa.dueno_fan_id = $2 AND fa.titular
		GROUP BY fa.atleta_id, fa.nombre_publico, fa.categoria ORDER BY 4 DESC, 2 LIMIT 5`, j.ID, lider.FanID)
	if err != nil {
		return o, err
	}
	defer rows.Close()
	al := &alineacionDestacada{Alias: lider.Alias, Puntos: lider.Puntos, Atletas: []atletaAlineacion{}}
	for rows.Next() {
		var a atletaAlineacion
		if err := rows.Scan(&a.AtletaID, &a.Nombre, &a.Categoria, &a.Puntos); err != nil {
			return o, err
		}
		a.Compitiendo = enCurso[a.AtletaID]
		al.Atletas = append(al.Atletas, a)
	}
	o.AlineacionDestacada = al
	return o, rows.Err()
}

func (s *Svc) registerResumen() {
	api := s.a.API
	base := "/api/competiciones/{slug}/juegos"
	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type porraOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         resumenPorra
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-porra-resumen", Method: http.MethodGet, Path: base + "/porra/resumen",
		Summary: "Resumen público de la porra para la home: bote, cierre, participantes, mercado destacado y top 3", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*porraOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			v, err := s.resum.get("porra:"+c.ID.String(), ttlResumen, func() (any, error) {
				return s.cargarResumenPorra(context.WithoutCancel(ctx), c.ID)
			})
			if err != nil {
				return nil, err
			}
			return &porraOut{CacheControl: "public, max-age=10", Body: v.(resumenPorra)}, nil
		})

	type fantasyOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         resumenFantasy
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-resumen", Method: http.MethodGet, Path: base + "/fantasy/resumen",
		Summary: "Resumen público de GRS Fantasy para la home: equipos, mejor nota, top 3 y alineación del líder", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*fantasyOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			v, err := s.resum.get("fantasy:"+c.ID.String(), ttlResumen, func() (any, error) {
				return s.cargarResumenFantasy(context.WithoutCancel(ctx), c.ID)
			})
			if err != nil {
				return nil, err
			}
			return &fantasyOut{CacheControl: "public, max-age=10", Body: v.(resumenFantasy)}, nil
		})
}
