package patrocinio

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Patrocinio (admin)"}

// Banner as the backoffice sees it.
type Banner struct {
	ID             uuid.UUID  `json:"id" readOnly:"true" required:"false"`
	Patrocinador   string     `json:"patrocinador" minLength:"1" maxLength:"120"`
	ImagenURL      string     `json:"imagenUrl" maxLength:"500"`
	ImagenMovilURL string     `json:"imagenMovilUrl,omitempty" maxLength:"500"`
	URLDestino     string     `json:"urlDestino" maxLength:"500" doc:"Solo http/https"`
	Tier           string     `json:"tier" enum:"oro,plata,bronce"`
	Activo         bool       `json:"activo"`
	Desde          *time.Time `json:"desde,omitempty"`
	Hasta          *time.Time `json:"hasta,omitempty"`
	Orden          int        `json:"orden"`
	Version        int        `json:"version" readOnly:"true" required:"false"`
	CreatedAt      time.Time  `json:"createdAt" readOnly:"true" required:"false"`
}

// Config is the patrocinio setup of a competition.
type Config struct {
	IntervaloSeg  int       `json:"intervaloSeg" minimum:"15" maximum:"3600" doc:"Segundos entre banners"`
	PesoOro       int       `json:"pesoOro" minimum:"0" maximum:"10"`
	PesoPlata     int       `json:"pesoPlata" minimum:"0" maximum:"10"`
	PesoBronce    int       `json:"pesoBronce" minimum:"0" maximum:"10"`
	SoloEnDirecto bool      `json:"soloEnDirecto" doc:"Solo mostrar banners cuando el directo esté en vivo"`
	Activo        bool      `json:"activo"`
	Version       int       `json:"version" readOnly:"true" required:"false"`
	UpdatedPor    string    `json:"updatedPor" readOnly:"true" required:"false"`
	UpdatedAt     time.Time `json:"updatedAt" readOnly:"true" required:"false"`
}

const selConfig = `SELECT intervalo_seg, peso_oro, peso_plata, peso_bronce, solo_en_directo, activo, version, updated_por, updated_at FROM config_patrocinio WHERE competition_id = $1`

type rowQ interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func cargarConfig(ctx context.Context, q rowQ, cid uuid.UUID, lock bool) (Config, error) {
	sql := selConfig
	if lock {
		sql += ` FOR UPDATE`
	}
	var c Config
	err := q.QueryRow(ctx, sql, cid).Scan(&c.IntervaloSeg, &c.PesoOro, &c.PesoPlata, &c.PesoBronce, &c.SoloEnDirecto, &c.Activo, &c.Version, &c.UpdatedPor, &c.UpdatedAt)
	if db.IsNoRows(err) {
		// The row does not exist yet: its version will be 1 when it is created (the default of the migration), so
		// the ETag that this GET returns is the one the PUT has to accept (otherwise the first save would always
		// answer 409 CONFLICTO_EDICION).
		return Config{IntervaloSeg: 90, PesoOro: 3, PesoPlata: 2, PesoBronce: 1, SoloEnDirecto: true, Version: 1}, nil
	}
	return c, err
}

func (s *Svc) banner(ctx context.Context, cid, id uuid.UUID) (Banner, error) {
	var b Banner
	err := s.a.DB.QueryRow(ctx, `SELECT id, patrocinador, imagen_url, imagen_movil_url, url_destino, tier, activo, desde, hasta, orden, version, created_at
		FROM banners WHERE competition_id = $1 AND id = $2`, cid, id).
		Scan(&b.ID, &b.Patrocinador, &b.ImagenURL, &b.ImagenMovilURL, &b.URLDestino, &b.Tier, &b.Activo, &b.Desde, &b.Hasta, &b.Orden, &b.Version, &b.CreatedAt)
	return b, err
}

