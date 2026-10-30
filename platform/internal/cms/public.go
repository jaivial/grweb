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
	// One line under the name on /patrocinadores.
	Descripcion string `json:"descripcion" db:"descripcion"`
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
			h, err := cached(ctx, s, cid, "home", ttlContent, func() (Home, error) { return s.home(ctx, cid) })
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
			list, err := cached(ctx, s, cid, "faq", ttlContent, func() ([]faqPub, error) {
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
			list, err := cached(ctx, s, cid, "patrocinadores", ttlContent, func() ([]patroPub, error) { return s.patrocinadores(ctx, cid) })
			return &patroOut{CacheControl: cacheHdr, Body: list}, err
		})

	type legalIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
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
			l, err := cached(ctx, s, cid, "legal:"+in.Tipo, ttlContent, func() (legalPub, error) {
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
		Slug  string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		PSlug string `path:"pslug" pattern:"^[a-z0-9-]{1,120}$"`
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
				p, err := cached(ctx, s, cid, seg+":"+in.PSlug, ttlTimed, func() (paginaPub, error) {
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
			list, err := cached(ctx, s, cid, "blog", ttlTimed, func() ([]paginaPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT slug, titulo, resumen, '' AS cuerpo, portada_url, COALESCE(publicar_at, updated_at) AS publicado FROM paginas
					WHERE competition_id = $1 AND tipo = 'blog' AND `+visible+` ORDER BY publicado DESC LIMIT 50`, cid)
				if err != nil {
					return nil, err
				}
				return collect[paginaPub](rows)
			})
			return &blogOut{CacheControl: cacheHdr, Body: list}, err
		})

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
			list, err := cached(ctx, s, cid, "galeria", ttlContent, func() ([]albumPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT titulo, slug, fotos FROM albumes WHERE competition_id = $1 AND publicado ORDER BY orden`, cid)
				if err != nil {
					return nil, err
				}
				list, err := collect[albumPub](rows)
				if err != nil {
					return nil, err
				}
				return s.conMedidas(ctx, cid, list)
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
			out, err := cached(ctx, s, cid, "seo", ttlTimed, func() (seoPub, error) {
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
				rows, err = s.a.DB.Query(ctx, `SELECT CASE WHEN tipo = 'blog' THEN '/blog/' ELSE '/' END || slug FROM paginas WHERE competition_id = $1 AND `+visible+`
					UNION SELECT DISTINCT '/' || pagina FROM secciones WHERE competition_id = $1 AND pagina <> 'home' AND publicado IS NOT NULL ORDER BY 1`, cid)
				if err != nil {
					return o, err
				}
				o.Rutas, err = pgx.CollectRows(rows, pgx.RowTo[string])
				return o, err
			})
			return &seoOut{CacheControl: cacheHdr, Body: out}, err
		})

	type volIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Nombre           string   `json:"nombre" minLength:"2" maxLength:"120"`
			Email            string   `json:"email" format:"email" maxLength:"254"`
			Telefono         string   `json:"telefono,omitempty" maxLength:"30"`
			Disponibilidad   string   `json:"disponibilidad,omitempty" maxLength:"200"`
			Roles            []string `json:"roles,omitempty" maxItems:"5" uniqueItems:"true" doc:"jueces · cargadores · mesa · foto · acreditaciones"`
			Experiencia      string   `json:"experiencia,omitempty" maxLength:"1000"`
			EsMenor          bool     `json:"esMenor,omitempty"`
			AceptaPrivacidad bool     `json:"aceptaPrivacidad,omitempty" doc:"Obligatorio: casilla sin premarcar (si falta o es false → 422 CONSENTIMIENTO_OBLIGATORIO)"`
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
			roles := []string{}
			for _, r := range in.Body.Roles {
				if !rolesVoluntario[r] {
					return nil, problem.Unprocessable("ROL_INVALIDO", "Rol de voluntario no válido: "+r)
				}
				roles = append(roles, r)
			}
			detalle := strings.TrimSpace(strings.Join(append(append([]string{}, roles...), in.Body.Disponibilidad), " · "))
			var version string
			_ = s.a.DB.QueryRow(ctx, `SELECT version FROM legal WHERE competition_id = $1 AND tipo = 'privacidad' AND publicado_at IS NOT NULL ORDER BY publicado_at DESC LIMIT 1`, cid).Scan(&version)
			id := newID()
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			return nil, s.change(ctx, cid, "cms.voluntario_solicitado", map[string]any{"id": id, "esMenor": in.Body.EsMenor}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO voluntarios (id, competition_id, nombre, email, telefono, disponibilidad, roles, experiencia, es_menor, consentimiento_at, legal_version)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)`, id, cid, strings.TrimSpace(in.Body.Nombre), email, in.Body.Telefono, in.Body.Disponibilidad, roles,
					strings.TrimSpace(in.Body.Experiencia), in.Body.EsMenor, version); err != nil {
					return err
				}
				if err := events.Enqueue(ctx, tx, events.New(ctx, "cms.contacto", map[string]any{"email": email, "telefono": in.Body.Telefono, "nombre": strings.TrimSpace(in.Body.Nombre),
					"origen": "voluntarios", "relacion": map[string]any{"voluntario": true},
					"consentimientos": []map[string]any{{"finalidad": "privacidad", "estado": "confirmado", "version": version, "origen": "/voluntarios · formulario", "ip": httpx.ClientIPFrom(ctx)}},
					"actividad":       map[string]any{"tipo": "voluntario", "titulo": "Se ofreció como voluntario", "detalle": strings.Trim(detalle, " ·")}},
					events.Competition(cid.String()), events.Audience(events.Internal))); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "cms.email_solicitado", map[string]any{"para": email, "plantilla": "voluntario-recibido",
					"vars": map[string]string{"nombre": in.Body.Nombre}}, events.Competition(cid.String()), events.Audience(events.Internal)))
			})
		})
}

// Landing is a page built from sections (/publico, /en): published, visible sections in published order.
type Landing struct {
	Version   string                     `json:"version"`
	Secciones map[string]json.RawMessage `json:"secciones"`
	Orden     []string                   `json:"orden"`
}

type clubPub struct {
	Nombre      string `json:"nombre" db:"nombre"`
	Ciudad      string `json:"ciudad" db:"ciudad"`
	Provincia   string `json:"provincia" db:"provincia"`
	LogoURL     string `json:"logoUrl" db:"logo_url"`
	Web         string `json:"web" db:"web"`
	Instagram   string `json:"instagram" db:"instagram"`
	Etiquetas   string `json:"etiquetas" db:"etiquetas"`
	Rol         string `json:"rol" db:"rol"`
	AfiliadoAEP bool   `json:"afiliadoAep" db:"afiliado_aep"`
}

func (s *Svc) registerPublicExtra() {
	api := s.a.API
	pub := "/api/competiciones/{slug}"
	cacheHdr := "public, max-age=60"

	type landIn struct {
		Slug   string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Pagina string `path:"pagina" enum:"publico,en"`
	}
	type landOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         Landing
	}
	huma.Register(api, huma.Operation{OperationID: "landing-public", Method: http.MethodGet, Path: pub + "/web/{pagina}", Summary: "Contenido publicado de /publico o /en", Tags: tagPub},
		func(ctx context.Context, in *landIn) (*landOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			l, err := cached(ctx, s, cid, "landing:"+in.Pagina, ttlContent, func() (Landing, error) {
				secs, orden, err := s.publishedSections(ctx, cid, in.Pagina)
				return Landing{Version: s.version(ctx, cid), Secciones: secs, Orden: orden}, err
			})
			return &landOut{CacheControl: cacheHdr, Body: l}, err
		})

	type clubsOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         []clubPub
	}
	huma.Register(api, huma.Operation{OperationID: "clubs-public", Method: http.MethodGet, Path: pub + "/clubs", Summary: "Directorio de clubs publicados", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*clubsOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, "clubs", ttlContent, func() ([]clubPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT nombre, ciudad, provincia, logo_url, web, instagram, etiquetas, rol, afiliado_aep FROM clubs
					WHERE competition_id = $1 AND estado = 'publicado' ORDER BY orden, nombre`, cid)
				if err != nil {
					return nil, err
				}
				return collect[clubPub](rows)
			})
			return &clubsOut{CacheControl: cacheHdr, Body: list}, err
		})

	type clubSolIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Nombre           string `json:"nombre" minLength:"2" maxLength:"120"`
			Ciudad           string `json:"ciudad" minLength:"2" maxLength:"80"`
			Provincia        string `json:"provincia,omitempty" maxLength:"40"`
			Web              string `json:"web,omitempty" maxLength:"300"`
			Instagram        string `json:"instagram,omitempty" maxLength:"300"`
			AfiliadoAEP      bool   `json:"afiliadoAep,omitempty"`
			Email            string `json:"email" format:"email" maxLength:"254" doc:"Contacto para verificar el club (no se publica)"`
			AceptaPrivacidad bool   `json:"aceptaPrivacidad,omitempty" doc:"Obligatorio: casilla sin premarcar (si falta o es false → 422 CONSENTIMIENTO_OBLIGATORIO)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "clubs-public-solicitud", Method: http.MethodPost, Path: pub + "/clubs", Summary: "Proponer un club para el directorio (queda pendiente de revisión)", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *clubSolIn) (*struct{}, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "clubs", httpx.ClientIPFrom(ctx)), 3, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has enviado varias propuestas seguidas. Inténtalo más tarde.")
			}
			if !in.Body.AceptaPrivacidad {
				return nil, problem.Unprocessable("CONSENTIMIENTO_OBLIGATORIO", "Para enviar el club tienes que aceptar la política de privacidad.")
			}
			b := clubIn{Nombre: in.Body.Nombre, Ciudad: in.Body.Ciudad, Provincia: in.Body.Provincia, Web: in.Body.Web, Instagram: in.Body.Instagram}
			if err := validClub(&b); err != nil {
				return nil, err
			}
			var version string
			_ = s.a.DB.QueryRow(ctx, `SELECT version FROM legal WHERE competition_id = $1 AND tipo = 'privacidad' AND publicado_at IS NOT NULL ORDER BY publicado_at DESC LIMIT 1`, cid).Scan(&version)
			id := newID()
			return nil, s.change(ctx, cid, "cms.club_solicitado", map[string]any{"id": id, "nombre": b.Nombre}, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `INSERT INTO clubs (id, competition_id, nombre, ciudad, provincia, web, instagram, afiliado_aep, estado, contacto_email, consentimiento_at, legal_version, orden)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendiente',$9,now(),$10, (SELECT COALESCE(max(orden), 0) + 1 FROM clubs WHERE competition_id = $2))`,
					id, cid, b.Nombre, b.Ciudad, b.Provincia, b.Web, b.Instagram, in.Body.AfiliadoAEP, strings.ToLower(strings.TrimSpace(in.Body.Email)), version)
				return err
			})
		})
}

