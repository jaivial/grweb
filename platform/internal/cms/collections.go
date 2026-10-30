package cms

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

func validURL(u string, allowRelative bool) bool {
	if u == "" {
		return true
	}
	if allowRelative && strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//") {
		return true
	}
	p, err := url.Parse(u)
	return err == nil && (p.Scheme == "https" || p.Scheme == "http") && p.Host != ""
}

// ---- FAQ ----

type faqRow struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Categoria string    `json:"categoria" db:"categoria"`
	Pregunta  string    `json:"pregunta" db:"pregunta"`
	Respuesta string    `json:"respuesta" db:"respuesta"`
	Orden     int       `json:"orden" db:"orden"`
	Destacada bool      `json:"destacada" db:"destacada" doc:"Aparece en la home"`
	Publicada bool      `json:"publicada" db:"publicada"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
}

type faqIn struct {
	Categoria string `json:"categoria" minLength:"1" maxLength:"40"`
	Pregunta  string `json:"pregunta" minLength:"3" maxLength:"200"`
	Respuesta string `json:"respuesta" minLength:"1" maxLength:"4000" doc:"Markdown"`
	Destacada bool   `json:"destacada,omitempty"`
	Publicada bool   `json:"publicada,omitempty"`
}

// ---- Patrocinadores ----

type patroRow struct {
	ID      uuid.UUID `json:"id" db:"id"`
	Nombre  string    `json:"nombre" db:"nombre"`
	Nivel   string    `json:"nivel" db:"nivel"`
	LogoURL string    `json:"logoUrl" db:"logo_url"`
	URL     string    `json:"url" db:"url"`
	Orden   int       `json:"orden" db:"orden"`
	Activo  bool      `json:"activo" db:"activo"`
}

type patroIn struct {
	Nombre  string `json:"nombre" minLength:"1" maxLength:"120"`
	Nivel   string `json:"nivel" enum:"principal,oro,plata,colaborador,institucional"`
	LogoURL string `json:"logoUrl,omitempty" maxLength:"500"`
	URL     string `json:"url,omitempty" maxLength:"500"`
	Activo  bool   `json:"activo,omitempty"`
}

// ---- SEO and redirects ----

type seoRow struct {
	ID          uuid.UUID `json:"id" db:"id"`
	Ruta        string    `json:"ruta" db:"ruta"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description" db:"description"`
	ImagenURL   string    `json:"imagenUrl" db:"imagen_url"`
	Indexable   bool      `json:"indexable" db:"indexable"`
	Orden       int       `json:"orden" db:"orden"`
}

type seoIn struct {
	Ruta        string `json:"ruta" pattern:"^/[a-z0-9/._-]*$" maxLength:"200"`
	Title       string `json:"title,omitempty" maxLength:"70" doc:"≤ 60–70 caracteres para que no se corte en Google"`
	Description string `json:"description,omitempty" maxLength:"170"`
	ImagenURL   string `json:"imagenUrl,omitempty" maxLength:"500"`
	Indexable   bool   `json:"indexable,omitempty"`
}

type redirRow struct {
	ID     uuid.UUID `json:"id" db:"id"`
	Desde  string    `json:"desde" db:"desde"`
	Hacia  string    `json:"hacia" db:"hacia"`
	Codigo int16     `json:"codigo" db:"codigo"`
	Orden  int       `json:"orden" db:"orden"`
}

type redirIn struct {
	Desde  string `json:"desde" pattern:"^/" maxLength:"300"`
	Hacia  string `json:"hacia" maxLength:"500"`
	Codigo int16  `json:"codigo,omitempty" enum:"301,302,308" default:"301"`
}

// ---- Páginas y blog ----

type paginaRow struct {
	ID         uuid.UUID  `json:"id" db:"id"`
	Tipo       string     `json:"tipo" db:"tipo"`
	Slug       string     `json:"slug" db:"slug"`
	Titulo     string     `json:"titulo" db:"titulo"`
	Resumen    string     `json:"resumen" db:"resumen"`
	Cuerpo     string     `json:"cuerpo" db:"cuerpo"`
	PortadaURL string     `json:"portadaUrl" db:"portada_url"`
	Publicada  bool       `json:"publicada" db:"publicada"`
	PublicarAt *time.Time `json:"publicarAt,omitempty" db:"publicar_at"`
	Orden      int        `json:"orden" db:"orden"`
	UpdatedAt  time.Time  `json:"updatedAt" db:"updated_at"`
}

