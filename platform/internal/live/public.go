package live

import (
	"context"
	"crypto/hmac"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagPub = []string{"Público"}

// EnPlataforma is an athlete on (or waiting for) the platform, as the public sees it: name, club and slug only with
// a public profile.
type EnPlataforma struct {
	Nombre     string     `json:"nombre"`
	Slug       string     `json:"slug,omitempty"`
	Club       string     `json:"club,omitempty"`
	Sexo       string     `json:"sexo"`
	Categoria  string     `json:"categoria"`
	Division   string     `json:"division,omitempty"`
	Movimiento string     `json:"movimiento"`
	Numero     int        `json:"numero"`
	Peso       float64    `json:"peso"`
	Votos      string     `json:"votos,omitempty"`
	Resultado  string     `json:"resultado,omitempty"`
	JuzgadoAt  *time.Time `json:"juzgadoAt,omitempty"`
}

// Directo is the public live snapshot (/en-directo, the arena screen).
type Directo struct {
	Fase         string `json:"fase" enum:"antes,en_directo,finalizado"`
	Pausa        bool   `json:"pausa"`
	RetrasoMin   int    `json:"retrasoMin"`
	StreamURL    string `json:"streamUrl,omitempty"`
	ReplayURL    string `json:"replayUrl,omitempty"`
	Espectadores int    `json:"espectadores"`
	Flight       *struct {
		Codigo     string `json:"codigo"`
		Titulo     string `json:"titulo"`
		Plataforma int    `json:"plataforma"`
	} `json:"flight,omitempty"`
	Movimiento string         `json:"movimiento"`
	Ronda      int            `json:"ronda"`
	TurnoAt    *time.Time     `json:"turnoAt,omitempty"`
	Actual     *EnPlataforma  `json:"actual,omitempty"`
	Ultimo     *EnPlataforma  `json:"ultimo,omitempty" doc:"Último intento juzgado del flight"`
	Siguientes []EnPlataforma `json:"siguientes"`
	// The provisional ranking of the categories of the current flight.
	Clasificacion []Categoria `json:"clasificacion"`
	// Before the event: the first block (and the time it starts).
	Proximo *struct {
		Titulo string    `json:"titulo"`
		Inicio time.Time `json:"inicio"`
	} `json:"proximo,omitempty"`
	ResultadosPublicados bool `json:"resultadosPublicados"`
}

func enPlataforma(a *atleta, mov string, n int, peso float64) *EnPlataforma {
	x := &EnPlataforma{Nombre: "Atleta", Sexo: a.Sexo, Categoria: a.Categoria, Division: a.DivisionNombre, Movimiento: mov, Numero: n, Peso: peso}
	if a.Publico {
		x.Nombre, x.Slug, x.Club = a.Nombre, a.Slug, a.Club
	}
	return x
}

func (s *Svc) directoPublico(ctx context.Context, c compref.Comp) (*Directo, error) {
	key := "dir:" + c.ID.String() + ":" + s.version(ctx, c.ID)
	var d Directo
	if s.cache.Get(ctx, key, &d) {
		d.Espectadores = s.espectadores(ctx, c.ID)
		return &d, nil
	}
	e, err := s.estadoLeer(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	p, err := s.cargarPlan(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	t, err := cargarIntentos(ctx, s.a.DB, c.ID)
	if err != nil {
		return nil, err
	}
	recs, err := cargarRecords(ctx, s.a.DB, c.ID)
	if err != nil {
		return nil, err
	}
	d = Directo{Fase: e.Fase, Pausa: e.Pausa, RetrasoMin: e.RetrasoMin, StreamURL: e.StreamURL, ReplayURL: e.ReplayURL, Movimiento: e.Movimiento,
		Siguientes: []EnPlataforma{}, Clasificacion: []Categoria{}}
	var n int
	_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM resultados WHERE competition_id = $1`, c.ID).Scan(&n)
	d.ResultadosPublicados = n > 0
	// First block: the earliest flight not finished (before the event, what /en-directo counts down to).
	for i := range p.Flights {
		f := &p.Flights[i]
		if flightCompleto(f, t) {
			continue
		}
		if d.Proximo == nil || f.Inicio.Before(d.Proximo.Inicio) {
			d.Proximo = &struct {
				Titulo string    `json:"titulo"`
				Inicio time.Time `json:"inicio"`
			}{f.Titulo, f.Inicio}
		}
	}
	if e.FlightID != nil && e.Fase != "antes" {
		if f := p.flight(*e.FlightID); f != nil {
			d.Flight = &struct {
				Codigo     string `json:"codigo"`
				Titulo     string `json:"titulo"`
				Plataforma int    `json:"plataforma"`
			}{f.Codigo, f.Titulo, f.Plataforma}
			ronda, cola := orden(p, f, t, e.Movimiento)
			d.Ronda = ronda
			d.TurnoAt = e.TurnoAt
			if len(cola) > 0 && cola[0].Numero == ronda && e.Fase == "en_directo" {
				d.Actual = enPlataforma(cola[0].Atleta, e.Movimiento, cola[0].Numero, cola[0].Peso)
				for _, x := range cola[1:] {
					if len(d.Siguientes) == 3 {
						break
					}
					d.Siguientes = append(d.Siguientes, *enPlataforma(x.Atleta, e.Movimiento, x.Numero, x.Peso))
				}
			}
			// last judged attempt of this flight (lights on the screen)
			var last *intento
			for _, x := range f.Atletas {
				for _, m := range movs {
					for k := 1; k <= 3; k++ {
						if it := t.get(x.ID, m, k); it.resuelto() && it.JuzgadoAt != nil && (last == nil || it.JuzgadoAt.After(*last.JuzgadoAt)) {
							last = it
						}
					}
				}
			}
			if last != nil && p.Atletas[last.AtletaID] != nil {
				u := enPlataforma(p.Atletas[last.AtletaID], last.Mov, last.Numero, last.Peso)
				u.Votos, u.Resultado, u.JuzgadoAt = last.Votos, last.Resultado, last.JuzgadoAt
				d.Ultimo = u
			}
			seen := map[string]bool{}
			for _, x := range f.Atletas {
				if a := p.Atletas[x.ID]; a != nil {
					k := clave(a.Sexo, a.Categoria)
					if !seen[k] {
						seen[k] = true
						d.Clasificacion = append(d.Clasificacion, clasificar(p, t, recs, k, true))
					}
				}
			}
			ordenarCategorias(d.Clasificacion)
		}
	}
	s.cache.Set(ctx, key, d, 30*time.Second)
	d.Espectadores = s.espectadores(ctx, c.ID)
	return &d, nil
}

func (s *Svc) registerPublic() {
	api := s.a.API
	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type dirOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         *Directo
	}
	huma.Register(api, huma.Operation{OperationID: "directo-publico", Method: http.MethodGet, Path: "/api/competiciones/{slug}/directo", Summary: "Directo: quién está en la plataforma, siguientes y clasificación provisional", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*dirOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			d, err := s.directoPublico(ctx, c)
			if err != nil {
				return nil, err
			}
			return &dirOut{CacheControl: "no-cache", Body: d}, nil
		})

	type resOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         *ResultadosPublicos
	}
	huma.Register(api, huma.Operation{OperationID: "resultados-publicos", Method: http.MethodGet, Path: "/api/competiciones/{slug}/resultados", Summary: "Resultados publicados por categoría y mejores levantadores (GL)", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*resOut, error) {
			o, err := s.resultadosPublicos(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			return &resOut{CacheControl: "public, max-age=30", Body: o}, nil
		})

	// The arena screen: the live snapshot plus its settings, behind the signed URL of «Pantalla del pabellón».
	type panIn struct {
		Slug   string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Token  string `query:"token" maxLength:"64"`
		Previa bool   `query:"previa" doc:"Vista previa del backoffice: no cuenta como pantalla en línea"`
	}
	type panOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         struct {
			Directo  *Directo `json:"directo"`
			Pantalla Pantalla `json:"pantalla"`
			Nombre   string   `json:"nombre"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "pantalla-publica", Method: http.MethodGet, Path: "/api/competiciones/{slug}/pantalla", Summary: "Pantalla del pabellón (enlace firmado)", Tags: tagPub},
		func(ctx context.Context, in *panIn) (*panOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			e, err := s.estadoLeer(ctx, c.ID)
			if err != nil {
				return nil, err
			}
			if !hmac.Equal([]byte(s.tokenPantalla(c.ID, max(e.Pantalla.Ver, 1))), []byte(strings.TrimSpace(in.Token))) {
				return nil, problem.New(http.StatusForbidden, "PANTALLA_ENLACE_NO_VALIDO", "Este enlace de pantalla ya no vale. Copia el nuevo desde «Directo › Pantalla del pabellón».")
			}
			d, err := s.directoPublico(ctx, c)
			if err != nil {
				return nil, err
			}
			if !in.Previa {
				_ = s.a.Redis.Set(ctx, s.a.Keys.Of("live", "pantalla-ping", c.ID.String()), time.Now().Unix(), 24*time.Hour).Err()
			}
			o := &panOut{CacheControl: "no-store"}
			o.Body.Directo, o.Body.Pantalla, o.Body.Nombre = d, e.Pantalla, c.Nombre
			return o, nil
		})
}

var _ = uuid.Nil