// publishedSections returns the published, visible sections of a page in published order.
func (s *Svc) publishedSections(ctx context.Context, cid uuid.UUID, pagina string) (map[string]json.RawMessage, []string, error) {
	secs, orden := map[string]json.RawMessage{}, []string{}
	rows, err := s.a.DB.Query(ctx, `SELECT clave, publicado FROM secciones WHERE competition_id = $1 AND pagina = $2 AND pub_visible AND publicado IS NOT NULL ORDER BY pub_orden, orden`, cid, pagina)
	if err != nil {
		return secs, orden, err
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var v json.RawMessage
		if err := rows.Scan(&k, &v); err != nil {
			return secs, orden, err
		}
		secs[k] = v
		orden = append(orden, k)
	}
	return secs, orden, rows.Err()
}

func collect[T any](rows pgx.Rows) ([]T, error) {
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[T])
	if list == nil {
		list = []T{}
	}
	return list, err
}

func (s *Svc) patrocinadores(ctx context.Context, cid uuid.UUID) ([]patroPub, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT nombre, nivel, logo_url, url, descripcion FROM patrocinadores WHERE competition_id = $1 AND activo ORDER BY orden`, cid)
	if err != nil {
		return nil, err
	}
	return collect[patroPub](rows)
}

func (s *Svc) home(ctx context.Context, cid uuid.UUID) (Home, error) {
	h := Home{Version: s.version(ctx, cid)}
	var err error
	if h.Secciones, h.Orden, err = s.publishedSections(ctx, cid, "home"); err != nil {
		return h, err
	}
	rows, err := s.a.DB.Query(ctx, `SELECT categoria, pregunta, respuesta FROM faq WHERE competition_id = $1 AND publicada AND destacada ORDER BY orden LIMIT 8`, cid)
	if err != nil {
		return h, err
	}
	if h.FaqDestacadas, err = collect[faqPub](rows); err != nil {
		return h, err
	}
	h.Patrocinadores, err = s.patrocinadores(ctx, cid)
	return h, err
}

// albumPub is a published album of /galeria.
type albumPub struct {
	Titulo string          `json:"titulo" db:"titulo"`
	Slug   string          `json:"slug" db:"slug"`
	Fotos  json.RawMessage `json:"fotos" db:"fotos"`
}

// conMedidas adds «ancho» and «alto» to the photos that come from the media library, so /galeria can lay out its
// mosaic before the images load (no layout shift). Photos with other URLs keep their JSON as it is.
func (s *Svc) conMedidas(ctx context.Context, cid uuid.UUID, list []albumPub) ([]albumPub, error) {
	ids := []uuid.UUID{}
	fotos := make([][]map[string]any, len(list))
	for i, a := range list {
		if err := json.Unmarshal(a.Fotos, &fotos[i]); err != nil {
			return nil, err
		}
		for _, f := range fotos[i] {
			u, _ := f["url"].(string)
			if id, err := uuid.Parse(strings.TrimPrefix(u, "/api/medios/")); err == nil && strings.HasPrefix(u, "/api/medios/") {
				ids = append(ids, id)
			}
		}
	}
	if len(ids) == 0 {
		return list, nil
	}
	medidas := map[string][2]int{}
	rows, err := s.a.DB.Query(ctx, `SELECT id, ancho, alto FROM medios WHERE competition_id = $1 AND id = ANY($2) AND ancho > 0 AND alto > 0`, cid, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id uuid.UUID
		var w, h int
		if err := rows.Scan(&id, &w, &h); err != nil {
			rows.Close()
			return nil, err
		}
		medidas["/api/medios/"+id.String()] = [2]int{w, h}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range list {
		for _, f := range fotos[i] {
			u, _ := f["url"].(string)
			if m, ok := medidas[u]; ok {
				f["ancho"], f["alto"] = m[0], m[1]
			}
		}
		b, err := json.Marshal(fotos[i])
		if err != nil {
			return nil, err
		}
		list[i].Fotos = b
	}
	return list, nil
}

// rolesVoluntario are the roles of /voluntarios (Figma 33).
var rolesVoluntario = map[string]bool{"jueces": true, "cargadores": true, "mesa": true, "foto": true, "acreditaciones": true}