type paginaIn struct {
	Slug       string     `json:"slug" pattern:"^[a-z0-9][a-z0-9-]{0,80}$"`
	Titulo     string     `json:"titulo" minLength:"2" maxLength:"140"`
	Resumen    string     `json:"resumen,omitempty" maxLength:"300"`
	Cuerpo     string     `json:"cuerpo,omitempty" maxLength:"60000" doc:"Markdown"`
	PortadaURL string     `json:"portadaUrl,omitempty" maxLength:"500"`
	Publicada  bool       `json:"publicada,omitempty"`
	PublicarAt *time.Time `json:"publicarAt,omitempty" doc:"Publicación programada"`
}

// ---- Clubs (/clubs) ----

type clubRow struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	Nombre        string     `json:"nombre" db:"nombre"`
	Ciudad        string     `json:"ciudad" db:"ciudad"`
	Provincia     string     `json:"provincia" db:"provincia"`
	LogoURL       string     `json:"logoUrl" db:"logo_url"`
	Web           string     `json:"web" db:"web"`
	Instagram     string     `json:"instagram" db:"instagram"`
	Etiquetas     string     `json:"etiquetas" db:"etiquetas"`
	Rol           string     `json:"rol" db:"rol"`
	AfiliadoAEP   bool       `json:"afiliadoAep" db:"afiliado_aep"`
	Estado        string     `json:"estado" db:"estado"`
	ContactoEmail string     `json:"contactoEmail" db:"contacto_email" doc:"Solo si llegó desde el formulario público"`
	Consentido    *time.Time `json:"consentimientoAt,omitempty" db:"consentimiento_at"`
	Orden         int        `json:"orden" db:"orden"`
	CreatedAt     time.Time  `json:"createdAt" db:"created_at"`
}

type clubIn struct {
	Nombre      string `json:"nombre" minLength:"2" maxLength:"120"`
	Ciudad      string `json:"ciudad,omitempty" maxLength:"80"`
	Provincia   string `json:"provincia,omitempty" maxLength:"40"`
	LogoURL     string `json:"logoUrl,omitempty" maxLength:"500"`
	Web         string `json:"web,omitempty" maxLength:"300"`
	Instagram   string `json:"instagram,omitempty" maxLength:"300"`
	Etiquetas   string `json:"etiquetas,omitempty" maxLength:"120" doc:"Separadas por comas (p. ej. «Powerlifting, AEP»)"`
	Rol         string `json:"rol,omitempty" enum:"organizador,colaborador,club" default:"club"`
	AfiliadoAEP bool   `json:"afiliadoAep,omitempty"`
	Estado      string `json:"estado,omitempty" enum:"publicado,pendiente,oculto" default:"publicado"`
}

func validClub(in *clubIn) error {
	trimAll(&in.Nombre, &in.Ciudad, &in.Provincia, &in.LogoURL, &in.Web, &in.Instagram, &in.Etiquetas)
	https := func(u string) bool {
		return u == "" || (strings.HasPrefix(u, "https://") && validURL(u, false) && strings.Contains(u[8:], "."))
	}
	if !validURL(in.LogoURL, true) || !https(in.Web) || !https(in.Instagram) {
		return problem.Unprocessable("URL_INVALIDA", "El logo, la web y el Instagram deben ser enlaces https.")
	}
	return nil
}

// ---- Galería ----

type foto struct {
	URL    string `json:"url,omitempty" maxLength:"500"`
	Alt    string `json:"alt,omitempty" maxLength:"200"`
	FocalX int    `json:"focalX" minimum:"0" maximum:"100" default:"50"`
	FocalY int    `json:"focalY" minimum:"0" maximum:"100" default:"50"`
	// Filter of /galeria: plataforma · calentamiento · podio · ambiente (empty: only «Todas» and the album).
	Etiqueta string `json:"etiqueta,omitempty" maxLength:"20"`
}

