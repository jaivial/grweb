package donaciones

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagPub = []string{"Donaciones"}

// Config is the donation setup of a competition (defaults when there is no row yet).
type Config struct {
	Activo            bool      `json:"activo"`
	Minimo            int       `json:"minimo" minimum:"1" maximum:"500000" doc:"Céntimos"`
	Maximo            int       `json:"maximo" minimum:"1" maximum:"500000" doc:"Céntimos"`
	CoinsPorEuro      int       `json:"coinsPorEuro" minimum:"1" maximum:"10000" doc:"GRS coins anunciadas por cada euro (solo exposición, no son gastables)"`
	ImportesSugeridos []int     `json:"importesSugeridos" maxItems:"6"`
	Version           int       `json:"version" readOnly:"true"`
	UpdatedPor        string    `json:"updatedPor" readOnly:"true"`
	UpdatedAt         time.Time `json:"updatedAt" readOnly:"true"`
}

const selConfig = `SELECT activo, minimo, maximo, coins_por_euro, importes_sugeridos, version, updated_por, updated_at FROM config_donaciones WHERE competition_id = $1`

type rowQ interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func cargarConfig(ctx context.Context, q rowQ, cid uuid.UUID, lock bool) (Config, error) {
	sql := selConfig
	if lock {
		sql += ` FOR UPDATE`
	}
	var c Config
	err := q.QueryRow(ctx, sql, cid).Scan(&c.Activo, &c.Minimo, &c.Maximo, &c.CoinsPorEuro, &c.ImportesSugeridos, &c.Version, &c.UpdatedPor, &c.UpdatedAt)
	if db.IsNoRows(err) {
		return Config{Minimo: 100, Maximo: 50000, CoinsPorEuro: 100, ImportesSugeridos: []int{500, 1000, 2500, 5000}}, nil
	}
	return c, err
}

