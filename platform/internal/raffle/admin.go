package raffle

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
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

var tagAdmin = []string{"Sorteo (admin)"}

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

// Legal checklist (Figma 60 · «Sorteo · configuración»): for review by the legal advisor. The sale cannot be
// switched on until every item is done or not applicable.
var checklistItems = []struct{ Clave, Titulo, Detalle string }{
	{"autorizacion", "Autorización autonómica de juego", "Rifa con precio: comunicación o autorización en la Comunitat Valenciana"},
	{"tributacion", "Tributación del premio", "Retención o ingreso a cuenta del premio en especie"},
	{"bases", "Bases del sorteo publicadas", "Texto legal «Bases del sorteo» publicado en /politica-concurso"},
	{"mayores", "Solo mayores de 18 años", "Casilla obligatoria en la compra"},
	{"consentimiento", "Consentimiento separado y sin marcar", "Novedades opcionales, nunca premarcadas"},
	{"destino", "Destino benéfico comunicado", "Entidad y uso de lo recaudado visibles en /sorteo"},
}

// ItemChecklist is an item of the legal checklist.
type ItemChecklist struct {
	Clave     string     `json:"clave"`
	Titulo    string     `json:"titulo"`
	Detalle   string     `json:"detalle"`
	Estado    string     `json:"estado" enum:"pendiente,hecho,no_aplica"`
	Nota      string     `json:"nota,omitempty"`
	Por       string     `json:"por,omitempty"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

func (s *Svc) checklist(ctx context.Context, q interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}, cid uuid.UUID) ([]ItemChecklist, bool, error) {
	rows, err := q.Query(ctx, `SELECT clave, estado, nota, por, updated_at FROM checklist WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	got := map[string]ItemChecklist{}
	for rows.Next() {
		var x ItemChecklist
		var at time.Time
		if err := rows.Scan(&x.Clave, &x.Estado, &x.Nota, &x.Por, &at); err != nil {
			return nil, false, err
		}
		x.UpdatedAt = &at
		got[x.Clave] = x
	}
	out := make([]ItemChecklist, 0, len(checklistItems))
	completa := true
	for _, it := range checklistItems {
		x, ok := got[it.Clave]
		if !ok {
			x = ItemChecklist{Estado: "pendiente"}
		}
		x.Clave, x.Titulo, x.Detalle = it.Clave, it.Titulo, it.Detalle
		if x.Estado == "pendiente" {
			completa = false
		}
		out = append(out, x)
	}
	return out, completa, rows.Err()
}

// Kpis of «Boletos y pagos».
type Kpis struct {
	Boletos      int   `json:"boletos" doc:"Boletos válidos"`
	Nuevos7d     int   `json:"nuevos7d"`
	Recaudado    int   `json:"recaudado" doc:"Céntimos (pagado − reembolsado)"`
	Compradores  int   `json:"compradores"`
	Pendientes   int   `json:"pendientes" doc:"Pagos en curso"`
	Reembolsadas int   `json:"reembolsadas"`
	Fallidas     int   `json:"fallidas"`
	Serie        []int `json:"serie" doc:"Boletos por día (14 días)"`
}

// Panel is the «Sorteo» page of the backoffice.
type Panel struct {
	Config            Config          `json:"config"`
	Checklist         []ItemChecklist `json:"checklist"`
	ChecklistCompleta bool            `json:"checklistCompleta"`
	Estado            string          `json:"estado" doc:"Estado de venta tal y como lo ve /sorteo"`
	Pasarela          string          `json:"pasarela"`
	Kpis              Kpis            `json:"kpis"`
	Actual            *Sorteo         `json:"actual,omitempty"`
}