// etiquetasFoto are the /galeria filters a photo can have.
var etiquetasFoto = map[string]bool{"": true, "plataforma": true, "calentamiento": true, "podio": true, "ambiente": true}

type albumRow struct {
	ID        uuid.UUID       `json:"id" db:"id"`
	Titulo    string          `json:"titulo" db:"titulo"`
	Slug      string          `json:"slug" db:"slug"`
	Fotos     json.RawMessage `json:"fotos" db:"fotos"`
	Publicado bool            `json:"publicado" db:"publicado"`
	Orden     int             `json:"orden" db:"orden"`
}

type albumIn struct {
	Titulo    string `json:"titulo" minLength:"2" maxLength:"120"`
	Slug      string `json:"slug" pattern:"^[a-z0-9][a-z0-9-]{0,80}$"`
	Fotos     []foto `json:"fotos,omitempty" maxItems:"300"`
	Publicado bool   `json:"publicado,omitempty"`
}

// ---- Voluntarios (admin side; they are created from the public form) ----

type volRow struct {
	ID              uuid.UUID `json:"id" db:"id"`
	Nombre          string    `json:"nombre" db:"nombre"`
	Email           string    `json:"email" db:"email"`
	Telefono        string    `json:"telefono" db:"telefono"`
	Disponibilidad  string    `json:"disponibilidad" db:"disponibilidad"`
	Puesto          string    `json:"puesto" db:"puesto"`
	EsMenor         bool      `json:"esMenor" db:"es_menor"`
	AutorizacionURL string    `json:"autorizacionUrl" db:"autorizacion_url"`
	Notas           string    `json:"notas" db:"notas"`
	Estado          string    `json:"estado" db:"estado"`
	CreatedAt       time.Time `json:"createdAt" db:"created_at"`
}

type volIn struct {
	Puesto          string `json:"puesto,omitempty" maxLength:"80"`
	Estado          string `json:"estado" enum:"pendiente,confirmado,descartado"`
	Notas           string `json:"notas,omitempty" maxLength:"1000"`
	AutorizacionURL string `json:"autorizacionUrl,omitempty" maxLength:"500" doc:"Autorización firmada del tutor (menores)"`
}

