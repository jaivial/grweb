package donaciones

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
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Donaciones (admin)"}

// Fila is one donation in the backoffice list.
type Fila struct {
	ID          uuid.UUID  `json:"id"`
	Dia         string     `json:"dia"`
	FanID       uuid.UUID  `json:"fanId"`
	Alias       string     `json:"alias"`
	Importe     int        `json:"importe" doc:"Céntimos"`
	Coins       int        `json:"coins"`
	Mensaje     string     `json:"mensaje,omitempty"`
	Anonimo     bool       `json:"anonimo"`
	Estado      string     `json:"estado" enum:"pendiente,pagada,caducada,reembolsando,reembolsada"`
	Proveedor   string     `json:"proveedor"`
	Motivo      string     `json:"motivo,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	PagadaAt    *time.Time `json:"pagadaAt,omitempty"`
	Reembolsada *time.Time `json:"reembolsadaAt,omitempty"`
}

// Kpis of the «Donaciones» page.
type Kpis struct {
	Pagadas      int `json:"pagadas"`
	Recaudado    int `json:"recaudado" doc:"Céntimos"`
	Pendientes   int `json:"pendientes"`
	Reembolsadas int `json:"reembolsadas"`
	Donantes     int `json:"donantes" doc:"Fans distintos con algún pago (los anónimos cuentan por donativo)"`
}

func (s *Svc) donaciones(ctx context.Context, cid uuid.UUID, estado, q string, pagina, por int) ([]Fila, int, error) {
	where := `competition_id = $1`
	args := []any{cid}
	if estado != "" {
		args = append(args, estado)
		where += fmt.Sprintf(` AND estado = $%d`, len(args))
	}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		where += fmt.Sprintf(` AND (lower(alias) LIKE $%d OR lower(mensaje) LIKE $%d OR fan_id::text = $%d)`, len(args), len(args), len(args))
	}
	var total int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM donaciones WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	lim := ""
	if por > 0 {
		if pagina < 1 {
			pagina = 1
		}
		lim = fmt.Sprintf(` LIMIT %d OFFSET %d`, por, (pagina-1)*por)
	}
	rows, err := s.a.DB.Query(ctx, `SELECT id, dia::text, fan_id, alias, importe, coins, mensaje, anonimo, estado, proveedor, motivo, created_at, pagada_at, reembolsada_at
		FROM donaciones WHERE `+where+` ORDER BY created_at DESC`+lim, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Fila{}
	for rows.Next() {
		var x Fila
		if err := rows.Scan(&x.ID, &x.Dia, &x.FanID, &x.Alias, &x.Importe, &x.Coins, &x.Mensaje, &x.Anonimo, &x.Estado, &x.Proveedor, &x.Motivo, &x.CreatedAt, &x.PagadaAt, &x.Reembolsada); err != nil {
			return nil, 0, err
		}
		out = append(out, x)
	}
	return out, total, rows.Err()
}

func (s *Svc) fila(ctx context.Context, cid, id uuid.UUID) (Fila, error) {
	var x Fila
	err := s.a.DB.QueryRow(ctx, `SELECT id, dia::text, fan_id, alias, importe, coins, mensaje, anonimo, estado, proveedor, motivo, created_at, pagada_at, reembolsada_at
		FROM donaciones WHERE competition_id = $1 AND id = $2`, cid, id).
		Scan(&x.ID, &x.Dia, &x.FanID, &x.Alias, &x.Importe, &x.Coins, &x.Mensaje, &x.Anonimo, &x.Estado, &x.Proveedor, &x.Motivo, &x.CreatedAt, &x.PagadaAt, &x.Reembolsada)
	return x, err
}

func (s *Svc) kpis(ctx context.Context, cid uuid.UUID) (Kpis, error) {
	var k Kpis
	err := s.a.DB.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE estado = 'pagada'),
		COALESCE(sum(importe) FILTER (WHERE estado = 'pagada'), 0),
		count(*) FILTER (WHERE estado = 'pendiente'),
		count(*) FILTER (WHERE estado = 'reembolsada'),
		count(DISTINCT fan_id) FILTER (WHERE estado = 'pagada' AND NOT anonimo)
		FROM donaciones WHERE competition_id = $1`, cid).
		Scan(&k.Pagadas, &k.Recaudado, &k.Pendientes, &k.Reembolsadas, &k.Donantes)
	return k, err
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/donaciones"
	gestionar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := auth.Require(ctx, cid.String(), "sorteo.gestionar")
		return err
	}
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type kpisOut struct {
		ETag string `header:"ETag"`
		Body struct {
			Kpis   Kpis   `json:"kpis"`
			Config Config `json:"config"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-panel", Method: http.MethodGet, Path: base, Summary: "KPIs y configuración de donativos", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*kpisOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			cfg, err := cargarConfig(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			k, err := s.kpis(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			o := &kpisOut{ETag: fmt.Sprintf(`"%d"`, cfg.Version)}
			o.Body.Kpis, o.Body.Config = k, cfg
			return o, nil
		})

	type cfgIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    Config
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-config-guardar", Method: http.MethodPut, Path: base + "/config", Summary: "Guardar la configuración de donativos", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cfgIn) (*kpisOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if b.Minimo < 1 || b.Maximo < b.Minimo {
				return nil, problem.Unprocessable("IMPORTES_NO_VALIDOS", "El mínimo no puede superar el máximo.")
			}
			if b.CoinsPorEuro < 1 {
				return nil, problem.Unprocessable("COINS_NO_VALIDAS", "Las coins por euro deben ser al menos 1.")
			}
			vistos := map[int]bool{}
			for _, x := range b.ImportesSugeridos {
				if x < b.Minimo || x > b.Maximo {
					return nil, problem.Unprocessable("SUGERIDOS_NO_VALIDOS", fmt.Sprintf("Los importes sugeridos deben estar entre %s y %s.", pagos.Euros(b.Minimo), pagos.Euros(b.Maximo)))
				}
				if vistos[x] {
					return nil, problem.Unprocessable("SUGERIDOS_NO_VALIDOS", "Los importes sugeridos no pueden repetirse.")
				}
				vistos[x] = true
			}
			var version int
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO config_donaciones (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, in.CID); err != nil {
					return err
				}
				cur, err := cargarConfig(ctx, tx, in.CID, true)
				if err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != fmt.Sprint(cur.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración. Recarga la página.")
				}
				if _, err := tx.Exec(ctx, `UPDATE config_donaciones SET activo = $2, minimo = $3, maximo = $4, coins_por_euro = $5, importes_sugeridos = $6, version = version + 1, updated_por = $7, updated_at = now() WHERE competition_id = $1`,
					in.CID, b.Activo, b.Minimo, b.Maximo, b.CoinsPorEuro, b.ImportesSugeridos, actor(ctx)); err != nil {
					return err
				}
				return tx.QueryRow(ctx, `SELECT version FROM config_donaciones WHERE competition_id = $1`, in.CID).Scan(&version)
			})
			if err != nil {
				return nil, err
			}
			cfg, err := cargarConfig(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			k, err := s.kpis(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			o := &kpisOut{ETag: fmt.Sprintf(`"%d"`, cfg.Version)}
			o.Body.Kpis, o.Body.Config = k, cfg
			return o, nil
		})

	type listaIn struct {
		CID    uuid.UUID `path:"cid"`
		Estado string    `query:"estado" enum:"pendiente,pagada,caducada,reembolsando,reembolsada,"`
		Q      string    `query:"q" maxLength:"80"`
		Pagina int       `query:"pagina" minimum:"1" default:"1"`
	}
	type listaOut struct {
		Body struct {
			Items  []Fila `json:"items"`
			Total  int    `json:"total"`
			Pagina int    `json:"pagina"`
			Por    int    `json:"por"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-lista", Method: http.MethodGet, Path: base + "/lista", Summary: "Donativos con filtros y paginación", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			o := &listaOut{}
			var err error
			o.Body.Items, o.Body.Total, err = s.donaciones(ctx, in.CID, in.Estado, in.Q, in.Pagina, 25)
			o.Body.Pagina, o.Body.Por = in.Pagina, 25
			return o, err
		})

	type reIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Motivo string `json:"motivo,omitempty" minLength:"3" maxLength:"200"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "donaciones-reembolso", Method: http.MethodPost, Path: base + "/{id}/reembolso", Summary: "Reembolsar una donación pagada", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *reIn) (*struct {
			Body Fila
		}, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			var pago, estado, pas, dia string
			var importe int
			// 1) Reclamar el reembolso: la fila se bloquea y pasa a «reembolsando» ANTES de llamar a la pasarela, así
			// que dos clics (o dos réplicas) nunca devuelven el dinero dos veces (PR review I2).
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := tx.QueryRow(ctx, `SELECT payment_id, estado, proveedor, importe, dia::text FROM donaciones WHERE competition_id = $1 AND id = $2 FOR UPDATE`, in.CID, in.ID).
					Scan(&pago, &estado, &pas, &importe, &dia); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Donación no encontrada.")
					}
					return err
				}
				if estado != "pagada" && estado != "reembolsando" {
					return problem.Conflict("NO_REEMBOLSABLE", "Solo se reembolsan donaciones pagadas.")
				}
				if estado == "pagada" {
					tag, err := tx.Exec(ctx, `UPDATE donaciones SET estado = 'reembolsando' WHERE id = $1 AND competition_id = $2 AND estado = 'pagada'`, in.ID, in.CID)
					if err != nil {
						return err
					}
					if tag.RowsAffected() == 0 {
						return problem.Conflict("NO_REEMBOLSABLE", "La donación ya no está pagada.")
					}
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			if estado == "reembolsando" {
				// Un intento anterior se quedó a medias (caída): se reanuda con la misma clave de idempotencia, que
				// devuelve el mismo reembolso en la pasarela.
				s.a.Log.Warn("reembolso de donación reanudado", "donacion", in.ID)
			}
			prov := s.proveedor(ctx, in.CID)
			if pas == "simulado" && s.sim != nil {
				prov = s.sim
			}
			if prov == nil || prov.Name() != pas {
				s.devolverPagada(ctx, in.ID, "La donación se pagó con otra pasarela")
				return nil, problem.Conflict("PASARELA_DISTINTA", "Esta donación se pagó con otra pasarela: reembólsala desde su panel.")
			}
			// 2) La pasarela, con clave de idempotencia (el id de la donación): un reintento tras una caída devuelve el
			// mismo reembolso, no el dinero dos veces.
			ref, err := s.reembolsar(ctx, prov, pago, importe, in.ID.String())
			if err != nil {
				s.a.Log.Warn("reembolso de donación", "err", err)
				s.devolverPagada(ctx, in.ID, "Reembolso fallido: "+err.Error())
				return nil, problem.New(http.StatusBadGateway, "REEMBOLSO_FALLIDO", "La pasarela no ha podido reembolsar: "+err.Error())
			}
			// 3) Confirmar el estado y encolar el evento (en la misma transacción): si esto falla, la donación queda
			// «reembolsando» y un reintento con la misma clave recupera el mismo reembolso.
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE donaciones SET estado = 'reembolsada', reembolso_id = $2, motivo = $3, reembolsada_at = now() WHERE id = $1 AND estado = 'reembolsando'`, in.ID, ref, strings.TrimSpace(in.Body.Motivo))
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					return nil // otro intento lo reembolsó antes: el evento ya está en la outbox
				}
				var fanID uuid.UUID
				var coins int
				if err := tx.QueryRow(ctx, `SELECT fan_id, coins FROM donaciones WHERE id = $1`, in.ID).Scan(&fanID, &coins); err != nil {
					return err
				}
				// juegos-worker retira la recompensa de fantasy (hasta dejar el saldo en 0 si no alcanza).
				return events.Enqueue(ctx, tx, events.New(ctx, "donacion.reembolsada", map[string]any{
					"donacionId": in.ID.String(), "fanId": fanID.String(), "importe": importe, "coins": coins, "dia": dia, "motivo": strings.TrimSpace(in.Body.Motivo), "por": actor(ctx),
				}, events.Competition(in.CID.String()), events.ForPermission("sorteo.gestionar"), events.Subject("donacion:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			s.invalidarRanking(ctx, in.CID, dia)
			x, err := s.fila(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &struct{ Body Fila }{x}, nil
		})
}

// devolverPagada deja la donación como «pagada» cuando la pasarela no ha podido reembolsar (el dinero sigue en
// la pasarela): el siguiente intento vuelve a encontrarla reembolsable.
func (s *Svc) devolverPagada(ctx context.Context, id uuid.UUID, motivo string) {
	_, _ = s.a.DB.Exec(ctx, `UPDATE donaciones SET estado = 'pagada', motivo = $2 WHERE id = $1 AND estado = 'reembolsando'`, id, motivo)
}

// reembolsar llama a la pasarela con una clave de idempotencia (el id de la donación): si la pasarela la
// soporta, un reintento devuelve el mismo reembolso en lugar de devolver el dinero otra vez.
func (s *Svc) reembolsar(ctx context.Context, prov pagos.Provider, pago string, importe int, clave string) (string, error) {
	if p, ok := prov.(pagos.RefundConClave); ok {
		return p.RefundConClave(ctx, pago, importe, "requested_by_customer", clave)
	}
	return prov.Refund(ctx, pago, importe, "requested_by_customer")
}