func (s *Svc) panel(ctx context.Context, cid uuid.UUID) (*Panel, error) {
	cfg, err := cargarConfig(ctx, s.a.DB, cid, false)
	if err != nil {
		return nil, err
	}
	p := &Panel{Config: cfg, Pasarela: provName(s.proveedor(ctx, cid))}
	if p.Checklist, p.ChecklistCompleta, err = s.checklist(ctx, s.a.DB, cid); err != nil {
		return nil, err
	}
	k := &p.Kpis
	if err := s.a.DB.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM boletos WHERE competition_id = $1 AND NOT anulado),
		(SELECT count(*) FROM boletos WHERE competition_id = $1 AND NOT anulado AND created_at > now() - interval '7 days'),
		COALESCE(sum(importe) FILTER (WHERE estado = 'pagada'), 0),
		count(DISTINCT email) FILTER (WHERE estado = 'pagada'),
		count(*) FILTER (WHERE estado = 'pendiente'),
		count(*) FILTER (WHERE estado = 'reembolsada'),
		count(*) FILTER (WHERE estado = 'fallida')
		FROM compras WHERE competition_id = $1`, cid).Scan(&k.Boletos, &k.Nuevos7d, &k.Recaudado, &k.Compradores, &k.Pendientes, &k.Reembolsadas, &k.Fallidas); err != nil {
		return nil, err
	}
	k.Serie = make([]int, 14)
	rows, err := s.a.DB.Query(ctx, `SELECT (now()::date - created_at::date), count(*) FROM boletos WHERE competition_id = $1 AND NOT anulado AND created_at > now() - interval '14 days' GROUP BY 1`, cid)
	if err == nil {
		for rows.Next() {
			var d, n int
			if rows.Scan(&d, &n) == nil && d >= 0 && d < 14 {
				k.Serie[13-d] = n
			}
		}
		rows.Close()
	}
	p.Estado, _ = estadoVenta(cfg, k.Boletos, time.Now())
	if p.Actual, err = s.sorteoActual(ctx, s.a.DB, cid); err != nil {
		return nil, err
	}
	if p.Actual != nil {
		if p.Actual.Estado == "confirmado" {
			p.Estado = "sorteado"
		}
		s.conGanador(ctx, p.Actual)
	}
	return p, nil
}

// Compra is a purchase in the backoffice list.
type Compra struct {
	ID        uuid.UUID  `json:"id"`
	Nombre    string     `json:"nombre"`
	Email     string     `json:"email"`
	Telefono  string     `json:"telefono"`
	Cantidad  int        `json:"cantidad"`
	Importe   int        `json:"importe"`
	Estado    string     `json:"estado"`
	Boletos   string     `json:"boletos" doc:"«0427–0428»"`
	Pasarela  string     `json:"pasarela"`
	Tarjeta   string     `json:"tarjeta"`
	Motivo    string     `json:"motivo,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	PagadaAt  *time.Time `json:"pagadaAt,omitempty"`
}

func rango(nums []int) string {
	if len(nums) == 0 {
		return "—"
	}
	if len(nums) == 1 {
		return numero(nums[0])
	}
	seguidos := nums[len(nums)-1]-nums[0] == len(nums)-1
	if seguidos {
		return numero(nums[0]) + "–" + numero(nums[len(nums)-1])
	}
	out := []string{}
	for _, n := range nums {
		out = append(out, numero(n))
	}
	return strings.Join(out, ", ")
}

