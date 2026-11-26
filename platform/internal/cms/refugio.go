package cms

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/storage"
)

// Colaboradores Refugio: hotels, apartments and restaurants (/donde-dormir-y-comer) and powerlifting gyms
// (/como-llegar), edited in the backoffice. Same fields as a place of the guide; images are uploaded to the CDN
// (Bunny) by …/web/{hoteles-restaurantes,gimnasios}/imagen and only their URL is stored. The public pages read
// them by REST and follow the changes by SSE («web.hoteles_restaurantes», «web.gimnasios»).

const (
	evHoteles   = "web.hoteles_restaurantes"
	evGimnasios = "web.gimnasios"
)

// sitioCols are the columns shared by both tables, in the order of sitioRow/sitioIn.
const sitioCols = "nombre, detalle, distancia, precio, telefono, email, web, imagen_url, logo_url, logo_claro, logo_oscuro_url, maps_url, descripcion"

type sitioRow struct {
	ID          uuid.UUID `json:"id" db:"id"`
	Nombre      string    `json:"nombre" db:"nombre"`
	Detalle     string    `json:"detalle" db:"detalle"`
	Distancia   string    `json:"distancia" db:"distancia"`
	Precio      string    `json:"precio" db:"precio"`
	Telefono    string    `json:"telefono" db:"telefono"`
	Email       string    `json:"email" db:"email"`
	Web         string    `json:"web" db:"web"`
	Imagen      string    `json:"imagen" db:"imagen_url"`
	Logo        string    `json:"logo" db:"logo_url"`
	LogoClaro   bool      `json:"logoClaro" db:"logo_claro"`
	LogoOscuro  string    `json:"logoOscuro" db:"logo_oscuro_url"`
	Maps        string    `json:"maps" db:"maps_url"`
	Descripcion string    `json:"descripcion" db:"descripcion"`
	Orden       int       `json:"orden" db:"orden"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
	enCol
}

type hotelRow struct {
	Tipo string `json:"tipo" db:"tipo"`
	sitioRow
}

type sitioIn struct {
	Nombre      string `json:"nombre" minLength:"1" maxLength:"120"`
	Detalle     string `json:"detalle,omitempty" maxLength:"200" doc:"Dirección y localidad, o «Tipo · localidad»"`
	Distancia   string `json:"distancia,omitempty" maxLength:"80" doc:"«≈ 4 min en coche · 1,8 km»"`
	Precio      string `json:"precio,omitempty" maxLength:"160"`
	Telefono    string `json:"telefono,omitempty" maxLength:"40"`
	Email       string `json:"email,omitempty" maxLength:"160"`
	Web         string `json:"web,omitempty" maxLength:"500"`
	Imagen      string `json:"imagen,omitempty" maxLength:"500" doc:"URL del CDN que devuelve la subida"`
	Logo        string `json:"logo,omitempty" maxLength:"500" doc:"URL del CDN que devuelve la subida"`
	LogoClaro   bool   `json:"logoClaro,omitempty" doc:"Logo claro: se pinta sobre fondo oscuro"`
	LogoOscuro  string `json:"logoOscuro,omitempty" maxLength:"500" doc:"Versión del logo para fondos negros"`
	Maps        string `json:"maps,omitempty" maxLength:"500" doc:"Enlace exacto de Google Maps"`
	Descripcion string `json:"descripcion,omitempty" maxLength:"1500"`
	enField
}

type hotelIn struct {
	Tipo string `json:"tipo" enum:"hotel,apartamento,restaurante"`
	sitioIn
}

type sitioPub struct {
	Nombre      string `json:"nombre" db:"nombre"`
	Detalle     string `json:"detalle" db:"detalle"`
	Distancia   string `json:"distancia" db:"distancia"`
	Precio      string `json:"precio" db:"precio"`
	Telefono    string `json:"telefono" db:"telefono"`
	Email       string `json:"email" db:"email"`
	Web         string `json:"web" db:"web"`
	Imagen      string `json:"imagen" db:"imagen_url"`
	Logo        string `json:"logo" db:"logo_url"`
	LogoClaro   bool   `json:"logoClaro" db:"logo_claro"`
	LogoOscuro  string `json:"logoOscuro" db:"logo_oscuro_url"`
	Maps        string `json:"maps" db:"maps_url"`
	Descripcion string `json:"descripcion" db:"descripcion"`
}

type hotelPub struct {
	Tipo string `json:"tipo" db:"tipo"`
	sitioPub
}

func (in *sitioIn) validar() error {
	trimAll(&in.Nombre, &in.Detalle, &in.Distancia, &in.Precio, &in.Telefono, &in.Email, &in.Web, &in.Imagen, &in.Logo, &in.LogoOscuro, &in.Maps, &in.Descripcion)
	if in.Nombre == "" {
		return problem.Unprocessable("NOMBRE_OBLIGATORIO", "Escribe el nombre.")
	}
	if in.Email != "" && (!strings.Contains(in.Email, "@") || strings.ContainsAny(in.Email, " ,;")) {
		return problem.Unprocessable("EMAIL_INVALIDO", "El email no es válido.")
	}
	for _, u := range []struct{ v, que string }{{in.Web, "La web"}, {in.Imagen, "La imagen"}, {in.Logo, "El logo"}, {in.LogoOscuro, "El logo para fondo negro"}, {in.Maps, "El enlace de Google Maps"}} {
		if !validURL(u.v, false) {
			return problem.Unprocessable("URL_INVALIDA", u.que+" debe ser una URL https://….")
		}
	}
	return nil
}

func (in *sitioIn) args() []any {
	return []any{in.Nombre, in.Detalle, in.Distancia, in.Precio, in.Telefono, in.Email, in.Web, in.Imagen, in.Logo, in.LogoClaro, in.LogoOscuro, in.Maps, in.Descripcion}
}

// sitioSet is the SET list of an update: the shared columns from $3 on.
func sitioSet(desde int) string {
	cols := strings.Split(sitioCols, ", ")
	out := make([]string, len(cols))
	for i, c := range cols {
		out[i] = c + "=$" + strconv.Itoa(desde+i)
	}
	return strings.Join(out, ", ")
}

// borrarSitio removes the images a deleted place had uploaded: only keys of its own upload folder (a pasted URL
// or a logo of another folder stays) and only when no other row of the table still shows that file.
func (s *Svc) borrarSitio(ctx context.Context, cid uuid.UUID, tabla, carpeta string, r sitioRow) {
	st, base := s.almacenMapas(ctx, cid)
	for _, u := range []string{r.Imagen, r.Logo, r.LogoOscuro} {
		key, ok := storage.ClaveDeURL(base, u)
		if !ok || !(strings.HasPrefix(key, carpeta+"/") || strings.HasPrefix(key, carpeta+"-")) {
			continue
		}
		var enUso bool
		if err := s.a.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM `+tabla+` WHERE $1 IN (imagen_url, logo_url, logo_oscuro_url))`, u).Scan(&enUso); err != nil || enUso {
			continue
		}
		if err := st.Delete(ctx, key); err != nil {
			s.a.Log.Warn("no se ha podido borrar la imagen del almacén", "err", err, "key", key)
		}
	}
}