// limpiarMensaje applies the chat rules to the message: trimmed, no control characters, 140 runes at most.
func limpiarMensaje(s string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		if r >= 32 && r != 127 {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if utf8.RuneCountInString(out) > 140 {
		out = string([]rune(out)[:140])
	}
	return out
}

// ConfigPublica is what /en-directo needs before opening the donate dialog.
type ConfigPublica struct {
	Activo            bool   `json:"activo"`
	Minimo            int    `json:"minimo"`
	Maximo            int    `json:"maximo"`
	CoinsPorEuro      int    `json:"coinsPorEuro"`
	ImportesSugeridos []int  `json:"importesSugeridos"`
	Pasarela          string `json:"pasarela" enum:"stripe,simulado,ninguna"`
}

type filaRanking struct {
	Puesto    int    `json:"puesto"`
	Alias     string `json:"alias"`
	Total     int    `json:"total" doc:"Céntimos"`
	Donativos int    `json:"donativos"`
}

// Mia is one donation of the fan who asks (…/donaciones/mias).
type Mia struct {
	ID        uuid.UUID `json:"id"`
	Dia       string    `json:"dia"`
	Importe   int       `json:"importe"`
	Coins     int       `json:"coins"`
	Mensaje   string    `json:"mensaje,omitempty"`
	Anonimo   bool      `json:"anonimo"`
	Estado    string    `json:"estado" enum:"pendiente,pagada,caducada,reembolsada"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *Svc) registerPublic() {
	api := s.a.API

	type configIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type configOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         ConfigPublica
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-config", Method: http.MethodGet, Path: "/api/competiciones/{slug}/donaciones/config", Summary: "Configuración pública de donativos (activo, límites, sugeridos y coins)", Tags: tagPub},
		func(ctx context.Context, in *configIn) (*configOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			cfg, err := cargarConfig(ctx, s.a.DB, c.ID, false)
			if err != nil {
				return nil, err
			}
			o := &configOut{CacheControl: "no-cache"}
			o.Body = ConfigPublica{Activo: cfg.Activo, Minimo: cfg.Minimo, Maximo: cfg.Maximo, CoinsPorEuro: cfg.CoinsPorEuro, ImportesSugeridos: cfg.ImportesSugeridos, Pasarela: provName(s.proveedor(ctx, c.ID))}
			return o, nil
		})

	type donaIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Session string `cookie:"grcup_fan" maxLength:"4096"`
		Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
		Body    struct {
			Importe int    `json:"importe" minimum:"100" maximum:"50000" doc:"Céntimos"`
			Mensaje string `json:"mensaje,omitempty" maxLength:"140"`
			Anonimo bool   `json:"anonimo,omitempty"`
		}
	}
	type donaOut struct {
		Body struct {
			DonacionID uuid.UUID `json:"donacionId"`
			URL        string    `json:"url"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-crear", Method: http.MethodPost, Path: "/api/competiciones/{slug}/donaciones", Summary: "Donar (devuelve el enlace de pago; la vuelta va a /en-directo)", Tags: tagPub, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *donaIn) (*donaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, in.Session, in.Header, c.ID)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "donacion", f.ID.String()), 12, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has hecho muchas donaciones seguidas. Inténtalo más tarde.")
			}
			cfg, err := cargarConfig(ctx, s.a.DB, c.ID, false)
			if err != nil {
				return nil, err
			}
			if !cfg.Activo {
				return nil, problem.Conflict("DONACIONES_CERRADAS", "Las donaciones aún no están activas.")
			}
			if in.Body.Importe < cfg.Minimo || in.Body.Importe > cfg.Maximo {
				return nil, problem.Unprocessable("IMPORTE_NO_VALIDO", fmt.Sprintf("El importe debe estar entre %s y %s.", pagos.Euros(cfg.Minimo), pagos.Euros(cfg.Maximo)))
			}
			prov := s.proveedor(ctx, c.ID)
			if prov == nil {
				return nil, problem.New(http.StatusServiceUnavailable, "PASARELA_NO_CONFIGURADA", "Los pagos aún no están activos. Vuelve en unos días.")
			}
			id := newID()
			mensaje := limpiarMensaje(in.Body.Mensaje)
			coins := in.Body.Importe * cfg.CoinsPorEuro / 100
			dia := hoyMadrid(time.Now())
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO donaciones (id, competition_id, dia, fan_id, alias, importe, coins, mensaje, anonimo, proveedor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				id, c.ID, diaTexto(dia), f.ID, f.Alias, in.Body.Importe, coins, mensaje, in.Body.Anonimo, prov.Name()); err != nil {
				return nil, err
			}
			// 30 min of checkout; the return goes to /en-directo (the page reads ?donacion=ok|cancelada).
			co, err := prov.CreateCheckout(ctx, pagos.CheckoutIn{Amount: in.Body.Importe, Description: "Donativo · " + c.Nombre,
				SuccessURL: s.webURL + "/en-directo?donacion=ok", CancelURL: s.webURL + "/en-directo?donacion=cancelada",
				Metadata: map[string]string{"competicion": c.ID.String(), "donacion": id.String()}, ExpiresAt: time.Now().Add(30 * time.Minute),
				Lines: []pagos.Line{{Label: "Donativo", Amount: in.Body.Importe}}})
			if err != nil {
				_, _ = s.a.DB.Exec(ctx, `UPDATE donaciones SET estado = 'caducada', motivo = 'No se pudo abrir el pago' WHERE id = $1`, id)
				s.a.Log.Warn("checkout de donación", "err", err)
				return nil, problem.New(http.StatusBadGateway, "PAGO_NO_DISPONIBLE", "No se pudo abrir el pago. Inténtalo en unos minutos.")
			}
			if _, err := s.a.DB.Exec(ctx, `UPDATE donaciones SET session_id = $2 WHERE id = $1`, id, co.ID); err != nil {
				return nil, err
			}
			o := &donaOut{}
			o.Body.DonacionID, o.Body.URL = id, co.URL
			return o, nil
		})

	type rankingIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Dia  string `query:"dia" pattern:"^\\d{4}-\\d{2}-\\d{2}$" doc:"Por defecto, hoy (Europe/Madrid)"`
	}
	type rankingOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         struct {
			Dia            string        `json:"dia"`
			Items          []filaRanking `json:"items"`
			TotalRecaudado int           `json:"totalRecaudado" doc:"Céntimos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-ranking", Method: http.MethodGet, Path: "/api/competiciones/{slug}/donaciones/ranking", Summary: "Ranking de donantes del día (top 20; los anónimos no se agrupan entre sí)", Tags: tagPub},
		func(ctx context.Context, in *rankingIn) (*rankingOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			dia := hoyMadrid(time.Now())
			if in.Dia != "" {
				if dia, err = time.ParseInLocation("2006-01-02", in.Dia, time.UTC); err != nil {
					return nil, problem.Unprocessable("DIA_NO_VALIDO", "El día debe tener el formato AAAA-MM-DD.")
				}
			}
			d := diaTexto(dia)
			o := &rankingOut{CacheControl: "no-cache"}
			if s.cache.Get(ctx, s.rankingKey(c.ID, d), &o.Body) {
				return o, nil
			}
			o.Body.Dia = d
			rows, err := s.a.DB.Query(ctx, `SELECT alias, total, n FROM (
				(SELECT alias, sum(importe) AS total, count(*) AS n FROM donaciones WHERE competition_id = $1 AND dia = $2 AND estado = 'pagada' AND NOT anonimo GROUP BY fan_id, alias)
				UNION ALL
				(SELECT 'Anónimo' AS alias, importe AS total, 1 AS n FROM donaciones WHERE competition_id = $1 AND dia = $2 AND estado = 'pagada' AND anonimo)
			) r ORDER BY r.total DESC, r.n DESC, r.alias LIMIT 20`, c.ID, d)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o.Body.Items = []filaRanking{}
			for rows.Next() {
				var f filaRanking
				if err := rows.Scan(&f.Alias, &f.Total, &f.Donativos); err != nil {
					return nil, err
				}
				f.Puesto = len(o.Body.Items) + 1
				o.Body.Items = append(o.Body.Items, f)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(sum(importe), 0) FROM donaciones WHERE competition_id = $1 AND dia = $2 AND estado = 'pagada'`, c.ID, d).Scan(&o.Body.TotalRecaudado); err != nil {
				return nil, err
			}
			s.cache.Set(ctx, s.rankingKey(c.ID, d), &o.Body, 5*time.Second)
			return o, nil
		})

	type miasIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Session string `cookie:"grcup_fan" maxLength:"4096"`
		Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
	}
	type miasOut struct {
		Body struct {
			Items       []Mia `json:"items"`
			TotalDonado int   `json:"totalDonado" doc:"Céntimos pagados (sin reembolsadas)"`
			TotalCoins  int   `json:"totalCoins"`
			Donativos   int   `json:"donativos"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-mias", Method: http.MethodGet, Path: "/api/competiciones/{slug}/donaciones/mias", Summary: "Mis donativos y mi total", Tags: tagPub},
		func(ctx context.Context, in *miasIn) (*miasOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, in.Session, in.Header, c.ID)
			if err != nil {
				return nil, err
			}
			o := &miasOut{}
			rows, err := s.a.DB.Query(ctx, `SELECT id, dia::text, importe, coins, mensaje, anonimo, estado, created_at FROM donaciones WHERE competition_id = $1 AND fan_id = $2 ORDER BY created_at DESC LIMIT 50`, c.ID, f.ID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o.Body.Items = []Mia{}
			for rows.Next() {
				var m Mia
				if err := rows.Scan(&m.ID, &m.Dia, &m.Importe, &m.Coins, &m.Mensaje, &m.Anonimo, &m.Estado, &m.CreatedAt); err != nil {
					return nil, err
				}
				o.Body.Items = append(o.Body.Items, m)
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(sum(importe), 0), COALESCE(sum(coins), 0), count(*) FROM donaciones WHERE competition_id = $1 AND fan_id = $2 AND estado = 'pagada'`, c.ID, f.ID).
				Scan(&o.Body.TotalDonado, &o.Body.TotalCoins, &o.Body.Donativos); err != nil {
				return nil, err
			}
			return o, nil
		})

	// Payment webhook (Stripe or simulated, same format and signature; idempotent by event id).
	s.a.Mux.HandleFunc("POST /api/webhooks/pagos/donaciones", func(w http.ResponseWriter, r *http.Request) {
		payload, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
		if err != nil {
			http.Error(w, "payload", http.StatusBadRequest)
			return
		}
		if err := s.webhook(r.Context(), payload, r.Header); err != nil {
			if errors.Is(err, pagos.ErrSignature) {
				s.a.Log.Warn("webhook de donación rechazado", "err", err)
				http.Error(w, "firma", http.StatusBadRequest)
				return
			}
			s.a.Log.Error("webhook de donación", "err", err)
			http.Error(w, "error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
}

func provName(p pagos.Provider) string {
	if p == nil {
		return "ninguna"
	}
	return p.Name()
}