func (s *Svc) compras(ctx context.Context, cid uuid.UUID, estado, q string, pagina, por int) ([]Compra, int, error) {
	where := `c.competition_id = $1`
	args := []any{cid}
	if estado != "" {
		args = append(args, estado)
		where += fmt.Sprintf(` AND c.estado = $%d`, len(args))
	}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		where += fmt.Sprintf(` AND (lower(c.nombre) LIKE $%d OR lower(c.email::text) LIKE $%d OR EXISTS (SELECT 1 FROM boletos b WHERE b.compra_id = c.id AND lpad(b.numero::text, 4, '0') LIKE $%d))`, len(args), len(args), len(args))
	}
	var total int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM compras c WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	lim := ""
	if por > 0 {
		lim = fmt.Sprintf(` LIMIT %d OFFSET %d`, por, (pagina-1)*por)
	}
	rows, err := s.a.DB.Query(ctx, `SELECT c.id, c.nombre, COALESCE(c.email::text, ''), c.telefono, c.cantidad, c.importe, c.estado, c.pasarela, c.tarjeta, c.motivo, c.created_at, c.pagada_at,
		COALESCE((SELECT array_agg(b.numero ORDER BY b.numero) FROM boletos b WHERE b.compra_id = c.id), '{}')
		FROM compras c WHERE `+where+` ORDER BY c.created_at DESC`+lim, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Compra{}
	for rows.Next() {
		var x Compra
		var nums []int
		if err := rows.Scan(&x.ID, &x.Nombre, &x.Email, &x.Telefono, &x.Cantidad, &x.Importe, &x.Estado, &x.Pasarela, &x.Tarjeta, &x.Motivo, &x.CreatedAt, &x.PagadaAt, &nums); err != nil {
			return nil, 0, err
		}
		x.Boletos = rango(nums)
		out = append(out, x)
	}
	return out, total, rows.Err()
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/sorteo"
	gestionar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := auth.Require(ctx, cid.String(), "sorteo.gestionar")
		return err
	}
	ver := func(ctx context.Context, cid uuid.UUID) error {
		if gestionar(ctx, cid) == nil {
			return nil
		}
		_, err := auth.Require(ctx, cid.String(), "sorteo.sortear")
		return err
	}
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type panelOut struct {
		ETag string `header:"ETag"`
		Body *Panel
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-panel", Method: http.MethodGet, Path: base, Summary: "Configuración, checklist legal, KPIs y sorteo actual", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*panelOut, error) {
			if err := ver(ctx, in.CID); err != nil {
				return nil, err
			}
			p, err := s.panel(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			return &panelOut{ETag: fmt.Sprintf(`"%d"`, p.Config.Version), Body: p}, nil
		})

	type cfgIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    Config
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-config", Method: http.MethodPut, Path: base, Summary: "Guardar la configuración (activar exige la checklist legal completa)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cfgIn) (*panelOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			for _, p := range b.Presets {
				if p < 1 || p > b.MaxPorPersona {
					return nil, problem.Unprocessable("PRESETS_NO_VALIDOS", fmt.Sprintf("Los botones rápidos deben estar entre 1 y %d.", b.MaxPorPersona))
				}
			}
			if b.VentaDesde != nil && b.VentaHasta != nil && !b.VentaDesde.Before(*b.VentaHasta) {
				return nil, problem.Unprocessable("FECHAS_NO_VALIDAS", "La venta debe empezar antes de terminar.")
			}
			for _, u := range []string{b.PremioImagen} {
				if u != "" && !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "/") {
					return nil, problem.Unprocessable("IMAGEN_NO_VALIDA", "La imagen debe ser un enlace https.")
				}
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO config (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, in.CID); err != nil {
					return err
				}
				cur, err := cargarConfig(ctx, tx, in.CID, true)
				if err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != fmt.Sprint(cur.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración. Recarga la página.")
				}
				if b.Activa && !cur.Activa {
					if _, completa, err := s.checklist(ctx, tx, in.CID); err != nil {
						return err
					} else if !completa {
						return problem.Conflict("CHECKLIST_LEGAL_PENDIENTE", "Completa antes la checklist legal (revisión de la asesoría).")
					}
					if strings.TrimSpace(b.Destino) == "" || strings.TrimSpace(b.Premio) == "" {
						return problem.Conflict("FALTAN_DATOS", "Indica el premio y el destino benéfico antes de abrir la venta.")
					}
				}
				if b.Precio != cur.Precio && s.vendidos(ctx, tx, in.CID) > 0 {
					return problem.Conflict("PRECIO_CON_VENTAS", "Con boletos vendidos el precio ya no puede cambiar.")
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET premio=$2, premio_detalle=$3, premio_imagen=$4, premio_valor=$5, destino=$6, precio=$7, max_por_persona=$8, presets=$9, total_max=$10,
					venta_desde=$11, venta_hasta=$12, fecha_sorteo=$13, activa=$14, version = version + 1, updated_por=$15, updated_at = now() WHERE competition_id = $1`,
					in.CID, strings.TrimSpace(b.Premio), strings.TrimSpace(b.PremioDetalle), b.PremioImagen, b.PremioValor, strings.TrimSpace(b.Destino), b.Precio, b.MaxPorPersona, b.Presets, b.TotalMax,
					b.VentaDesde, b.VentaHasta, b.FechaSorteo, b.Activa, actor(ctx)); err != nil {
					return err
				}
				tipo := "sorteo.configuracion"
				if b.Activa != cur.Activa {
					tipo = map[bool]string{true: "sorteo.venta_abierta", false: "sorteo.venta_cerrada"}[b.Activa]
				}
				return events.Enqueue(ctx, tx, events.New(ctx, tipo, map[string]any{"precio": b.Precio, "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("sorteo.gestionar"), events.Subject("sorteo")))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			p, err := s.panel(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			return &panelOut{ETag: fmt.Sprintf(`"%d"`, p.Config.Version), Body: p}, nil
		})

	type chkIn struct {
		CID   uuid.UUID `path:"cid"`
		Clave string    `path:"clave" maxLength:"40"`
		Body  struct {
			Estado string `json:"estado" enum:"pendiente,hecho,no_aplica"`
			Nota   string `json:"nota,omitempty" maxLength:"300"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-checklist", Method: http.MethodPut, Path: base + "/checklist/{clave}", Summary: "Marcar un punto de la checklist legal", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *chkIn) (*panelOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			titulo := ""
			for _, it := range checklistItems {
				if it.Clave == in.Clave {
					titulo = it.Titulo
				}
			}
			if titulo == "" {
				return nil, problem.NotFound("Ese punto no existe.")
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO checklist (competition_id, clave, estado, nota, por) VALUES ($1,$2,$3,$4,$5)
					ON CONFLICT (competition_id, clave) DO UPDATE SET estado = EXCLUDED.estado, nota = EXCLUDED.nota, por = EXCLUDED.por, updated_at = now()`,
					in.CID, in.Clave, in.Body.Estado, strings.TrimSpace(in.Body.Nota), actor(ctx)); err != nil {
					return err
				}
				// A point back to «pendiente» stops the sale at once.
				if in.Body.Estado == "pendiente" {
					tag, err := tx.Exec(ctx, `UPDATE config SET activa = false, version = version + 1, updated_at = now() WHERE competition_id = $1 AND activa`, in.CID)
					if err != nil {
						return err
					}
					if tag.RowsAffected() > 0 {
						if err := events.Enqueue(ctx, tx, events.New(ctx, "sorteo.venta_cerrada", map[string]any{"motivo": "Checklist legal: «" + titulo + "» pendiente", "por": actor(ctx)},
							events.Competition(in.CID.String()), events.ForPermission("sorteo.gestionar"), events.Subject("sorteo"))); err != nil {
							return err
						}
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "sorteo.checklist", map[string]any{"punto": titulo, "estado": in.Body.Estado, "nota": in.Body.Nota, "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("sorteo.gestionar"), events.Subject("sorteo")))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			p, err := s.panel(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			s.sincronizarModulo(ctx, in.CID, p.ChecklistCompleta)
			return &panelOut{ETag: fmt.Sprintf(`"%d"`, p.Config.Version), Body: p}, nil
		})

	type listaIn struct {
		CID    uuid.UUID `path:"cid"`
		Estado string    `query:"estado" enum:"pendiente,pagada,fallida,caducada,reembolsada,"`
		Q      string    `query:"q" maxLength:"80"`
		Pagina int       `query:"pagina" minimum:"1" default:"1"`
	}
	type listaOut struct {
		Body struct {
			Items  []Compra `json:"items"`
			Total  int      `json:"total"`
			Pagina int      `json:"pagina"`
			Por    int      `json:"por"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-compras", Method: http.MethodGet, Path: base + "/compras", Summary: "Compras y boletos", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			o := &listaOut{}
			var err error
			o.Body.Items, o.Body.Total, err = s.compras(ctx, in.CID, in.Estado, in.Q, in.Pagina, 25)
			o.Body.Pagina, o.Body.Por = in.Pagina, 25
			return o, err
		})

	type csvOut struct {
		ContentType        string `header:"Content-Type"`
		ContentDisposition string `header:"Content-Disposition"`
		Body               []byte
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-compras-csv", Method: http.MethodGet, Path: base + "/compras.csv", Summary: "Compras en CSV", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*csvOut, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			items, _, err := s.compras(ctx, in.CID, in.Estado, in.Q, 1, 0)
			if err != nil {
				return nil, err
			}
			var b bytes.Buffer
			b.WriteString("\ufeff")
			w := csv.NewWriter(&b)
			w.Comma = ';'
			_ = w.Write([]string{"Fecha", "Nombre", "Email", "Teléfono", "Boletos", "Números", "Importe", "Estado", "Pasarela", "Tarjeta"})
			cell := func(v string) string {
				if v != "" && strings.ContainsRune("=+-@", rune(v[0])) {
					return "'" + v
				}
				return v
			}
			for _, x := range items {
				_ = w.Write([]string{x.CreatedAt.In(madrid).Format("2006-01-02 15:04"), cell(x.Nombre), cell(x.Email), cell(x.Telefono), itoa(x.Cantidad), x.Boletos, pagos.Euros(x.Importe), x.Estado, x.Pasarela, x.Tarjeta})
			}
			w.Flush()
			_ = events.Publish(ctx, s.a.Redis, s.a.Stream(), events.New(ctx, "sorteo.exportado", map[string]any{"filas": len(items), "por": actor(ctx)}, events.Competition(in.CID.String()), events.ForPermission("sorteo.gestionar")))
			return &csvOut{ContentType: "text/csv; charset=utf-8", ContentDisposition: `attachment; filename="sorteo-compras.csv"`, Body: b.Bytes()}, nil
		})

	type reIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Confirmacion string `json:"confirmacion" doc:"Escribe REEMBOLSAR"`
			Motivo       string `json:"motivo" minLength:"3" maxLength:"200"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-reembolso", Method: http.MethodPost, Path: base + "/compras/{id}/reembolso", Summary: "Reembolsar una compra (anula sus boletos)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *reIn) (*struct{ Body Compra }, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			if strings.TrimSpace(strings.ToUpper(in.Body.Confirmacion)) != "REEMBOLSAR" {
				return nil, problem.Unprocessable("CONFIRMACION", "Escribe REEMBOLSAR para confirmar.")
			}
			var pago, estado, pas string
			var importe int
			var em *string
			var nombre string
			if err := s.a.DB.QueryRow(ctx, `SELECT pago, estado, importe, pasarela, email::text, nombre FROM compras WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&pago, &estado, &importe, &pas, &em, &nombre); err != nil {
				return nil, problem.NotFound("Compra no encontrada.")
			}
			if estado != "pagada" {
				return nil, problem.Conflict("NO_REEMBOLSABLE", "Solo se reembolsan compras pagadas.")
			}
			if x, _ := s.sorteoActual(ctx, s.a.DB, in.CID); x != nil {
				code := "SORTEO_EN_CURSO"
				msg := "La lista del sorteo está congelada: repítelo con un motivo antes de reembolsar."
				if x.Estado == "confirmado" {
					code, msg = "SORTEO_REALIZADO", "El sorteo ya se hizo: no se puede reembolsar."
				}
				return nil, problem.Conflict(code, msg)
			}
			prov := s.proveedor(ctx, in.CID)
			if prov == nil || prov.Name() != pas && !(pas == "simulado" && s.sim != nil) {
				return nil, problem.Conflict("PASARELA_DISTINTA", "Esta compra se pagó con otra pasarela: reembólsala desde su panel.")
			}
			var p = prov
			if pas == "simulado" && s.sim != nil {
				p = s.sim
			}
			ref, err := p.Refund(ctx, pago, importe, "requested_by_customer")
			if err != nil {
				s.a.Log.Warn("reembolso del sorteo", "err", err)
				return nil, problem.New(http.StatusBadGateway, "REEMBOLSO_FALLIDO", "La pasarela no ha podido reembolsar: "+err.Error())
			}
			var nums []int
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE compras SET estado = 'reembolsada', reembolso = $2, motivo = $3, reembolsada_at = now(), updated_at = now() WHERE id = $1`, in.ID, ref, strings.TrimSpace(in.Body.Motivo)); err != nil {
					return err
				}
				rows, err := tx.Query(ctx, `UPDATE boletos SET anulado = true, motivo = 'Reembolso' WHERE compra_id = $1 RETURNING numero`, in.ID)
				if err != nil {
					return err
				}
				for rows.Next() {
					var n int
					_ = rows.Scan(&n)
					nums = append(nums, n)
				}
				rows.Close()
				if em != nil {
					if err := email(ctx, tx, in.CID, *em, "sorteo-reembolso", map[string]string{"nombre": strings.Fields(nombre + " ")[0], "importe": pagos.Euros(importe), "boletos": rango(nums), "motivo": in.Body.Motivo}); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "sorteo.reembolso", map[string]any{"boletos": len(nums), "importe": importe, "motivo": in.Body.Motivo, "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("sorteo.gestionar"), events.Subject("compra:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			items, _, err := s.compras(ctx, in.CID, "", "", 1, 0)
			for _, x := range items {
				if x.ID == in.ID {
					return &struct{ Body Compra }{x}, err
				}
			}
			return nil, err
		})

	type idIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-reenviar", Method: http.MethodPost, Path: base + "/compras/{id}/reenviar", Summary: "Reenviar los boletos por email", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			if err := gestionar(ctx, in.CID); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var em *string
				var nombre, estado string
				var cantidad, importe int
				if err := tx.QueryRow(ctx, `SELECT email::text, nombre, estado, cantidad, importe FROM compras WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&em, &nombre, &estado, &cantidad, &importe); err != nil {
					return problem.NotFound("Compra no encontrada.")
				}
				if estado != "pagada" || em == nil {
					return problem.Conflict("NO_REENVIABLE", "Solo se reenvían compras pagadas con email.")
				}
				var nums []int
				rows, err := tx.Query(ctx, `SELECT numero FROM boletos WHERE compra_id = $1 AND NOT anulado ORDER BY numero`, in.ID)
				if err != nil {
					return err
				}
				for rows.Next() {
					var n int
					_ = rows.Scan(&n)
					nums = append(nums, n)
				}
				rows.Close()
				cfg, _ := cargarConfig(ctx, tx, in.CID, false)
				txt := []string{}
				for _, n := range nums {
					txt = append(txt, numero(n))
				}
				v := map[string]string{"nombre": strings.Fields(nombre + " ")[0], "boletos": strings.Join(txt, ", "), "cantidad": itoa(cantidad), "importe": pagos.Euros(importe),
					"premio": cfg.Premio, "fechaSorteo": "", "enlace": s.webURL + "/sorteo/confirmacion?compra=" + in.ID.String() + "&t=" + s.tokenCompra(in.ID), "destino": cfg.Destino}
				if cfg.FechaSorteo != nil {
					v["fechaSorteo"] = fechaHora(*cfg.FechaSorteo)
				}
				return email(ctx, tx, in.CID, *em, "sorteo-boletos", v)
			})
		})
}

