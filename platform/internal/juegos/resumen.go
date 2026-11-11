package juegos

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/db"
)

// resumen.go: the two public summaries of the home (Figma 05 · «Section / Juegos · Porra de GRS» and «GRS Fantasy»).
// Anonymous, cached 10 s, never fan ids. Without any jornada they answer 200 with jornada null (the home hides the
// live numbers and keeps the call to action).

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
	Jornada          *jornadaOut       `json:"jornada"`
	Bote             int64             `json:"bote"`
	Participantes    int               `json:"participantes"`
	MercadosAbiertos int               `json:"mercadosAbiertos"`
	Destacado        *destacadoPorra   `json:"destacado"`
	Top3             []filaPorraPublic `json:"top3"`
	ServerTime       time.Time         `json:"serverTime"`
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

type resumenFantasy struct {
	Jornada             *jornadaOut          `json:"jornada"`
	EquiposCreados      int                  `json:"equiposCreados"`
	AtletasFichados     int                  `json:"atletasFichados"`
	Top3                []filaFantasyPublic  `json:"top3"`
	AlineacionDestacada *alineacionDestacada `json:"alineacionDestacada"`
	ServerTime          time.Time            `json:"serverTime"`
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
		Summary: "Resumen público de la porra para la home: bote, participantes, mercado destacado y top 3", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*porraOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			o := &porraOut{CacheControl: "public, max-age=10"}
			o.Body = resumenPorra{Top3: []filaPorraPublic{}, ServerTime: time.Now()}
			j, err := s.jornadaHome(ctx, c.ID)
			if err != nil || j == nil {
				return o, err
			}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			ms, err := s.mercadosVista(ctx, c.ID, j)
			if err != nil {
				return nil, err
			}
			var best *mercadoVista
			for i := range ms {
				m := &ms[i]
				if m.Estado != "abierto" {
					continue
				}
				o.Body.MercadosAbiertos++
				o.Body.Bote += m.Bote
				if best == nil || m.Bote > best.Bote {
					best = m
				}
			}
			if best != nil {
				d := &destacadoPorra{MercadoID: best.ID, Titulo: best.Titulo, Sexo: best.Sexo, Categoria: best.Categoria, Bote: best.Bote, Opciones: []opcionResumen{}}
				for _, op := range best.Opciones {
					if len(d.Opciones) == 3 {
						break
					}
					d.Opciones = append(d.Opciones, opcionResumen{AtletaID: op.AtletaID, Nombre: op.Nombre, Cuota: op.Cuota})
				}
				o.Body.Destacado = d
			}
			if err := s.a.DB.QueryRow(ctx, `SELECT count(DISTINCT fan_id) FROM apuestas WHERE jornada_id = $1`, j.ID).Scan(&o.Body.Participantes); err != nil {
				return nil, err
			}
			top, _ := s.rankingPorra(ctx, *j, uuid.Nil)
			if len(top) > 3 {
				top = top[:3]
			}
			o.Body.Top3 = publicaPorra(top)
			return o, nil
		})

	type fantasyOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         resumenFantasy
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-resumen", Method: http.MethodGet, Path: base + "/fantasy/resumen",
		Summary: "Resumen público de GRS Fantasy para la home: equipos, top 3 y alineación del líder", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*fantasyOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			o := &fantasyOut{CacheControl: "public, max-age=10"}
			o.Body = resumenFantasy{Top3: []filaFantasyPublic{}, ServerTime: time.Now()}
			j, err := s.jornadaHome(ctx, c.ID)
			if err != nil || j == nil {
				return o, err
			}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			if err := s.a.DB.QueryRow(ctx, `SELECT count(DISTINCT dueno_fan_id), count(dueno_fan_id) FROM fantasy_atletas WHERE jornada_id = $1`, j.ID).
				Scan(&o.Body.EquiposCreados, &o.Body.AtletasFichados); err != nil {
				return nil, err
			}
			top, _ := s.rankingFantasy(ctx, *j, uuid.Nil)
			if len(top) > 3 {
				top = top[:3]
			}
			o.Body.Top3 = publicaFantasy(top)
			if len(top) == 0 {
				return o, nil
			}
			lider := top[0]
			enCurso := map[uuid.UUID]bool{}
			if ats, err := s.mercadoFantasy(ctx, c.ID, *j, uuid.Nil); err == nil {
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
				return nil, err
			}
			defer rows.Close()
			al := &alineacionDestacada{Alias: lider.Alias, Puntos: lider.Puntos, Atletas: []atletaAlineacion{}}
			for rows.Next() {
				var a atletaAlineacion
				if err := rows.Scan(&a.AtletaID, &a.Nombre, &a.Categoria, &a.Puntos); err != nil {
					return nil, err
				}
				a.Compitiendo = enCurso[a.AtletaID]
				al.Atletas = append(al.Atletas, a)
			}
			o.Body.AlineacionDestacada = al
			return o, rows.Err()
		})
}
