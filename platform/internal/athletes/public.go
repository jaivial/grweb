package athletes

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagPub = []string{"Web pública"}

type slugIn struct {
	Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
}

// AtletaPub is an athlete as the public web lists it (name, club, class and schedule are always public;
// the photo only with visible profile + image consent, and the guardian's authorisation for minors).
type AtletaPub struct {
	Slug           string     `json:"slug"`
	Nombre         string     `json:"nombre"`
	Apellidos      string     `json:"apellidos"`
	Club           string     `json:"club"`
	Ciudad         string     `json:"ciudad"`
	Sexo           string     `json:"sexo"`
	Categoria      string     `json:"categoria"`
	Division       string     `json:"division"`
	DivisionNombre string     `json:"divisionNombre"`
	Flight         string     `json:"flight"`
	Plataforma     *int       `json:"plataforma,omitempty"`
	HoraInicio     *time.Time `json:"horaInicio,omitempty"`
	FotoURL        string     `json:"fotoUrl"`
	FocalX         int16      `json:"focalX"`
	FocalY         int16      `json:"focalY"`
	Destacado      bool       `json:"destacado" doc:"Perfil con foto y marcas"`
}

func (r row) pub(d time.Time) AtletaPub {
	a := AtletaPub{Slug: r.Slug, Nombre: r.Nombre, Apellidos: r.Apellidos, Club: r.Club, Sexo: r.Sexo, Categoria: r.Categoria, Division: r.Division,
		DivisionNombre: DivisionNombre(r.Division), Flight: r.Flight, Plataforma: r.Plataforma, HoraInicio: r.HoraInicio, FotoURL: r.fotoPublica(d), FocalX: r.FocalX, FocalY: r.FocalY}
	a.Ciudad = r.Ciudad
	a.Destacado = a.FotoURL != "" && r.MarcaSQ != nil && r.MostrarMarcas
	return a
}

// ListaPub is /atletas (Figma page 39).
type ListaPub struct {
	Resumen struct {
		Total       int `json:"total"`
		Mujeres     int `json:"mujeres"`
		Hombres     int `json:"hombres"`
		Clubs       int `json:"clubs"`
		Flights     int `json:"flights"`
		Plataformas int `json:"plataformas"`
	} `json:"resumen"`
	Atletas     []AtletaPub `json:"atletas"`
	Actualizado time.Time   `json:"actualizado"`
}

// FichaPub is /atletas/:slug (Figma page 40).
type FichaPub struct {
	AtletaPub
	Frase            string      `json:"frase"`
	Bio              string      `json:"bio"`
	Instagram        string      `json:"instagram"`
	Entrenador       string      `json:"entrenador"`
	Historial        string      `json:"historial"`
	Marcas           *Marcas     `json:"marcas,omitempty" doc:"Mejores marcas declaradas (si el atleta las muestra)"`
	TotalPrevisto    *float64    `json:"totalPrevisto,omitempty"`
	PrimerosIntentos Marcas      `json:"primerosIntentos"`
	PesajeInicio     *time.Time  `json:"pesajeInicio,omitempty"`
	PesajeFin        *time.Time  `json:"pesajeFin,omitempty"`
	Seguidores       int         `json:"seguidores"`
	PermiteSeguir    bool        `json:"permiteSeguir"`
	PerfilMinimo     bool        `json:"perfilMinimo" doc:"Sin foto, marcas ni texto todavía"`
	Tambien          []AtletaPub `json:"tambien" doc:"Otros atletas de su categoría"`
}

// Participantes is /participantes (Figma page 26): confirmed athletes by block (flight once published, else class).
type Participantes struct {
	Plazas   int     `json:"plazas"`
	Ocupadas int     `json:"ocupadas"`
	Mujeres  int     `json:"mujeres"`
	Hombres  int     `json:"hombres"`
	Reserva  int     `json:"reserva"`
	Estado   string  `json:"estado" doc:"Estado de la inscripción (abierta, completa…)"`
	Grupos   []Grupo `json:"grupos"`
}

// Grupo is a block of /participantes.
type Grupo struct {
	Titulo    string `json:"titulo"`
	Subtitulo string `json:"subtitulo"`
	Filas     []Fila `json:"filas"`
}

