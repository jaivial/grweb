package cms

import (
	"bytes"
	"context"
	"image"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/storage"
)

// Access maps (/mapa-de-accesos): the staff uploads one or more images for athletes and public, with an
// optional title, subtitle and description, and sorts them. The file goes to the CDN (Bunny) and only its
// URL is stored. The public page reads them by REST and follows the changes by SSE («web.mapas»).

// evMapas is the public event of every change of the collection.
const evMapas = "web.mapas"

// maxMapa is the size limit of an access map.
const maxMapa = 10 << 20

// tiposMapa are the image types of an access map (no PDF: the page shows the images inline).
var tiposMapa = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

type mapaRow struct {
	ID          uuid.UUID `json:"id" db:"id"`
	ImagenURL   string    `json:"imagenUrl" db:"imagen_url"`
	Titulo      string    `json:"titulo" db:"titulo"`
	Subtitulo   string    `json:"subtitulo" db:"subtitulo"`
	Descripcion string    `json:"descripcion" db:"descripcion"`
	Orden       int       `json:"orden" db:"orden"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

type mapaIn struct {
	ImagenURL   string `json:"imagenUrl" minLength:"1" maxLength:"500" doc:"URL del CDN que devuelve la subida"`
	Titulo      string `json:"titulo,omitempty" maxLength:"120"`
	Subtitulo   string `json:"subtitulo,omitempty" maxLength:"160"`
	Descripcion string `json:"descripcion,omitempty" maxLength:"1000"`
}

type mapaPub struct {
	ImagenURL   string `json:"imagenUrl" db:"imagen_url"`
	Titulo      string `json:"titulo" db:"titulo"`
	Subtitulo   string `json:"subtitulo" db:"subtitulo"`
	Descripcion string `json:"descripcion" db:"descripcion"`
}

// tipoMapa checks the size and the real type of an access map (sniffed from the bytes, never the header the
// client sends) and returns its content type and file extension.
func tipoMapa(data []byte) (tipo, ext string, err error) {
	if len(data) > maxMapa {
		return "", "", problem.Unprocessable("ARCHIVO_GRANDE", "La imagen supera los 10 MB.")
	}
	tipo = http.DetectContentType(data)
	ext, ok := tiposMapa[tipo]
	if !ok {
		return "", "", problem.Unprocessable("TIPO_NO_PERMITIDO", "Solo imágenes JPG, PNG o WebP.")
	}
	if _, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil {
		return "", "", problem.Unprocessable("IMAGEN_INVALIDA", "No se pudo leer la imagen.")
	}
	return tipo, ext, nil
}

// almacenMapas returns where the access maps live and the base of their public URLs: Bunny (the «bunny»
// integration of the competition) or, without credentials (QA), the media volume of this service.
func (s *Svc) almacenMapas(ctx context.Context, cid uuid.UUID) (storage.Storage, string) {
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/bunny", nil, &out); err == nil {
		if zona, cdn := out.Config["zona"], out.Config["cdnUrl"]; zona != "" && cdn != "" && out.Secreto != "" {
			return storage.Bunny{Zona: zona, Clave: out.Secreto, CDNURL: cdn, Region: out.Config["region"]}, cdn
		}
	}
	base := s.webURL + "/api/medios/mapas"
	return storage.Local{Dir: filepath.Join(s.mediaDir, "mapas"), BaseURL: base}, base
}

// borrarMapa removes the file of a deleted map. Only the keys of this flow («mapas/…») are touched: a URL
// typed by hand or of the media library stays where it is.
func (s *Svc) borrarMapa(ctx context.Context, cid uuid.UUID, r mapaRow) {
	st, base := s.almacenMapas(ctx, cid)
	key, ok := storage.ClaveDeURL(base, r.ImagenURL)
	if !ok || !(strings.HasPrefix(key, "mapas/") || strings.HasPrefix(key, "mapas-")) {
		return
	}
	// Another map (a pasted URL, also of another competition) may still show this file.
	var enUso bool
	if err := s.a.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM mapas_acceso WHERE imagen_url = $1)`, r.ImagenURL).Scan(&enUso); err != nil || enUso {
		return
	}
	if err := st.Delete(ctx, key); err != nil {
		s.a.Log.Warn("no se ha podido borrar el mapa de accesos del almacén", "err", err, "key", key)
	}
}

