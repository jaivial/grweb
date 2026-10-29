package cms

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagPub = []string{"Web pública"}

type slugIn struct {
	Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
}

// Home is what the public home renders: published sections + featured FAQ + sponsors.
type Home struct {
	Version        string                     `json:"version"`
	Secciones      map[string]json.RawMessage `json:"secciones" doc:"Contenido publicado y visible, por clave"`
	Orden          []string                   `json:"orden"`
	FaqDestacadas  []faqPub                   `json:"faqDestacadas"`
	Patrocinadores []patroPub                 `json:"patrocinadores"`
}

type faqPub struct {
	Categoria string `json:"categoria" db:"categoria"`
	Pregunta  string `json:"pregunta" db:"pregunta"`
	Respuesta string `json:"respuesta" db:"respuesta"`
}

type patroPub struct {
	Nombre  string `json:"nombre" db:"nombre"`
	Nivel   string `json:"nivel" db:"nivel"`
	LogoURL string `json:"logoUrl" db:"logo_url"`
	URL     string `json:"url" db:"url"`
}

type paginaPub struct {
	Slug        string     `json:"slug" db:"slug"`
	Titulo      string     `json:"titulo" db:"titulo"`
	Resumen     string     `json:"resumen" db:"resumen"`
	Cuerpo      string     `json:"cuerpo,omitempty" db:"cuerpo"`
	PortadaURL  string     `json:"portadaUrl" db:"portada_url"`
	PublicadoAt *time.Time `json:"publicadoAt,omitempty" db:"publicado"`
}

type legalPub struct {
	Tipo        string    `json:"tipo" db:"tipo"`
	Version     string    `json:"version" db:"version"`
	Titulo      string    `json:"titulo" db:"titulo"`
	Contenido   string    `json:"contenido" db:"contenido"`
	Hash        string    `json:"hash" db:"hash"`
	PublicadoAt time.Time `json:"publicadoAt" db:"publicado_at"`
}

type seoPub struct {
	Paginas       []seoRow   `json:"paginas"`
	Redirecciones []redirRow `json:"redirecciones"`
	Rutas         []string   `json:"rutas" doc:"Páginas y entradas publicadas (sitemap)"`
}

const visible = `publicada AND (publicar_at IS NULL OR publicar_at <= now())`

