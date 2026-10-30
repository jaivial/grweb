package cms

import (
	"context"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	_ "golang.org/x/image/webp"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tiposMedio = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf"}

type medio struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Nombre    string    `json:"nombre" db:"nombre"`
	Tipo      string    `json:"tipo" db:"tipo"`
	Bytes     int64     `json:"bytes" db:"bytes"`
	Ancho     int       `json:"ancho" db:"ancho"`
	Alto      int       `json:"alto" db:"alto"`
	FocalX    int16     `json:"focalX" db:"focal_x"`
	FocalY    int16     `json:"focalY" db:"focal_y"`
	Alt       string    `json:"alt" db:"alt"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	URL       string    `json:"url" db:"-"`
}

const selMedio = `SELECT id, nombre, tipo, bytes, ancho, alto, focal_x, focal_y, alt, created_at FROM medios`

func (m *medio) withURL() *medio { m.URL = "/api/medios/" + m.ID.String(); return m }

func (s *Svc) path(cid, id uuid.UUID, tipo string) string {
	return filepath.Join(s.mediaDir, cid.String(), id.String()+tiposMedio[tipo])
}

func (s *Svc) registerMedios() {
	api := s.a.API
	tags := []string{"Medios"}
	base := "/api/admin/competiciones/{cid}/medios"

	type listOut struct{ Body []medio }
	huma.Register(api, huma.Operation{OperationID: "medios-list", Method: http.MethodGet, Path: base, Summary: "Biblioteca de medios", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidPath) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selMedio+` WHERE competition_id = $1 ORDER BY created_at DESC LIMIT 500`, in.CID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[medio])
			for i := range list {
				list[i].withURL()
			}
			if list == nil {
				list = []medio{}
			}
			return &listOut{Body: list}, err
		})

	type upIn struct {
		CID     uuid.UUID `path:"cid"`
		RawBody multipart.Form
	}
	type oneOut struct{ Body medio }
	huma.Register(api, huma.Operation{OperationID: "medios-upload", Method: http.MethodPost, Path: base, Summary: "Subir una imagen o PDF (máx. 10 MB)", Tags: tags, Security: bearer, DefaultStatus: http.StatusCreated,
		MaxBodyBytes: maxUpload, BodyReadTimeout: time.Minute},
		func(ctx context.Context, in *upIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			m, err := s.upload(ctx, in.CID, &in.RawBody)
			if err != nil {
				return nil, err
			}
			return &oneOut{Body: m}, nil
		})

	// Internal upload for other services (e.g. athletes: photos from the athlete area), field «competicion» = id.
	type upInt struct {
		RawBody multipart.Form
	}
	huma.Register(api, huma.Operation{OperationID: "medios-upload-internal", Method: http.MethodPost, Path: "/internal/medios", Summary: "Subir un medio en nombre de otro servicio", Tags: []string{"Interno"}, Hidden: true,
		DefaultStatus: http.StatusCreated, MaxBodyBytes: maxUpload, BodyReadTimeout: time.Minute},
		func(ctx context.Context, in *upInt) (*oneOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			v := in.RawBody.Value["competicion"]
			if len(v) == 0 {
				return nil, problem.Unprocessable("COMPETICION_OBLIGATORIA", "Falta el campo «competicion».")
			}
			cid, err := uuid.Parse(v[0])
			if err != nil {
				return nil, problem.Unprocessable("COMPETICION_OBLIGATORIA", "«competicion» no es un id válido.")
			}
			m, err := s.upload(ctx, cid, &in.RawBody)
			if err != nil {
				return nil, err
			}
			return &oneOut{Body: m}, nil
		})

	type patchIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Alt    *string `json:"alt,omitempty" maxLength:"200"`
			FocalX *int16  `json:"focalX,omitempty" minimum:"0" maximum:"100"`
			FocalY *int16  `json:"focalY,omitempty" minimum:"0" maximum:"100"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "medios-update", Method: http.MethodPatch, Path: base + "/{id}", Summary: "Texto alternativo y punto focal", Tags: tags, Security: bearer},
		func(ctx context.Context, in *patchIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			var m medio
			err := s.change(ctx, in.CID, "cms.medio_actualizado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE medios SET alt = COALESCE($3, alt), focal_x = COALESCE($4, focal_x), focal_y = COALESCE($5, focal_y) WHERE competition_id = $1 AND id = $2`,
					in.CID, in.ID, in.Body.Alt, in.Body.FocalX, in.Body.FocalY); err != nil {
					return err
				}
				rows, err := tx.Query(ctx, selMedio+` WHERE competition_id = $1 AND id = $2`, in.CID, in.ID)
				if err != nil {
					return err
				}
				m, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[medio])
				if err != nil {
					return problem.NotFound("Medio no encontrado.")
				}
				return nil
			})
			return &oneOut{Body: *m.withURL()}, err
		})

	huma.Register(api, huma.Operation{OperationID: "medios-delete", Method: http.MethodDelete, Path: base + "/{id}", Summary: "Borrar un medio", Tags: tags, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idPath) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			var tipo string
			err := s.change(ctx, in.CID, "cms.medio_eliminado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				err := tx.QueryRow(ctx, `DELETE FROM medios WHERE competition_id = $1 AND id = $2 RETURNING tipo`, in.CID, in.ID).Scan(&tipo)
				if errors.Is(err, pgx.ErrNoRows) {
					return problem.NotFound("Medio no encontrado.")
				}
				return err
			})
			if err != nil {
				return nil, err
			}
			_ = os.Remove(s.path(in.CID, in.ID, tipo))
			borrarVariantes(s.path(in.CID, in.ID, tipo))
			return nil, nil
		})

	// Public file: immutable (a new upload gets a new id). «?w=480|960|1600» serves a resized JPEG copy (variantes.go).
	s.a.Mux.HandleFunc("GET /api/medios/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		var cid uuid.UUID
		var tipo, nombre string
		if err := s.a.DB.QueryRow(r.Context(), `SELECT competition_id, tipo, nombre FROM medios WHERE id = $1`, id).Scan(&cid, &tipo, &nombre); err != nil {
			http.NotFound(w, r)
			return
		}
		ruta := s.path(cid, id, tipo)
		if q := r.URL.Query().Get("w"); q != "" {
			ancho, err := strconv.Atoi(q)
			if err != nil || !anchosVariante[ancho] {
				http.Error(w, "w: 480, 960 o 1600", http.StatusBadRequest)
				return
			}
			v, err := variante(ruta, tipo, ancho)
			if err != nil {
				s.a.Log.Warn("variante de medio", "id", id, "w", ancho, "err", err)
			} else if v != ruta {
				ruta, tipo = v, "image/jpeg"
			}
		}
		w.Header().Set("Content-Type", tipo)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if tipo == "application/pdf" {
			// RFC 6266 / 2231: non-ASCII names are sent as filename*=utf-8''…
			w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": nombre}))
		}
		http.ServeFile(w, r, ruta)
	})
}