func validarBanner(b *Banner) error {
	b.Patrocinador = strings.TrimSpace(b.Patrocinador)
	if b.Patrocinador == "" {
		return problem.Unprocessable("PATROCINADOR_REQUERIDO", "Indica el patrocinador.")
	}
	for _, u := range []string{b.ImagenURL, b.ImagenMovilURL} {
		if u != "" && !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "/") {
			return problem.Unprocessable("IMAGEN_NO_VALIDA", "La imagen debe ser un enlace https o una ruta del propio sitio.")
		}
	}
	if !urlSegura(strings.TrimSpace(b.URLDestino)) {
		return problem.Unprocessable("DESTINO_NO_VALIDO", "El destino del clic debe ser un enlace http o https completo.")
	}
	b.URLDestino = strings.TrimSpace(b.URLDestino)
	if b.Tier != "oro" && b.Tier != "plata" && b.Tier != "bronce" {
		return problem.Unprocessable("TIER_NO_VALIDO", "El tier debe ser oro, plata o bronce.")
	}
	if b.Desde != nil && b.Hasta != nil && !b.Desde.Before(*b.Hasta) {
		return problem.Unprocessable("FECHAS_NO_VALIDAS", "La vigencia debe empezar antes de terminar.")
	}
	return nil
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/patrocinio"
	editar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := auth.Require(ctx, cid.String(), "web.editar")
		return err
	}
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}

	// ---- banners ----

	type bannersOut struct {
		Body struct {
			Items []Banner `json:"items"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-banners", Method: http.MethodGet, Path: base + "/banners", Summary: "Banners por tier y orden", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*bannersOut, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, patrocinador, imagen_url, imagen_movil_url, url_destino, tier, activo, desde, hasta, orden, version, created_at
				FROM banners WHERE competition_id = $1 ORDER BY orden, created_at`, in.CID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &bannersOut{}
			o.Body.Items = []Banner{}
			for rows.Next() {
				var b Banner
				if err := rows.Scan(&b.ID, &b.Patrocinador, &b.ImagenURL, &b.ImagenMovilURL, &b.URLDestino, &b.Tier, &b.Activo, &b.Desde, &b.Hasta, &b.Orden, &b.Version, &b.CreatedAt); err != nil {
					return nil, err
				}
				o.Body.Items = append(o.Body.Items, b)
			}
			return o, rows.Err()
		})

	type bannerIn struct {
		CID  uuid.UUID `path:"cid"`
		Body Banner
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-banner-crear", Method: http.MethodPost, Path: base + "/banners", Summary: "Crear un banner", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *bannerIn) (*struct{ Body Banner }, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if err := validarBanner(&b); err != nil {
				return nil, err
			}
			b.ID = newID()
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO banners (id, competition_id, patrocinador, imagen_url, imagen_movil_url, url_destino, tier, activo, desde, hasta, orden)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
				b.ID, in.CID, b.Patrocinador, b.ImagenURL, b.ImagenMovilURL, b.URLDestino, b.Tier, b.Activo, b.Desde, b.Hasta, b.Orden); err != nil {
				return nil, err
			}
			return &struct{ Body Banner }{b}, nil
		})

	type bannerIDIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    Banner
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-banner-guardar", Method: http.MethodPut, Path: base + "/banners/{id}", Summary: "Guardar un banner (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *bannerIDIn) (*struct {
			ETag string `header:"ETag"`
			Body Banner
		}, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if err := validarBanner(&b); err != nil {
				return nil, err
			}
			var version int
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				cur, err := s.bannerTx(ctx, tx, in.CID, in.ID)
				if err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != fmt.Sprint(cur.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado el banner. Recarga la página.")
				}
				if _, err := tx.Exec(ctx, `UPDATE banners SET patrocinador=$2, imagen_url=$3, imagen_movil_url=$4, url_destino=$5, tier=$6, activo=$7, desde=$8, hasta=$9, orden=$10, version = version + 1, updated_at = now() WHERE id = $1 AND competition_id = $11`,
					in.ID, b.Patrocinador, b.ImagenURL, b.ImagenMovilURL, b.URLDestino, b.Tier, b.Activo, b.Desde, b.Hasta, b.Orden, in.CID); err != nil {
					return err
				}
				return tx.QueryRow(ctx, `SELECT version FROM banners WHERE id = $1`, in.ID).Scan(&version)
			})
			if err != nil {
				return nil, err
			}
			guardado, err := s.banner(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &struct {
				ETag string `header:"ETag"`
				Body Banner
			}{ETag: fmt.Sprintf(`"%d"`, version), Body: guardado}, nil
		})

	type bannerDelIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-banner-borrar", Method: http.MethodDelete, Path: base + "/banners/{id}", Summary: "Borrar un banner", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *bannerDelIn) (*struct{}, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `DELETE FROM banners WHERE id = $1 AND competition_id = $2`, in.ID, in.CID)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.NotFound("Banner no encontrado.")
			}
			return nil, nil
		})

	// ---- config ----

	type cfgOut struct {
		ETag string `header:"ETag"`
		Body Config
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-config", Method: http.MethodGet, Path: base + "/config", Summary: "Configuración de patrocinio", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*cfgOut, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			c, err := cargarConfig(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			return &cfgOut{ETag: fmt.Sprintf(`"%d"`, c.Version), Body: c}, nil
		})

	type cfgIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    Config
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-config-guardar", Method: http.MethodPut, Path: base + "/config", Summary: "Guardar la configuración (intervalo, pesos de tier, solo en directo, activo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cfgIn) (*cfgOut, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if b.IntervaloSeg < 15 {
				return nil, problem.Unprocessable("INTERVALO_NO_VALIDO", "El intervalo mínimo es de 15 segundos.")
			}
			var version int
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO config_patrocinio (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, in.CID); err != nil {
					return err
				}
				cur, err := cargarConfig(ctx, tx, in.CID, true)
				if err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != fmt.Sprint(cur.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración. Recarga la página.")
				}
				if _, err := tx.Exec(ctx, `UPDATE config_patrocinio SET intervalo_seg=$2, peso_oro=$3, peso_plata=$4, peso_bronce=$5, solo_en_directo=$6, activo=$7, version = version + 1, updated_por=$8, updated_at = now() WHERE competition_id = $1`,
					in.CID, b.IntervaloSeg, b.PesoOro, b.PesoPlata, b.PesoBronce, b.SoloEnDirecto, b.Activo, actor(ctx)); err != nil {
					return err
				}
				return tx.QueryRow(ctx, `SELECT version FROM config_patrocinio WHERE competition_id = $1`, in.CID).Scan(&version)
			})
			if err != nil {
				return nil, err
			}
			c, err := cargarConfig(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			return &cfgOut{ETag: fmt.Sprintf(`"%d"`, version), Body: c}, nil
		})

	// ---- informe ----

	type filaInforme struct {
		ID           uuid.UUID `json:"id"`
		Patrocinador string    `json:"patrocinador"`
		Tier         string    `json:"tier"`
		Orden        int       `json:"orden"`
		Activo       bool      `json:"activo"`
		Apariciones  int       `json:"apariciones"`
		Clics        int       `json:"clics"`
	}
	type informeIn struct {
		CID         uuid.UUID `path:"cid"`
		Dia         string    `query:"dia" pattern:"^\\d{4}-\\d{2}-\\d{2}$" doc:"Por defecto, hoy (Europe/Madrid)"`
		DuracionMin int       `query:"duracionMin" minimum:"0" doc:"Duración prevista de la jornada, para avisar si la primera ronda no cabe"`
	}
	type informeOut struct {
		Body struct {
			Dia          string        `json:"dia"`
			IntervaloSeg int           `json:"intervaloSeg"`
			Banners      []filaInforme `json:"banners"`
			Pendientes   []uuid.UUID   `json:"pendientes" doc:"Activos sin aparición hoy, en el orden en que saldrán (tier y orden)"`
			RondaSeg     int           `json:"rondaSeg" doc:"Primera ronda completa: banners activos × intervalo"`
			Aviso        string        `json:"aviso,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "patrocinio-informe", Method: http.MethodGet, Path: base + "/informe", Summary: "Informe del día: apariciones y clics por banner, cola de pendientes y estimación de la primera ronda", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *informeIn) (*informeOut, error) {
			if err := editar(ctx, in.CID); err != nil {
				return nil, err
			}
			dia := hoyMadrid(time.Now())
			if in.Dia != "" {
				var err error
				if dia, err = time.ParseInLocation("2006-01-02", in.Dia, time.UTC); err != nil {
					return nil, problem.Unprocessable("DIA_NO_VALIDO", "El día debe tener el formato AAAA-MM-DD.")
				}
			}
			d := diaTexto(dia)
			cfg, err := cargarConfig(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT b.id, b.patrocinador, b.tier, b.orden, b.activo, b.desde, b.hasta,
				(SELECT count(*) FROM apariciones a WHERE a.banner_id = b.id AND a.dia = $2),
				(SELECT count(*) FROM clics c WHERE c.banner_id = b.id AND c.dia = $2)
				FROM banners b WHERE b.competition_id = $1 ORDER BY b.orden, b.created_at`, in.CID, d)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &informeOut{}
			o.Body.Dia = d
			o.Body.IntervaloSeg = cfg.IntervaloSeg
			o.Body.Banners = []filaInforme{}
			o.Body.Pendientes = []uuid.UUID{}
			activos, ahora := 0, time.Now()
			for rows.Next() {
				var f filaInforme
				var desde, hasta *time.Time
				if err := rows.Scan(&f.ID, &f.Patrocinador, &f.Tier, &f.Orden, &f.Activo, &desde, &hasta, &f.Apariciones, &f.Clics); err != nil {
					return nil, err
				}
				o.Body.Banners = append(o.Body.Banners, f)
				vigente := f.Activo && (desde == nil || !desde.After(ahora)) && (hasta == nil || hasta.After(ahora))
				if vigente && f.Apariciones == 0 {
					o.Body.Pendientes = append(o.Body.Pendientes, f.ID)
				}
				if vigente {
					activos++
				}
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if activos > 0 {
				o.Body.RondaSeg = activos * cfg.IntervaloSeg
			}
			switch {
			case !cfg.Activo:
				o.Body.Aviso = "El patrocinio está desactivado: nadie ve banners."
			case activos == 0:
				o.Body.Aviso = "No hay banners activos."
			case in.DuracionMin > 0 && o.Body.RondaSeg > in.DuracionMin*60:
				o.Body.Aviso = fmt.Sprintf("Con %d banners cada %d s, la primera ronda completa tarda %d min y no cabe en los %d min previstos de la jornada.", activos, cfg.IntervaloSeg, (o.Body.RondaSeg+59)/60, in.DuracionMin)
			}
			return o, nil
		})
}

func (s *Svc) bannerTx(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID) (Banner, error) {
	var b Banner
	err := tx.QueryRow(ctx, `SELECT id, patrocinador, imagen_url, imagen_movil_url, url_destino, tier, activo, desde, hasta, orden, version, created_at
		FROM banners WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id).
		Scan(&b.ID, &b.Patrocinador, &b.ImagenURL, &b.ImagenMovilURL, &b.URLDestino, &b.Tier, &b.Activo, &b.Desde, &b.Hasta, &b.Orden, &b.Version, &b.CreatedAt)
	return b, err
}