func (s *Svc) registerPublic() {
	api := s.a.API
	pub := "/api/competiciones/{slug}"
	cacheHdr := "public, max-age=60"

	type homeOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         Home
	}
	huma.Register(api, huma.Operation{OperationID: "web-public", Method: http.MethodGet, Path: pub + "/web", Summary: "Contenido publicado de la home", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*homeOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			h, err := cached(ctx, s, cid, "home", func() (Home, error) { return s.home(ctx, cid) })
			return &homeOut{CacheControl: cacheHdr, Body: h}, err
		})

	type faqOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         []faqPub
	}
	huma.Register(api, huma.Operation{OperationID: "faq-public", Method: http.MethodGet, Path: pub + "/faq", Summary: "Preguntas frecuentes publicadas", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*faqOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, "faq", func() ([]faqPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT categoria, pregunta, respuesta FROM faq WHERE competition_id = $1 AND publicada ORDER BY categoria, orden`, cid)
				if err != nil {
					return nil, err
				}
				return collect[faqPub](rows)
			})
			return &faqOut{CacheControl: cacheHdr, Body: list}, err
		})

	type patroOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         []patroPub
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinadores-public", Method: http.MethodGet, Path: pub + "/patrocinadores", Summary: "Patrocinadores activos", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*patroOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, "patrocinadores", func() ([]patroPub, error) { return s.patrocinadores(ctx, cid) })
			return &patroOut{CacheControl: cacheHdr, Body: list}, err
		})

	type legalIn struct {
		Slug string `path:"slug"`
		Tipo string `path:"tipo" enum:"privacidad,terminos,cookies,consentimiento,bases-sorteo"`
	}
	type legalOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         legalPub
	}
	huma.Register(api, huma.Operation{OperationID: "legal-public", Method: http.MethodGet, Path: pub + "/legal/{tipo}", Summary: "Versión vigente de un texto legal", Tags: tagPub},
		func(ctx context.Context, in *legalIn) (*legalOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			l, err := cached(ctx, s, cid, "legal:"+in.Tipo, func() (legalPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT tipo, version, titulo, contenido, hash, publicado_at FROM legal WHERE competition_id = $1 AND tipo = $2 AND publicado_at IS NOT NULL ORDER BY publicado_at DESC LIMIT 1`, cid, in.Tipo)
				if err != nil {
					return legalPub{}, err
				}
				l, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[legalPub])
				if err != nil {
					return l, problem.NotFound("Este texto todavía no está publicado.")
				}
				return l, nil
			})
			return &legalOut{CacheControl: cacheHdr, Body: l}, err
		})

	type pagIn struct {
		Slug  string `path:"slug"`
		PSlug string `path:"pslug"`
	}
	type pagOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         paginaPub
	}
	for _, tipo := range []string{"pagina", "blog"} {
		seg := "paginas"
		if tipo == "blog" {
			seg = "blog"
		}
		huma.Register(api, huma.Operation{OperationID: seg + "-public-get", Method: http.MethodGet, Path: pub + "/" + seg + "/{pslug}", Summary: "Página o entrada publicada", Tags: tagPub},
			func(ctx context.Context, in *pagIn) (*pagOut, error) {
				cid, err := s.cidFor(ctx, in.Slug)
				if err != nil {
					return nil, err
				}
				p, err := cached(ctx, s, cid, seg+":"+in.PSlug, func() (paginaPub, error) {
					rows, err := s.a.DB.Query(ctx, `SELECT slug, titulo, resumen, cuerpo, portada_url, COALESCE(publicar_at, updated_at) AS publicado FROM paginas
						WHERE competition_id = $1 AND tipo = $2 AND slug = $3 AND `+visible, cid, tipo, in.PSlug)
					if err != nil {
						return paginaPub{}, err
					}
					p, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[paginaPub])
					if err != nil {
						return p, problem.NotFound("Página no encontrada.")
					}
					return p, nil
				})
				return &pagOut{CacheControl: cacheHdr, Body: p}, err
			})
	}
	type blogOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         []paginaPub
	}
	huma.Register(api, huma.Operation{OperationID: "blog-public-list", Method: http.MethodGet, Path: pub + "/blog", Summary: "Entradas del blog publicadas", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*blogOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, "blog", func() ([]paginaPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT slug, titulo, resumen, '' AS cuerpo, portada_url, COALESCE(publicar_at, updated_at) AS publicado FROM paginas
					WHERE competition_id = $1 AND tipo = 'blog' AND `+visible+` ORDER BY publicado DESC LIMIT 50`, cid)
				if err != nil {
					return nil, err
				}
				return collect[paginaPub](rows)
			})
			return &blogOut{CacheControl: cacheHdr, Body: list}, err
		})

	type albumPub struct {
		Titulo string          `json:"titulo" db:"titulo"`
		Slug   string          `json:"slug" db:"slug"`
		Fotos  json.RawMessage `json:"fotos" db:"fotos"`
	}
	type galOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         []albumPub
	}
	huma.Register(api, huma.Operation{OperationID: "galeria-public", Method: http.MethodGet, Path: pub + "/galeria", Summary: "Álbumes publicados", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*galOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, "galeria", func() ([]albumPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT titulo, slug, fotos FROM albumes WHERE competition_id = $1 AND publicado ORDER BY orden`, cid)
				if err != nil {
					return nil, err
				}
				return collect[albumPub](rows)
			})
			return &galOut{CacheControl: cacheHdr, Body: list}, err
		})

	type seoOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         seoPub
	}
	huma.Register(api, huma.Operation{OperationID: "seo-public", Method: http.MethodGet, Path: pub + "/seo", Summary: "SEO por ruta, redirecciones y rutas publicadas (sitemap)", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*seoOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			out, err := cached(ctx, s, cid, "seo", func() (seoPub, error) {
				var o seoPub
				rows, err := s.a.DB.Query(ctx, `SELECT id, ruta, title, description, imagen_url, indexable, orden FROM seo WHERE competition_id = $1 ORDER BY ruta`, cid)
				if err != nil {
					return o, err
				}
				if o.Paginas, err = collect[seoRow](rows); err != nil {
					return o, err
				}
				rows, err = s.a.DB.Query(ctx, `SELECT id, desde, hacia, codigo, orden FROM redirecciones WHERE competition_id = $1 ORDER BY desde`, cid)
				if err != nil {
					return o, err
				}
				if o.Redirecciones, err = collect[redirRow](rows); err != nil {
					return o, err
				}
				rows, err = s.a.DB.Query(ctx, `SELECT CASE WHEN tipo = 'blog' THEN '/blog/' ELSE '/' END || slug FROM paginas WHERE competition_id = $1 AND `+visible+` ORDER BY 1`, cid)
				if err != nil {
					return o, err
				}
				o.Rutas, err = pgx.CollectRows(rows, pgx.RowTo[string])
				return o, err
			})
			return &seoOut{CacheControl: cacheHdr, Body: out}, err
		})

	type volIn struct {
		Slug string `path:"slug"`
		Body struct {
			Nombre           string `json:"nombre" minLength:"2" maxLength:"120"`
			Email            string `json:"email" format:"email" maxLength:"254"`
			Telefono         string `json:"telefono,omitempty" maxLength:"30"`
			Disponibilidad   string `json:"disponibilidad,omitempty" maxLength:"200"`
			EsMenor          bool   `json:"esMenor,omitempty"`
			AceptaPrivacidad bool   `json:"aceptaPrivacidad,omitempty" doc:"Obligatorio: casilla sin premarcar (si falta o es false → 422 CONSENTIMIENTO_OBLIGATORIO)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "voluntarios-public", Method: http.MethodPost, Path: pub + "/voluntarios", Summary: "Enviar una solicitud de voluntariado", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *volIn) (*struct{}, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "voluntarios", httpx.ClientIPFrom(ctx)), 5, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has enviado varias solicitudes seguidas. Inténtalo más tarde.")
			}
			if !in.Body.AceptaPrivacidad {
				return nil, problem.Unprocessable("CONSENTIMIENTO_OBLIGATORIO", "Para enviar la solicitud tienes que aceptar la política de privacidad.")
			}
			var version string
			_ = s.a.DB.QueryRow(ctx, `SELECT version FROM legal WHERE competition_id = $1 AND tipo = 'privacidad' AND publicado_at IS NOT NULL ORDER BY publicado_at DESC LIMIT 1`, cid).Scan(&version)
			id := newID()
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			return nil, s.change(ctx, cid, "cms.voluntario_solicitado", map[string]any{"id": id, "esMenor": in.Body.EsMenor}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO voluntarios (id, competition_id, nombre, email, telefono, disponibilidad, es_menor, consentimiento_at, legal_version)
					VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8)`, id, cid, strings.TrimSpace(in.Body.Nombre), email, in.Body.Telefono, in.Body.Disponibilidad, in.Body.EsMenor, version); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "cms.email_solicitado", map[string]any{"para": email, "plantilla": "voluntario-recibido",
					"vars": map[string]string{"nombre": in.Body.Nombre}}, events.Competition(cid.String()), events.Audience(events.Internal)))
			})
		})
}