// upload stores a multipart file («file», optional «alt») in the media library of competition cid.
func (s *Svc) upload(ctx context.Context, cid uuid.UUID, form *multipart.Form) (medio, error) {
	files := form.File["file"]
	if len(files) != 1 {
		return medio{}, problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta un archivo en el campo «file».")
	}
	fh := files[0]
	if fh.Size > 10<<20 {
		return medio{}, problem.Unprocessable("ARCHIVO_GRANDE", "El archivo supera los 10 MB.")
	}
	f, err := fh.Open()
	if err != nil {
		return medio{}, err
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	tipo := http.DetectContentType(head[:n])
	if strings.HasPrefix(tipo, "text/xml") || tipo == "application/octet-stream" { // webp is detected as image/webp; reject unknown
		return medio{}, problem.Unprocessable("TIPO_NO_PERMITIDO", "Solo imágenes JPG, PNG, WebP, GIF o PDF.")
	}
	if _, ok := tiposMedio[tipo]; !ok {
		return medio{}, problem.Unprocessable("TIPO_NO_PERMITIDO", "Solo imágenes JPG, PNG, WebP, GIF o PDF.")
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return medio{}, err
	}
	var ancho, alto int
	if strings.HasPrefix(tipo, "image/") {
		cfg, _, err := image.DecodeConfig(f)
		if err != nil {
			return medio{}, problem.Unprocessable("IMAGEN_INVALIDA", "No se pudo leer la imagen.")
		}
		ancho, alto = cfg.Width, cfg.Height
		if tipo == "image/jpeg" { // phones store portraits as landscape + EXIF orientation 5–8: record the size as shown
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				return medio{}, err
			}
			cab := make([]byte, 128<<10)
			k, _ := io.ReadFull(f, cab)
			if o := orientacionExif(cab[:k]); o >= 5 {
				ancho, alto = alto, ancho
			}
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return medio{}, err
		}
	}
	id := newID()
	dst := s.path(cid, id, tipo)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return medio{}, err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		return medio{}, err
	}
	written, err := io.Copy(out, f)
	out.Close()
	if err != nil {
		_ = os.Remove(dst)
		return medio{}, err
	}
	alt := ""
	if v := form.Value["alt"]; len(v) > 0 {
		alt = strings.TrimSpace(v[0])
	}
	var m medio
	err = s.change(ctx, cid, "cms.medio_subido", map[string]any{"id": id, "tipo": tipo, "bytes": written}, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO medios (id, competition_id, nombre, tipo, bytes, ancho, alto, alt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			id, cid, filepath.Base(fh.Filename), tipo, written, ancho, alto, alt); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, selMedio+` WHERE id = $1`, id)
		if err != nil {
			return err
		}
		m, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[medio])
		return err
	})
	if err != nil {
		_ = os.Remove(dst)
		return medio{}, err
	}
	return *m.withURL(), nil
}