// registerRGPD: crm forwards the right to erasure. Purchases keep their amounts and ticket numbers (accounting and
// the draw record) but lose every personal datum.
func (s *Svc) registerRGPD() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Email    string `json:"email,omitempty" maxLength:"254"`
			Telefono string `json:"telefono,omitempty" maxLength:"30"`
		}
	}
	type out struct {
		Body struct {
			Compras int `json:"compras"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-rgpd-supresion", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/rgpd/supresion", Summary: "Derecho de supresión (solo crm)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			em := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if em == "" {
				return o, nil
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE compras SET nombre = 'Anonimizado', email = NULL, telefono = '', consentimientos = '{}', anonimizada_at = now(), updated_at = now()
				WHERE competition_id = $1 AND email = $2`, in.CID, em)
			if err != nil {
				return nil, err
			}
			o.Body.Compras = int(tag.RowsAffected())
			return o, nil
		})
}

var _ = errors.New

// sincronizarModulo keeps the «sorteo» module of «Evento y módulos» locked while the legal checklist is pending
// (best effort: the checklist itself already gates the sale).
func (s *Svc) sincronizarModulo(ctx context.Context, cid uuid.UUID, completa bool) {
	motivo := ""
	if !completa {
		motivo = "Checklist legal del sorteo pendiente (Sorteo › Configuración)"
	}
	if err := s.comp.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/modulos/sorteo/bloqueo", map[string]any{"bloqueado": !completa, "motivo": motivo}, nil); err != nil {
		s.a.Log.Warn("bloqueo del módulo sorteo", "err", err)
	}
}