func (s *Svc) registerMapas() {
	api := s.a.API
	// shortcut: replacing the image of a map leaves the old file in the CDN; delete it in update if storage cost matters.
	register(s, collection[mapaRow, mapaIn]{
		name: "mapas", path: "/web/mapas", table: "mapas_acceso", tag: "Web y contenidos", perm: "web.editar", order: "orden, created_at",
		cols: "id, imagen_url, titulo, subtitulo, descripcion, orden, updated_at", public: evMapas, deleted: s.borrarMapa,
		validate: func(in *mapaIn) error {
			trimAll(&in.ImagenURL, &in.Titulo, &in.Subtitulo, &in.Descripcion)
			if in.ImagenURL == "" || !validURL(in.ImagenURL, false) {
				return problem.Unprocessable("URL_INVALIDA", "Sube la imagen del mapa (o pega su URL https://…).")
			}
			return nil
		},
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *mapaIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO mapas_acceso (id, competition_id, imagen_url, titulo, subtitulo, descripcion, orden)
				VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(orden),0)+1 FROM mapas_acceso WHERE competition_id = $2))`, id, cid, in.ImagenURL, in.Titulo, in.Subtitulo, in.Descripcion)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *mapaIn) error {
			_, err := tx.Exec(ctx, `UPDATE mapas_acceso SET imagen_url=$3, titulo=$4, subtitulo=$5, descripcion=$6, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				cid, id, in.ImagenURL, in.Titulo, in.Subtitulo, in.Descripcion)
			return err
		},
	})

	// Upload of the image: validated, published in the CDN and answered with its URL (the form then saves the map).
	type upIn struct {
		CID     uuid.UUID `path:"cid"`
		RawBody multipart.Form
	}
	type upOut struct {
		Body struct {
			URL string `json:"url"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "mapas-imagen", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/web/mapas/imagen", Summary: "Subir la imagen de un mapa de accesos al CDN (JPG, PNG o WebP, máx. 10 MB)",
		Tags: []string{"Web y contenidos"}, Security: bearer, DefaultStatus: http.StatusCreated, MaxBodyBytes: maxUpload, BodyReadTimeout: time.Minute},
		func(ctx context.Context, in *upIn) (*upOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			files := in.RawBody.File["file"]
			if len(files) != 1 {
				return nil, problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta una imagen en el campo «file».")
			}
			if files[0].Size > maxMapa {
				return nil, problem.Unprocessable("ARCHIVO_GRANDE", "La imagen supera los 10 MB.")
			}
			f, err := files[0].Open()
			if err != nil {
				return nil, err
			}
			defer f.Close()
			data, err := io.ReadAll(f)
			if err != nil {
				return nil, err
			}
			tipo, ext, err := tipoMapa(data)
			if err != nil {
				return nil, err
			}
			st, _ := s.almacenMapas(ctx, in.CID)
			key := "mapas/" + newID().String() + ext
			url, err := st.Put(ctx, key, tipo, data)
			if err != nil {
				s.a.Log.Error("no se ha podido publicar el mapa de accesos", "err", err, "key", key)
				return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido subir la imagen. Inténtalo en unos minutos.")
			}
			out := &upOut{}
			out.Body.URL = url
			return out, nil
		})

	// The maps kept in the volume of the service (QA without Bunny): immutable files, a new upload gets a new name.
	s.a.Mux.HandleFunc("GET /api/medios/mapas/{nombre}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, filepath.Join(s.mediaDir, "mapas", filepath.Base(r.PathValue("nombre"))))
	})

	// Public list, in the order of the backoffice. No browser cache: the page reloads it on every «web.mapas» event.
	type mapasOut struct{ Body []mapaPub }
	huma.Register(api, huma.Operation{OperationID: "mapas-public", Method: http.MethodGet, Path: "/api/competiciones/{slug}/mapas", Summary: "Mapas de accesos, en orden", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*mapasOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, "mapas", ttlContent, func() ([]mapaPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT imagen_url, titulo, subtitulo, descripcion FROM mapas_acceso WHERE competition_id = $1 ORDER BY orden, created_at`, cid)
				if err != nil {
					return nil, err
				}
				return collect[mapaPub](rows)
			})
			return &mapasOut{Body: list}, err
		})
}