// Fila is one participant.
type Fila struct {
	Slug       string     `json:"slug"`
	Nombre     string     `json:"nombre"`
	Club       string     `json:"club"`
	Sexo       string     `json:"sexo"`
	Categoria  string     `json:"categoria"`
	Flight     string     `json:"flight"`
	PesajeIni  *time.Time `json:"pesajeInicio,omitempty"`
	PesajeFin  *time.Time `json:"pesajeFin,omitempty"`
	HoraInicio *time.Time `json:"horaInicio,omitempty"`
}

func (s *Svc) registerPublic() {
	api := s.a.API
	pub := "/api/competiciones/{slug}"
	cache := "public, max-age=60"

	type listOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         ListaPub
	}
	type listIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Resumen bool   `query:"resumen" doc:"Solo el resumen (la home: número de inscritos), sin la lista"`
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-public", Method: http.MethodGet, Path: pub + "/atletas", Summary: "Atletas confirmados", Tags: tagPub},
		func(ctx context.Context, in *listIn) (*listOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out, err := cached(ctx, s, c.ID, "lista", func() (ListaPub, error) {
				d := s.compDate(ctx, c.ID)
				list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND a.estado = 'confirmado'`, c.ID)
				if err != nil {
					return ListaPub{}, err
				}
				var o ListaPub
				o.Atletas = make([]AtletaPub, 0, len(list))
				clubs, flights, plats := map[string]bool{}, map[string]bool{}, map[int]bool{}
				for _, r := range list {
					if r.publico(d) {
						o.Atletas = append(o.Atletas, r.pub(d))
					}
					if r.Sexo == "F" {
						o.Resumen.Mujeres++
					} else {
						o.Resumen.Hombres++
					}
					if r.Club != "" && !strings.EqualFold(r.Club, "independiente") {
						clubs[strings.ToLower(r.Club)] = true
					}
					if r.Flight != "" {
						flights[r.Flight] = true
					}
					if r.Plataforma != nil {
						plats[*r.Plataforma] = true
					}
					if r.UpdatedAt.After(o.Actualizado) {
						o.Actualizado = r.UpdatedAt
					}
				}
				o.Resumen.Total, o.Resumen.Clubs, o.Resumen.Flights, o.Resumen.Plataformas = len(list), len(clubs), len(flights), len(plats)
				sortPub(o.Atletas)
				return o, nil
			})
			if in.Resumen {
				out.Atletas = []AtletaPub{}
			}
			return &listOut{CacheControl: cache, Body: out}, err
		})

	type fichaIn struct {
		Slug  string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		ASlug string `path:"aslug" pattern:"^[a-z0-9-]{1,90}$"`
	}
	type fichaOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         FichaPub
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-public-get", Method: http.MethodGet, Path: pub + "/atletas/{aslug}", Summary: "Ficha pública de un atleta", Tags: tagPub},
		func(ctx context.Context, in *fichaIn) (*fichaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out, err := cached(ctx, s, c.ID, "ficha:"+in.ASlug, func() (FichaPub, error) {
				d := s.compDate(ctx, c.ID)
				list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND p.slug = $2 AND a.estado = 'confirmado'`, c.ID, in.ASlug)
				if err != nil {
					return FichaPub{}, err
				}
				if len(list) == 0 || !list[0].publico(d) {
					return FichaPub{}, problem.NotFound("Atleta no encontrado.")
				}
				r := list[0]
				f := FichaPub{AtletaPub: r.pub(d), PrimerosIntentos: Marcas{r.IntentoSQ, r.IntentoBP, r.IntentoDL}, PesajeInicio: r.PesajeInicio, PesajeFin: r.PesajeFin,
					Seguidores: r.Seguidores, PermiteSeguir: r.PermiteSeguir, Tambien: []AtletaPub{}}
				f.Frase, f.Bio, f.Instagram, f.Entrenador, f.Historial = r.Frase, r.Bio, r.Instagram, r.Entrenador, r.Historial
				if r.MostrarMarcas && (r.MarcaSQ != nil || r.MarcaBP != nil || r.MarcaDL != nil) {
					f.Marcas = &Marcas{r.MarcaSQ, r.MarcaBP, r.MarcaDL}
					f.TotalPrevisto = r.totalPrevisto()
				}
				f.PerfilMinimo = f.FotoURL == "" && f.Marcas == nil && f.Bio == "" && f.Frase == ""
				f.PermiteSeguir = r.PermiteSeguir && !r.menor(d)
				others, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND a.estado = 'confirmado' AND a.sexo = $2 AND a.categoria = $3 AND a.id <> $4 ORDER BY a.hora_inicio NULLS LAST, a.apellidos LIMIT 6`,
					c.ID, r.Sexo, r.Categoria, r.ID)
				if err != nil {
					return f, err
				}
				for _, o := range others {
					if o.publico(d) {
						f.Tambien = append(f.Tambien, o.pub(d))
					}
				}
				return f, nil
			})
			return &fichaOut{CacheControl: cache, Body: out}, err
		})

	type partOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         Participantes
	}
	huma.Register(api, huma.Operation{OperationID: "participantes-public", Method: http.MethodGet, Path: pub + "/participantes", Summary: "Participantes por bloque", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*partOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out, err := cached(ctx, s, c.ID, "participantes", func() (Participantes, error) {
				list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND a.estado IN ('confirmado', 'reserva')`, c.ID)
				if err != nil {
					return Participantes{}, err
				}
				return participantes(c.Inscripcion.Plazas, c.Inscripcion.Estado, list), nil
			})
			return &partOut{CacheControl: cache, Body: out}, err
		})

	type seguirIn struct {
		Slug  string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		ASlug string `path:"aslug" pattern:"^[a-z0-9-]{1,90}$"`
		Body  struct {
			Email       string `json:"email" format:"email" maxLength:"254"`
			AceptaAviso bool   `json:"aceptaAviso,omitempty" doc:"Casilla sin premarcar (si falta → 422 CONSENTIMIENTO_OBLIGATORIO)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-seguir", Method: http.MethodPost, Path: pub + "/atletas/{aslug}/seguir", Summary: "Avísame cuando compita (pide confirmación por email)", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *seguirIn) (*struct{}, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "seguir", httpx.ClientIPFrom(ctx)), 10, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has pedido muchos avisos seguidos. Inténtalo más tarde.")
			}
			if !in.Body.AceptaAviso {
				return nil, problem.Unprocessable("CONSENTIMIENTO_OBLIGATORIO", "Marca la casilla para recibir el aviso.")
			}
			d := s.compDate(ctx, c.ID)
			list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND p.slug = $2 AND a.estado = 'confirmado'`, c.ID, in.ASlug)
			if err != nil {
				return nil, err
			}
			if len(list) == 0 || !list[0].publico(d) {
				return nil, problem.NotFound("Atleta no encontrado.")
			}
			r := list[0]
			if !r.PermiteSeguir || r.menor(d) {
				return nil, problem.Conflict("NO_SE_PUEDE_SEGUIR", "Este atleta no recibe seguidores.")
			}
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			t := randomToken()
			v, _ := s.legalVigente(ctx, c.ID, "privacidad")
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var confirmado bool
				if err := tx.QueryRow(ctx, `INSERT INTO seguimientos (id, atleta_id, competition_id, email, token_hash, consentimiento_at, legal_version) VALUES ($1,$2,$3,$4,$5,now(),$6)
					ON CONFLICT (atleta_id, email) DO UPDATE SET token_hash = EXCLUDED.token_hash, baja_at = NULL, consentimiento_at = now(), legal_version = EXCLUDED.legal_version
					RETURNING confirmado_at IS NOT NULL`, newID(), r.ID, c.ID, e, hashToken(t), v).Scan(&confirmado); err != nil {
					return err
				}
				if confirmado {
					return nil // already confirmed: nothing to send
				}
				return email(ctx, tx, c.ID, e, "seguimiento-confirmar", map[string]string{"atleta": r.nombreCompleto(), "enlace": s.webURL + "/atletas/" + r.Slug + "?aviso=" + t})
			})
		})

	type tokIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Token string `json:"token" minLength:"20" maxLength:"100"`
		}
	}
	type confOut struct {
		Body struct {
			Atleta string `json:"atleta"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "seguimientos-confirmar", Method: http.MethodPost, Path: pub + "/seguimientos/confirmar", Summary: "Confirmar un aviso (enlace del email)", Tags: tagPub},
		func(ctx context.Context, in *tokIn) (*confOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out := &confOut{}
			err = s.change(ctx, c.ID, "athletes.seguimiento_confirmado", map[string]any{}, func(tx pgx.Tx) error {
				var aid uuid.UUID
				var mail, version, slug string
				if err := tx.QueryRow(ctx, `UPDATE seguimientos SET confirmado_at = COALESCE(confirmado_at, now()), baja_at = NULL WHERE competition_id = $1 AND token_hash = $2 RETURNING atleta_id, email::text, legal_version`,
					c.ID, hashToken(in.Body.Token)).Scan(&aid, &mail, &version); err != nil {
					return problem.NotFound("El enlace no es válido o ya no existe.")
				}
				if err := tx.QueryRow(ctx, `SELECT a.nombre || ' ' || a.apellidos, COALESCE(p.slug, '') FROM atletas a LEFT JOIN perfiles p ON p.atleta_id = a.id WHERE a.id = $1`, aid).Scan(&out.Body.Atleta, &slug); err != nil {
					return err
				}
				// crm keeps the contact with the proof of the (double opt-in) consent.
				return contacto(ctx, tx, c.ID, map[string]any{"email": mail, "origen": "avisame", "relacion": map[string]any{"sigue": out.Body.Atleta},
					"consentimientos": []map[string]any{{"finalidad": "avisos_atleta", "canal": "email", "estado": "confirmado", "version": version, "origen": "/atletas/" + slug + " · Avísame", "doi": true}},
					"actividad":       map[string]any{"tipo": "seguimiento", "titulo": "Sigue a " + out.Body.Atleta, "detalle": "Aviso 30 min antes de que salga (doble opt-in)"}})
			})
			return out, err
		})
	huma.Register(api, huma.Operation{OperationID: "seguimientos-baja", Method: http.MethodPost, Path: pub + "/seguimientos/baja", Summary: "Dejar de recibir el aviso", Tags: tagPub, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *tokIn) (*struct{}, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			return nil, s.change(ctx, c.ID, "", nil, func(tx pgx.Tx) error {
				q, arg := `UPDATE seguimientos SET baja_at = now() WHERE competition_id = $1 AND token_hash = $2`, any(hashToken(in.Body.Token))
				if id, ok := s.validBaja(in.Body.Token); ok {
					// Signed link of the schedule notices (stable, does not need the confirmation token).
					q, arg = `UPDATE seguimientos SET baja_at = now() WHERE competition_id = $1 AND id = $2`, id
				}
				var mail, nombre string
				err := tx.QueryRow(ctx, q+` RETURNING email::text, (SELECT a.nombre || ' ' || a.apellidos FROM atletas a WHERE a.id = seguimientos.atleta_id)`, c.ID, arg).Scan(&mail, &nombre)
				if db.IsNoRows(err) {
					return problem.NotFound("El enlace no es válido o ya no existe.")
				}
				if err != nil {
					return err
				}
				var activos int
				if err := tx.QueryRow(ctx, `SELECT count(*) FROM seguimientos WHERE competition_id = $1 AND email = $2 AND confirmado_at IS NOT NULL AND baja_at IS NULL`, c.ID, mail).Scan(&activos); err != nil {
					return err
				}
				ev := map[string]any{"email": mail, "actividad": map[string]any{"tipo": "seguimiento", "titulo": "Dejó de seguir a " + nombre, "detalle": "Enlace de baja del aviso"}}
				if activos == 0 {
					ev["revocar"] = []string{"avisos_atleta"} // no athlete followed any more
				}
				return contacto(ctx, tx, c.ID, ev)
			})
		})
}

func sortPub(l []AtletaPub) {
	sort.SliceStable(l, func(i, j int) bool {
		a, b := l[i], l[j]
		if (a.HoraInicio == nil) != (b.HoraInicio == nil) {
			return a.HoraInicio != nil
		}
		if a.HoraInicio != nil && !a.HoraInicio.Equal(*b.HoraInicio) {
			return a.HoraInicio.Before(*b.HoraInicio)
		}
		if x, y := catOrder(a.Sexo+" "+a.Categoria), catOrder(b.Sexo+" "+b.Categoria); x != y {
			return x < y
		}
		return strings.ToLower(a.Apellidos+a.Nombre) < strings.ToLower(b.Apellidos+b.Nombre)
	})
}

// participantes groups confirmed athletes by flight (once the schedule is published) or by sex and class.
func participantes(plazas int, estado string, list []row) Participantes {
	out := Participantes{Plazas: plazas, Estado: estado, Grupos: []Grupo{}}
	byKey := map[string]*Grupo{}
	var order []string
	for _, r := range list {
		if r.Estado == "reserva" {
			out.Reserva++
			continue
		}
		out.Ocupadas++
		if r.Sexo == "F" {
			out.Mujeres++
		} else {
			out.Hombres++
		}
		key, titulo, sub := "c:"+catOrder(r.Sexo+" "+r.Categoria), map[string]string{"F": "Femenino", "M": "Masculino"}[r.Sexo]+" · "+r.Categoria+" kg", ""
		if r.Flight != "" {
			key, titulo = "f:"+r.Flight, "Flight "+r.Flight
			if r.HoraInicio != nil {
				sub = "Empieza a las " + r.HoraInicio.In(madrid).Format("15:04")
			}
		}
		g, ok := byKey[key]
		if !ok {
			g = &Grupo{Titulo: titulo, Subtitulo: sub, Filas: []Fila{}}
			byKey[key] = g
			order = append(order, key)
		}
		g.Filas = append(g.Filas, Fila{Slug: r.Slug, Nombre: r.nombreCompleto(), Club: r.Club, Sexo: r.Sexo, Categoria: r.Categoria, Flight: r.Flight,
			PesajeIni: r.PesajeInicio, PesajeFin: r.PesajeFin, HoraInicio: r.HoraInicio})
	}
	sort.Strings(order)
	for _, k := range order {
		g := byKey[k]
		sort.SliceStable(g.Filas, func(i, j int) bool {
			return catOrder(g.Filas[i].Sexo+" "+g.Filas[i].Categoria) < catOrder(g.Filas[j].Sexo+" "+g.Filas[j].Categoria)
		})
		if g.Subtitulo == "" {
			g.Subtitulo = fmt.Sprintf("%d atletas · horario por publicar", len(g.Filas))
		}
		out.Grupos = append(out.Grupos, *g)
	}
	return out
}

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// AtletaPlan is a confirmed athlete as other services see it (schedule plans flights with it): no contact data,
// and name details for the public pages only when the profile is public.
type AtletaPlan struct {
	ID             uuid.UUID `json:"id"`
	Nombre         string    `json:"nombre" doc:"Nombre completo (uso interno del backoffice)"`
	Slug           string    `json:"slug" doc:"Solo si el perfil es público"`
	Publico        bool      `json:"publico"`
	ConEmail       bool      `json:"conEmail"`
	Sexo           string    `json:"sexo"`
	Categoria      string    `json:"categoria"`
	DivisionNombre string    `json:"divisionNombre"`
	Club           string    `json:"club"`
	TotalPrevisto  *float64  `json:"totalPrevisto,omitempty"`
	Seguidores     int       `json:"seguidores"`
	// Competition desk (live): weigh-in data.
	PesoCorporal *float64 `json:"pesoCorporal,omitempty"`
	Primeros     Marcas   `json:"primeros" doc:"Primeros intentos declarados en el pesaje"`
	RackSQ       *int     `json:"rackSq,omitempty"`
	RackBP       string   `json:"rackBp,omitempty"`
	Licencia     string   `json:"licencia"`
	// Public profile only: the sentence the speaker can read («Cuarta competición · objetivo 360 kg»).
	Frase string `json:"frase,omitempty"`
}

// registerInternal exposes the confirmed athletes to other services and lets schedule write the published times.
func (s *Svc) registerInternal() {
	type out struct {
		Body []AtletaPlan
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-atletas", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/atletas", Summary: "Atletas confirmados (solo servicios)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidIn) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			d := s.compDate(ctx, in.CID)
			list, err := listRows(ctx, s.a.DB, `a.competition_id = $1 AND a.estado = 'confirmado' ORDER BY a.sexo, a.categoria, a.apellidos`, in.CID)
			if err != nil {
				return nil, err
			}
			o := &out{Body: make([]AtletaPlan, 0, len(list))}
			for _, r := range list {
				a := AtletaPlan{ID: r.ID, Nombre: r.nombreCompleto(), Publico: r.publico(d), ConEmail: r.Email != nil && *r.Email != "", Sexo: r.Sexo, Categoria: r.Categoria,
					DivisionNombre: DivisionNombre(r.Division), Club: r.Club, TotalPrevisto: r.totalPrevisto(), Seguidores: r.Seguidores,
					PesoCorporal: r.PesoCorporal, Primeros: Marcas{r.IntentoSQ, r.IntentoBP, r.IntentoDL}, RackSQ: r.RackSQ, RackBP: r.RackBP, Licencia: r.Licencia}
				if a.Publico {
					a.Slug, a.Frase = r.Slug, r.Frase
				}
				o.Body = append(o.Body, a)
			}
			return o, nil
		})
	s.registerHorarios()
	s.registerResultados()
	s.registerRGPD()
}