func (s *Svc) registerCollections() {
	tagWeb := "Web y contenidos"
	register(s, collection[faqRow, faqIn]{
		name: "faq", path: "/web/faq", table: "faq", tag: tagWeb, perm: "web.editar", order: "categoria, orden, pregunta",
		cols:     "id, categoria, pregunta, respuesta, orden, destacada, publicada, updated_at",
		validate: func(in *faqIn) error { trimAll(&in.Categoria, &in.Pregunta, &in.Respuesta); return nil },
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *faqIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO faq (id, competition_id, categoria, pregunta, respuesta, destacada, publicada, orden)
				VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(orden),0)+1 FROM faq WHERE competition_id = $2))`, id, cid, in.Categoria, in.Pregunta, in.Respuesta, in.Destacada, in.Publicada)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *faqIn) error {
			_, err := tx.Exec(ctx, `UPDATE faq SET categoria=$3, pregunta=$4, respuesta=$5, destacada=$6, publicada=$7, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				cid, id, in.Categoria, in.Pregunta, in.Respuesta, in.Destacada, in.Publicada)
			return err
		},
	})
	register(s, collection[patroRow, patroIn]{
		name: "patrocinadores", path: "/web/patrocinadores", table: "patrocinadores", tag: tagWeb, perm: "web.editar", order: "orden, nombre",
		cols: "id, nombre, nivel, logo_url, url, orden, activo",
		validate: func(in *patroIn) error {
			trimAll(&in.Nombre, &in.LogoURL, &in.URL)
			if !validURL(in.URL, false) || !validURL(in.LogoURL, true) {
				return problem.Unprocessable("URL_INVALIDA", "Revisa los enlaces (https://…).")
			}
			return nil
		},
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *patroIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, orden)
				VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(orden),0)+1 FROM patrocinadores WHERE competition_id = $2))`, id, cid, in.Nombre, in.Nivel, in.LogoURL, in.URL, in.Activo)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *patroIn) error {
			_, err := tx.Exec(ctx, `UPDATE patrocinadores SET nombre=$3, nivel=$4, logo_url=$5, url=$6, activo=$7, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				cid, id, in.Nombre, in.Nivel, in.LogoURL, in.URL, in.Activo)
			return err
		},
	})
	register(s, collection[seoRow, seoIn]{
		name: "seo", path: "/web/seo", table: "seo", tag: tagWeb, perm: "web.editar", order: "ruta",
		cols:     "id, ruta, title, description, imagen_url, indexable, orden",
		validate: func(in *seoIn) error { trimAll(&in.Title, &in.Description, &in.ImagenURL); return nil },
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *seoIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO seo (id, competition_id, ruta, title, description, imagen_url, indexable) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				id, cid, in.Ruta, in.Title, in.Description, in.ImagenURL, in.Indexable)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *seoIn) error {
			_, err := tx.Exec(ctx, `UPDATE seo SET ruta=$3, title=$4, description=$5, imagen_url=$6, indexable=$7, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				cid, id, in.Ruta, in.Title, in.Description, in.ImagenURL, in.Indexable)
			return err
		},
	})
	register(s, collection[redirRow, redirIn]{
		name: "redirecciones", path: "/web/redirecciones", table: "redirecciones", tag: tagWeb, perm: "web.editar", order: "desde",
		cols: "id, desde, hacia, codigo, orden",
		validate: func(in *redirIn) error {
			trimAll(&in.Desde, &in.Hacia)
			// The SSR server applies redirects to page routes only (not "/", "/api/…" or files with an extension).
			if in.Desde == "/" || strings.HasPrefix(in.Desde, "/api/") || strings.HasPrefix(in.Desde, "//") || strings.Contains(in.Desde, ".") {
				return problem.Unprocessable("ORIGEN_INVALIDO", "El origen debe ser una ruta de página, distinta de «/» y sin extensión.")
			}
			if in.Hacia == "" || !validURL(in.Hacia, true) || in.Desde == in.Hacia {
				return problem.Unprocessable("DESTINO_INVALIDO", "El destino debe ser una ruta (/…) o una URL https distinta del origen.")
			}
			return nil
		},
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *redirIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO redirecciones (id, competition_id, desde, hacia, codigo) VALUES ($1,$2,$3,$4,$5)`, id, cid, in.Desde, in.Hacia, in.Codigo)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *redirIn) error {
			_, err := tx.Exec(ctx, `UPDATE redirecciones SET desde=$3, hacia=$4, codigo=$5, updated_at=now() WHERE competition_id=$1 AND id=$2`, cid, id, in.Desde, in.Hacia, in.Codigo)
			return err
		},
	})
	for _, tipo := range []string{"pagina", "blog"} {
		path, name := "/web/paginas", "paginas"
		if tipo == "blog" {
			path, name = "/web/blog", "blog"
		}
		register(s, collection[paginaRow, paginaIn]{
			name: name, path: path, table: "paginas", scope: "tipo = '" + tipo + "'", tag: tagWeb, perm: "web.editar", order: "orden, created_at DESC",
			cols: "id, tipo, slug, titulo, resumen, cuerpo, portada_url, publicada, publicar_at, orden, updated_at",
			validate: func(in *paginaIn) error {
				trimAll(&in.Titulo, &in.Resumen, &in.PortadaURL)
				if !validURL(in.PortadaURL, true) {
					return problem.Unprocessable("URL_INVALIDA", "La portada debe ser una URL https o una ruta /api/medios/…")
				}
				return nil
			},
			insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *paginaIn) error {
				_, err := tx.Exec(ctx, `INSERT INTO paginas (id, competition_id, tipo, slug, titulo, resumen, cuerpo, portada_url, publicada, publicar_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
					id, cid, tipo, in.Slug, in.Titulo, in.Resumen, in.Cuerpo, in.PortadaURL, in.Publicada, in.PublicarAt)
				return err
			},
			update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *paginaIn) error {
				_, err := tx.Exec(ctx, `UPDATE paginas SET slug=$3, titulo=$4, resumen=$5, cuerpo=$6, portada_url=$7, publicada=$8, publicar_at=$9, updated_at=now() WHERE competition_id=$1 AND id=$2`,
					cid, id, in.Slug, in.Titulo, in.Resumen, in.Cuerpo, in.PortadaURL, in.Publicada, in.PublicarAt)
				return err
			},
		})
	}
	register(s, collection[albumRow, albumIn]{
		name: "albumes", path: "/web/albumes", table: "albumes", tag: tagWeb, perm: "web.editar", order: "orden, created_at DESC",
		cols: "id, titulo, slug, fotos, publicado, orden",
		validate: func(in *albumIn) error {
			for _, f := range in.Fotos {
				if !validURL(f.URL, true) {
					return problem.Unprocessable("URL_INVALIDA", "Foto con URL no válida: "+f.URL)
				}
				if !etiquetasFoto[f.Etiqueta] {
					return problem.Unprocessable("ETIQUETA_INVALIDA", "Etiqueta de foto no válida: "+f.Etiqueta+" (plataforma, calentamiento, podio o ambiente).")
				}
			}
			if in.Fotos == nil {
				in.Fotos = []foto{}
			}
			return nil
		},
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *albumIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO albumes (id, competition_id, titulo, slug, fotos, publicado) VALUES ($1,$2,$3,$4,$5,$6)`, id, cid, in.Titulo, in.Slug, in.Fotos, in.Publicado)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *albumIn) error {
			_, err := tx.Exec(ctx, `UPDATE albumes SET titulo=$3, slug=$4, fotos=$5, publicado=$6, updated_at=now() WHERE competition_id=$1 AND id=$2`, cid, id, in.Titulo, in.Slug, in.Fotos, in.Publicado)
			return err
		},
	})
	register(s, collection[clubRow, clubIn]{
		name: "clubs", path: "/web/clubs", table: "clubs", tag: tagWeb, perm: "web.editar", order: "orden, nombre",
		cols:     "id, nombre, ciudad, provincia, logo_url, web, instagram, etiquetas, rol, afiliado_aep, estado, contacto_email, consentimiento_at, orden, created_at",
		validate: validClub,
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *clubIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO clubs (id, competition_id, nombre, ciudad, provincia, logo_url, web, instagram, etiquetas, rol, afiliado_aep, estado, orden)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, (SELECT COALESCE(max(orden), 0) + 1 FROM clubs WHERE competition_id = $2))`,
				id, cid, in.Nombre, in.Ciudad, in.Provincia, in.LogoURL, in.Web, in.Instagram, in.Etiquetas, in.Rol, in.AfiliadoAEP, in.Estado)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *clubIn) error {
			_, err := tx.Exec(ctx, `UPDATE clubs SET nombre=$3, ciudad=$4, provincia=$5, logo_url=$6, web=$7, instagram=$8, etiquetas=$9, rol=$10, afiliado_aep=$11, estado=$12, updated_at=now()
				WHERE competition_id=$1 AND id=$2`, cid, id, in.Nombre, in.Ciudad, in.Provincia, in.LogoURL, in.Web, in.Instagram, in.Etiquetas, in.Rol, in.AfiliadoAEP, in.Estado)
			return err
		},
	})
	register(s, collection[volRow, volIn]{
		name: "voluntarios", path: "/voluntarios", table: "voluntarios", tag: tagWeb, perm: "web.editar", order: "created_at DESC", noCreate: true,
		cols: "id, nombre, email::text AS email, telefono, disponibilidad, puesto, es_menor, autorizacion_url, notas, estado, created_at",
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *volIn) error {
			var menor bool
			if err := tx.QueryRow(ctx, `SELECT es_menor FROM voluntarios WHERE competition_id=$1 AND id=$2`, cid, id).Scan(&menor); err != nil {
				return problem.NotFound("No encontrado.")
			}
			if menor && in.Estado == "confirmado" && strings.TrimSpace(in.AutorizacionURL) == "" {
				return problem.Unprocessable("AUTORIZACION_OBLIGATORIA", "Un voluntario menor de edad necesita la autorización firmada del tutor antes de confirmarlo.")
			}
			_, err := tx.Exec(ctx, `UPDATE voluntarios SET puesto=$3, estado=$4, notas=$5, autorizacion_url=$6, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				cid, id, in.Puesto, in.Estado, in.Notas, in.AutorizacionURL)
			return err
		},
	})
}