func collect[T any](rows pgx.Rows) ([]T, error) {
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[T])
	if list == nil {
		list = []T{}
	}
	return list, err
}

func (s *Svc) patrocinadores(ctx context.Context, cid uuid.UUID) ([]patroPub, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT nombre, nivel, logo_url, url FROM patrocinadores WHERE competition_id = $1 AND activo ORDER BY orden`, cid)
	if err != nil {
		return nil, err
	}
	return collect[patroPub](rows)
}

func (s *Svc) home(ctx context.Context, cid uuid.UUID) (Home, error) {
	h := Home{Version: s.version(ctx, cid), Secciones: map[string]json.RawMessage{}, Orden: []string{}}
	rows, err := s.a.DB.Query(ctx, `SELECT clave, publicado FROM secciones WHERE competition_id = $1 AND visible AND publicado IS NOT NULL ORDER BY orden`, cid)
	if err != nil {
		return h, err
	}
	for rows.Next() {
		var k string
		var v json.RawMessage
		if err := rows.Scan(&k, &v); err != nil {
			rows.Close()
			return h, err
		}
		h.Secciones[k] = v
		h.Orden = append(h.Orden, k)
	}
	rows.Close()
	rows, err = s.a.DB.Query(ctx, `SELECT categoria, pregunta, respuesta FROM faq WHERE competition_id = $1 AND publicada AND destacada ORDER BY orden LIMIT 8`, cid)
	if err != nil {
		return h, err
	}
	if h.FaqDestacadas, err = collect[faqPub](rows); err != nil {
		return h, err
	}
	h.Patrocinadores, err = s.patrocinadores(ctx, cid)
	return h, err
}