func (s *Svc) registerRefugio() {
	selRow := "id, " + sitioCols + ", orden, updated_at, en"
	marcas := "$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15"

	register(s, collection[hotelRow, hotelIn]{
		name: "hoteles_restaurantes", path: "/web/hoteles-restaurantes", table: "hoteles_restaurantes", tag: "Colaboradores Refugio", perm: "web.editar",
		order: "orden, created_at", cols: "tipo, " + selRow, public: evHoteles,
		deleted: func(ctx context.Context, cid uuid.UUID, r hotelRow) {
			s.borrarSitio(ctx, cid, "hoteles_restaurantes", "hoteles-restaurantes", r.sitioRow)
		},
		validate: func(in *hotelIn) error { return in.validar() },
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *hotelIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO hoteles_restaurantes (id, competition_id, `+sitioCols+`, tipo, orden)
				VALUES ($1,$2,`+marcas+`,$16,(SELECT COALESCE(max(orden),0)+1 FROM hoteles_restaurantes WHERE competition_id = $2))`,
				append(append([]any{id, cid}, in.args()...), in.Tipo)...)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *hotelIn) error {
			_, err := tx.Exec(ctx, `UPDATE hoteles_restaurantes SET `+sitioSet(3)+`, tipo=$16, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				append(append([]any{cid, id}, in.args()...), in.Tipo)...)
			return err
		},
	})
	register(s, collection[sitioRow, sitioIn]{
		name: "gimnasios", path: "/web/gimnasios", table: "gimnasios", tag: "Colaboradores Refugio", perm: "web.editar",
		order: "orden, created_at", cols: selRow, public: evGimnasios,
		deleted: func(ctx context.Context, cid uuid.UUID, r sitioRow) {
			s.borrarSitio(ctx, cid, "gimnasios", "gimnasios", r)
		},
		validate: func(in *sitioIn) error { return in.validar() },
		insert: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *sitioIn) error {
			_, err := tx.Exec(ctx, `INSERT INTO gimnasios (id, competition_id, `+sitioCols+`, orden)
				VALUES ($1,$2,`+marcas+`,(SELECT COALESCE(max(orden),0)+1 FROM gimnasios WHERE competition_id = $2))`,
				append([]any{id, cid}, in.args()...)...)
			return err
		},
		update: func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, in *sitioIn) error {
			_, err := tx.Exec(ctx, `UPDATE gimnasios SET `+sitioSet(3)+`, updated_at=now() WHERE competition_id=$1 AND id=$2`,
				append([]any{cid, id}, in.args()...)...)
			return err
		},
	})

	// Public lists, in the order of the backoffice. No browser cache: the pages reload them on every SSE event.
	api := s.a.API
	pubCols := func(en bool) string {
		return "nombre, " + tr(en, "detalle", "precio", "descripcion") + ", distancia, telefono, email, web, imagen_url, logo_url, logo_claro, logo_oscuro_url, maps_url"
	}
	type hotelesOut struct{ Body []hotelPub }
	huma.Register(api, huma.Operation{OperationID: "hoteles-restaurantes-public", Method: http.MethodGet, Path: "/api/competiciones/{slug}/hoteles-restaurantes", Summary: "Hoteles, apartamentos y restaurantes, en orden", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*hotelesOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, in.key("hoteles-restaurantes"), ttlContent, func() ([]hotelPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT tipo, `+pubCols(in.en())+` FROM hoteles_restaurantes WHERE competition_id = $1 ORDER BY orden, created_at`, cid)
				if err != nil {
					return nil, err
				}
				return collect[hotelPub](rows)
			})
			return &hotelesOut{Body: list}, err
		})
	type gimnasiosOut struct{ Body []sitioPub }
	huma.Register(api, huma.Operation{OperationID: "gimnasios-public", Method: http.MethodGet, Path: "/api/competiciones/{slug}/gimnasios", Summary: "Gimnasios de powerlifting, en orden", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*gimnasiosOut, error) {
			cid, err := s.cidFor(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			list, err := cached(ctx, s, cid, in.key("gimnasios"), ttlContent, func() ([]sitioPub, error) {
				rows, err := s.a.DB.Query(ctx, `SELECT `+pubCols(in.en())+` FROM gimnasios WHERE competition_id = $1 ORDER BY orden, created_at`, cid)
				if err != nil {
					return nil, err
				}
				return collect[sitioPub](rows)
			})
			return &gimnasiosOut{Body: list}, err
		})
}
