package raffle

import (
	"context"
	"crypto/hmac"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagPub = []string{"Sorteo"}

// Config is the raffle setup of a competition.
type Config struct {
	Premio        string     `json:"premio" maxLength:"160"`
	PremioDetalle string     `json:"premioDetalle" maxLength:"600"`
	PremioImagen  string     `json:"premioImagen" maxLength:"500"`
	PremioValor   int        `json:"premioValor" minimum:"0" doc:"Céntimos"`
	Destino       string     `json:"destino" maxLength:"200" doc:"Entidad benéfica que recibe lo recaudado"`
	Precio        int        `json:"precio" minimum:"50" maximum:"10000" doc:"Céntimos por boleto"`
	MaxPorPersona int        `json:"maxPorPersona" minimum:"1" maximum:"100"`
	Presets       []int      `json:"presets" maxItems:"6"`
	TotalMax      *int       `json:"totalMax,omitempty" minimum:"1"`
	VentaDesde    *time.Time `json:"ventaDesde,omitempty"`
	VentaHasta    *time.Time `json:"ventaHasta,omitempty"`
	FechaSorteo   *time.Time `json:"fechaSorteo,omitempty"`
	Activa        bool       `json:"activa"`
	Version       int        `json:"version" readOnly:"true"`
	UpdatedPor    string     `json:"updatedPor" readOnly:"true"`
	UpdatedAt     time.Time  `json:"updatedAt" readOnly:"true"`
}

const selConfig = `SELECT premio, premio_detalle, premio_imagen, premio_valor, destino, precio, max_por_persona, presets, total_max, venta_desde, venta_hasta, fecha_sorteo, activa, version, updated_por, updated_at FROM config WHERE competition_id = $1`

type rowQ interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func cargarConfig(ctx context.Context, q rowQ, cid uuid.UUID, lock bool) (Config, error) {
	sql := selConfig
	if lock {
		sql += ` FOR UPDATE`
	}
	var c Config
	err := q.QueryRow(ctx, sql, cid).Scan(&c.Premio, &c.PremioDetalle, &c.PremioImagen, &c.PremioValor, &c.Destino, &c.Precio, &c.MaxPorPersona, &c.Presets, &c.TotalMax,
		&c.VentaDesde, &c.VentaHasta, &c.FechaSorteo, &c.Activa, &c.Version, &c.UpdatedPor, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Config{Precio: 100, MaxPorPersona: 10, Presets: []int{1, 2, 5, 10}}, nil
	}
	return c, err
}

// estadoVenta: en_venta · proximamente · cerrada · agotada · bloqueada (sale off: legal checklist or decision).
func estadoVenta(c Config, vendidos int, now time.Time) (string, string) {
	switch {
	case !c.Activa:
		return "bloqueada", "La venta se abrirá cuando esté todo listo. Te avisamos por novedades."
	case c.VentaDesde != nil && now.Before(*c.VentaDesde):
		return "proximamente", "La venta abre el " + fechaHora(*c.VentaDesde) + "."
	case c.VentaHasta != nil && now.After(*c.VentaHasta):
		return "cerrada", "La venta de boletos ha terminado."
	case c.TotalMax != nil && vendidos >= *c.TotalMax:
		return "agotada", "Se han vendido todos los boletos."
	}
	return "en_venta", ""
}

// Ganador is the confirmed winner as the public sees it.
type Ganador struct {
	Numero string    `json:"numero"`
	Nombre string    `json:"nombre" doc:"Nombre e inicial del apellido"`
	At     time.Time `json:"at"`
}

// Verificacion lets anyone check the draw: sha256(semilla) = semillaHash, and the winner is
// HMAC-SHA256(semilla, hashLista) mod total over the published list (lista.txt).
type Verificacion struct {
	SemillaHash string `json:"semillaHash"`
	HashLista   string `json:"hashLista"`
	Total       int    `json:"total"`
	Semilla     string `json:"semilla,omitempty" doc:"Se revela al confirmar"`
	Indice      *int   `json:"indice,omitempty"`
	Estado      string `json:"estado"`
}

// Publico is what /sorteo shows.
type Publico struct {
	Estado        string        `json:"estado" enum:"en_venta,proximamente,cerrada,agotada,bloqueada,sorteado"`
	Motivo        string        `json:"motivo,omitempty"`
	Premio        string        `json:"premio"`
	PremioDetalle string        `json:"premioDetalle"`
	PremioImagen  string        `json:"premioImagen"`
	PremioValor   int           `json:"premioValor"`
	Destino       string        `json:"destino"`
	Precio        int           `json:"precio"`
	MaxPorPersona int           `json:"maxPorPersona"`
	Presets       []int         `json:"presets"`
	Vendidos      int           `json:"vendidos"`
	TotalMax      *int          `json:"totalMax,omitempty"`
	VentaHasta    *time.Time    `json:"ventaHasta,omitempty"`
	FechaSorteo   *time.Time    `json:"fechaSorteo,omitempty"`
	Pasarela      string        `json:"pasarela" enum:"stripe,simulado,ninguna"`
	Ganador       *Ganador      `json:"ganador,omitempty"`
	Verificacion  *Verificacion `json:"verificacion,omitempty"`
}

func (s *Svc) vendidos(ctx context.Context, q rowQ, cid uuid.UUID) int {
	var n int
	_ = q.QueryRow(ctx, `SELECT count(*) FROM boletos WHERE competition_id = $1 AND NOT anulado`, cid).Scan(&n)
	return n
}

// sorteoActual is the latest draw that was not repeated.
func (s *Svc) sorteoActual(ctx context.Context, q rowQ, cid uuid.UUID) (*Sorteo, error) {
	x, err := scanSorteo(q.QueryRow(ctx, selSorteo+` WHERE competition_id = $1 AND estado <> 'repetido' ORDER BY created_at DESC LIMIT 1`, cid))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &x, err
}

func (s *Svc) publico(ctx context.Context, c compref.Comp) (*Publico, error) {
	cfg, err := cargarConfig(ctx, s.a.DB, c.ID, false)
	if err != nil {
		return nil, err
	}
	o := &Publico{Premio: cfg.Premio, PremioDetalle: cfg.PremioDetalle, PremioImagen: cfg.PremioImagen, PremioValor: cfg.PremioValor, Destino: cfg.Destino, Precio: cfg.Precio,
		MaxPorPersona: cfg.MaxPorPersona, Presets: cfg.Presets, TotalMax: cfg.TotalMax, VentaHasta: cfg.VentaHasta, FechaSorteo: cfg.FechaSorteo, Pasarela: provName(s.proveedor(ctx, c.ID))}
	o.Vendidos = s.vendidos(ctx, s.a.DB, c.ID)
	o.Estado, o.Motivo = estadoVenta(cfg, o.Vendidos, time.Now())
	x, err := s.sorteoActual(ctx, s.a.DB, c.ID)
	if err != nil {
		return nil, err
	}
	if x != nil {
		o.Verificacion = &Verificacion{SemillaHash: x.SemillaHash, HashLista: x.HashLista, Total: x.Total, Estado: x.Estado}
		if x.Estado == "confirmado" {
			o.Estado, o.Motivo = "sorteado", ""
			o.Verificacion.Semilla, o.Verificacion.Indice = x.semilla, x.Indice
			var nombre string
			_ = s.a.DB.QueryRow(ctx, `SELECT nombre FROM compras WHERE id = $1`, x.CompraID).Scan(&nombre)
			o.Ganador = &Ganador{Numero: numero(*x.Numero), Nombre: nombrePublico(nombre), At: *x.ConfirmadoAt}
		}
	}
	return o, nil
}

// EstadoCompra is the status page after paying (/sorteo/confirmacion).
type EstadoCompra struct {
	ID       uuid.UUID `json:"id"`
	Estado   string    `json:"estado" enum:"pendiente,pagada,fallida,caducada,reembolsada"`
	Nombre   string    `json:"nombre"`
	Email    string    `json:"email" doc:"Enmascarado"`
	Cantidad int       `json:"cantidad"`
	Importe  int       `json:"importe"`
	Boletos  []string  `json:"boletos"`
	Tarjeta  string    `json:"tarjeta,omitempty"`
	Pruebas  bool      `json:"pruebas"`
}

func mascara(e string) string {
	at := strings.IndexByte(e, '@')
	if at < 1 {
		return "***"
	}
	return e[:1] + "***" + e[at:]
}

func (s *Svc) estadoCompra(ctx context.Context, cid, id uuid.UUID) (EstadoCompra, error) {
	var e EstadoCompra
	var em *string
	var pas string
	err := s.a.DB.QueryRow(ctx, `SELECT id, estado, nombre, email::text, cantidad, importe, tarjeta, pasarela FROM compras WHERE competition_id = $1 AND id = $2`, cid, id).
		Scan(&e.ID, &e.Estado, &e.Nombre, &em, &e.Cantidad, &e.Importe, &e.Tarjeta, &pas)
	if err != nil {
		return e, problem.NotFound("Compra no encontrada.")
	}
	if em != nil {
		e.Email = mascara(*em)
	}
	e.Nombre = strings.Fields(e.Nombre + " ")[0]
	e.Pruebas = pas == "simulado"
	e.Boletos = []string{}
	rows, err := s.a.DB.Query(ctx, `SELECT numero FROM boletos WHERE compra_id = $1 AND NOT anulado ORDER BY numero`, id)
	if err != nil {
		return e, err
	}
	defer rows.Close()
	for rows.Next() {
		var n int
		if err := rows.Scan(&n); err != nil {
			return e, err
		}
		e.Boletos = append(e.Boletos, numero(n))
	}
	return e, rows.Err()
}

func (s *Svc) registerPublic() {
	api := s.a.API
	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type pubOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         *Publico
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-publico", Method: http.MethodGet, Path: "/api/competiciones/{slug}/sorteo", Summary: "Sorteo: premio, precio, venta, ganador y verificación", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*pubOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			o, err := s.publico(ctx, c)
			return &pubOut{CacheControl: "no-cache", Body: o}, err
		})

	type compraIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Nombre           string `json:"nombre" minLength:"2" maxLength:"120"`
			Email            string `json:"email" format:"email" maxLength:"254"`
			Telefono         string `json:"telefono,omitempty" maxLength:"30"`
			Cantidad         int    `json:"cantidad" minimum:"1" maximum:"100"`
			MayorEdad        bool   `json:"mayorEdad" doc:"Declara tener 18 años o más"`
			AceptaBases      bool   `json:"aceptaBases"`
			AceptaPrivacidad bool   `json:"aceptaPrivacidad"`
			Novedades        bool   `json:"novedades,omitempty" doc:"Casilla separada y sin marcar"`
			Origen           string `json:"origen,omitempty" maxLength:"60"`
		}
	}
	type compraOut struct {
		Body struct {
			CompraID    uuid.UUID `json:"compraId"`
			CheckoutURL string    `json:"checkoutUrl"`
			Importe     int       `json:"importe"`
			Token       string    `json:"token"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-comprar", Method: http.MethodPost, Path: "/api/competiciones/{slug}/sorteo/compras", Summary: "Comprar boletos (devuelve el enlace de pago)", Tags: tagPub, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *compraIn) (*compraOut, error) {
			b := in.Body
			if !b.MayorEdad || !b.AceptaBases || !b.AceptaPrivacidad {
				return nil, problem.Unprocessable("CONSENTIMIENTO_REQUERIDO", "Para participar tienes que ser mayor de edad y aceptar las bases y la política de privacidad.")
			}
			em := strings.ToLower(strings.TrimSpace(b.Email))
			if a, err := mail.ParseAddress(em); err != nil || a.Address != em {
				return nil, problem.Unprocessable("EMAIL_NO_VALIDO", "Revisa el email.")
			}
			ip := httpx.ClientIPFrom(ctx)
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "sorteo", ip), 30, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Demasiadas compras desde esta conexión. Inténtalo en un rato.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "sorteo-email", sha(em)), 8, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has intentado varias compras seguidas con este email. Inténtalo más tarde.")
			}
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			prov := s.proveedor(ctx, c.ID)
			if prov == nil {
				return nil, problem.New(http.StatusServiceUnavailable, "PASARELA_NO_CONFIGURADA", "Los pagos aún no están activos. Vuelve en unos días.")
			}
			id := newID()
			tok := s.tokenCompra(id)
			var importe int
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				cfg, err := cargarConfig(ctx, tx, c.ID, true)
				if err != nil {
					return err
				}
				vend := s.vendidos(ctx, tx, c.ID)
				if est, motivo := estadoVenta(cfg, vend, time.Now()); est != "en_venta" {
					return problem.Conflict("VENTA_CERRADA", motivo)
				}
				if x, _ := s.sorteoActual(ctx, tx, c.ID); x != nil {
					return problem.Conflict("VENTA_CERRADA", "La lista del sorteo ya está cerrada.")
				}
				var mias, pend int
				if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(cantidad) FILTER (WHERE email = $2 AND (estado = 'pagada' OR estado = 'pendiente' AND created_at > now() - interval '40 minutes')), 0),
					COALESCE(sum(cantidad) FILTER (WHERE estado = 'pendiente' AND created_at > now() - interval '40 minutes'), 0) FROM compras WHERE competition_id = $1`, c.ID, em).Scan(&mias, &pend); err != nil {
					return err
				}
				if mias+b.Cantidad > cfg.MaxPorPersona {
					return problem.Conflict("MAXIMO_POR_PERSONA", fmt.Sprintf("Cada persona puede tener como mucho %d boletos: te quedan %d.", cfg.MaxPorPersona, max(0, cfg.MaxPorPersona-mias)))
				}
				if cfg.TotalMax != nil && vend+pend+b.Cantidad > *cfg.TotalMax {
					return problem.Conflict("AGOTADO", fmt.Sprintf("Solo quedan %d boletos.", max(0, *cfg.TotalMax-vend-pend)))
				}
				importe = cfg.Precio * b.Cantidad
				cons := map[string]any{"mayorEdad": true, "bases": true, "privacidad": true, "novedades": b.Novedades, "ip": anonIP(ip), "at": time.Now().UTC()}
				_, err = tx.Exec(ctx, `INSERT INTO compras (id, competition_id, nombre, email, telefono, cantidad, importe, pasarela, consentimientos, token_hash, origen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
					id, c.ID, strings.TrimSpace(b.Nombre), em, strings.TrimSpace(b.Telefono), b.Cantidad, importe, prov.Name(), cons, sha(tok), b.Origen)
				return err
			})
			if err != nil {
				return nil, err
			}
			nb := "boletos"
			if b.Cantidad == 1 {
				nb = "boleto"
			}
			co, err := prov.CreateCheckout(ctx, pagos.CheckoutIn{Amount: importe, Description: fmt.Sprintf("%d %s · Sorteo %s", b.Cantidad, nb, c.Nombre), Email: em,
				SuccessURL: s.webURL + "/sorteo/confirmacion?compra=" + id.String() + "&t=" + tok, CancelURL: s.webURL + "/sorteo?cancelado=1#participa",
				Metadata: map[string]string{"competicion": c.ID.String(), "compra": id.String()}, ExpiresAt: time.Now().Add(30 * time.Minute),
				Lines: []pagos.Line{{Label: fmt.Sprintf("%d %s × %s", b.Cantidad, nb, pagos.Euros(importe/b.Cantidad)), Amount: importe}}})
			if err != nil {
				_, _ = s.a.DB.Exec(ctx, `UPDATE compras SET estado = 'fallida', motivo = 'No se pudo abrir el pago', updated_at = now() WHERE id = $1`, id)
				s.a.Log.Warn("checkout del sorteo", "err", err)
				return nil, problem.New(http.StatusBadGateway, "PAGO_NO_DISPONIBLE", "No se pudo abrir el pago. Inténtalo en unos minutos.")
			}
			if _, err := s.a.DB.Exec(ctx, `UPDATE compras SET sesion = $2 WHERE id = $1`, id, co.ID); err != nil {
				return nil, err
			}
			o := &compraOut{}
			o.Body.CompraID, o.Body.CheckoutURL, o.Body.Importe, o.Body.Token = id, co.URL, importe, tok
			return o, nil
		})

	type estadoIn struct {
		Slug string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		ID   uuid.UUID `path:"id"`
		T    string    `query:"t" maxLength:"64"`
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-compra-estado", Method: http.MethodGet, Path: "/api/competiciones/{slug}/sorteo/compras/{id}", Summary: "Estado de una compra (enlace de la confirmación)", Tags: tagPub},
		func(ctx context.Context, in *estadoIn) (*struct{ Body EstadoCompra }, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if !hmac.Equal([]byte(s.tokenCompra(in.ID)), []byte(in.T)) {
				return nil, problem.NotFound("Compra no encontrada.")
			}
			e, err := s.estadoCompra(ctx, c.ID, in.ID)
			if err == nil && e.Estado == "pendiente" && s.sim != nil {
				// The simulated gateway delivers its webhook right after paying; retry a lost one.
				var ses string
				_ = s.a.DB.QueryRow(ctx, `SELECT sesion FROM compras WHERE id = $1`, in.ID).Scan(&ses)
				s.sim.Redeliver(ctx, ses)
				e, err = s.estadoCompra(ctx, c.ID, in.ID)
			}
			return &struct{ Body EstadoCompra }{e}, err
		})

	// The frozen list of the current draw, one ticket per line (to verify the draw).
	type listaOut struct {
		ContentType string `header:"Content-Type"`
		Body        []byte
	}
	huma.Register(api, huma.Operation{OperationID: "sorteo-lista", Method: http.MethodGet, Path: "/api/competiciones/{slug}/sorteo/lista.txt", Summary: "Lista congelada de boletos del sorteo (para verificarlo)", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*listaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			x, err := s.sorteoActual(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			if x == nil {
				return nil, problem.NotFound("La lista se publica al cerrar la venta, antes del sorteo.")
			}
			return &listaOut{ContentType: "text/plain; charset=utf-8", Body: []byte(listaTexto(x.Lista))}, nil
		})

	// Payment webhook (Stripe or simulated, same format and signature).
	s.a.Mux.HandleFunc("POST /api/webhooks/pagos/sorteo", func(w http.ResponseWriter, r *http.Request) {
		payload, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
		if err != nil {
			http.Error(w, "payload", http.StatusBadRequest)
			return
		}
		if err := s.webhook(r.Context(), payload, r.Header); err != nil {
			if errors.Is(err, pagos.ErrSignature) {
				s.a.Log.Warn("webhook de pago rechazado", "err", err)
				http.Error(w, "firma", http.StatusBadRequest)
				return
			}
			s.a.Log.Error("webhook de pago", "err", err)
			http.Error(w, "error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
}

func (s *Svc) webhook(ctx context.Context, payload []byte, h http.Header) error {
	var peek struct {
		Data struct {
			Object struct {
				Metadata map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if jsonUnmarshal(payload, &peek) != nil {
		return pagos.ErrSignature
	}
	cid, err := uuid.Parse(peek.Data.Object.Metadata["competicion"])
	if err != nil {
		return pagos.ErrSignature
	}
	prov := s.proveedor(ctx, cid)
	if prov == nil {
		return pagos.ErrSignature
	}
	ev, err := prov.VerifyWebhook(payload, h)
	if err != nil && s.sim != nil && prov != pagos.Provider(s.sim) {
		ev, err = s.sim.VerifyWebhook(payload, h)
	}
	if err != nil {
		return err
	}
	id, err := uuid.Parse(ev.Metadata["compra"])
	if err != nil {
		return nil // not ours
	}
	var despues func()
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO pagos_eventos (id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING`, ev.ID, ev.Type)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		switch {
		case ev.Type == "checkout.session.completed" && ev.Paid:
			despues, err = s.confirmarPago(ctx, tx, cid, id, ev)
			return err
		case ev.Type == "checkout.session.expired":
			_, err := tx.Exec(ctx, `UPDATE compras SET estado = 'caducada', updated_at = now() WHERE id = $1 AND estado = 'pendiente'`, id)
			return err
		case ev.Type == "checkout.session.async_payment_failed":
			_, err := tx.Exec(ctx, `UPDATE compras SET estado = 'fallida', updated_at = now() WHERE id = $1 AND estado = 'pendiente'`, id)
			return err
		}
		return nil
	})
	if err != nil {
		return err
	}
	if despues != nil {
		despues()
	}
	s.bump(ctx, cid)
	return nil
}

// confirmarPago numbers the tickets in order (under the config row lock) and emails them. A payment that arrives
// after the draw list was frozen is refunded at once (its tickets could not take part).
func (s *Svc) confirmarPago(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, ev pagos.Event) (func(), error) {
	if _, err := cargarConfig(ctx, tx, cid, true); err != nil {
		return nil, err
	}
	var estado, nombre, tel, pas string
	var em *string
	var cantidad, importe int
	var cons map[string]any
	if err := tx.QueryRow(ctx, `SELECT estado, nombre, email::text, telefono, cantidad, importe, consentimientos, pasarela FROM compras WHERE id = $1 AND competition_id = $2 FOR UPDATE`, id, cid).
		Scan(&estado, &nombre, &em, &tel, &cantidad, &importe, &cons, &pas); err != nil {
		return nil, err
	}
	if estado == "pagada" || estado == "reembolsada" {
		return nil, nil
	}
	if x, _ := s.sorteoActual(ctx, tx, cid); x != nil {
		// Refund pending (reembolso = ''): the worker sends it to the gateway, retries until it is confirmed and then
		// tells the buyer.
		if _, err := tx.Exec(ctx, `UPDATE compras SET estado = 'reembolsada', pago = $2, tarjeta = $3, motivo = 'Pago recibido con la lista del sorteo ya cerrada', pagada_at = now(),
			reembolso = '', updated_at = now() - interval '1 hour' WHERE id = $1`, id, ev.PaymentID, ev.Card); err != nil {
			return nil, err
		}
		return func() { s.reembolsosPendientes(context.WithoutCancel(ctx)) }, nil
	}
	var ultimo int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(max(numero), 0) FROM boletos WHERE competition_id = $1`, cid).Scan(&ultimo); err != nil {
		return nil, err
	}
	nums := make([]string, 0, cantidad)
	for i := 1; i <= cantidad; i++ {
		if _, err := tx.Exec(ctx, `INSERT INTO boletos (id, competition_id, compra_id, numero) VALUES ($1,$2,$3,$4)`, newID(), cid, id, ultimo+i); err != nil {
			return nil, err
		}
		nums = append(nums, numero(ultimo+i))
	}
	if _, err := tx.Exec(ctx, `UPDATE compras SET estado = 'pagada', pago = $2, tarjeta = $3, pagada_at = now(), updated_at = now() WHERE id = $1`, id, ev.PaymentID, ev.Card); err != nil {
		return nil, err
	}
	cfg, err := cargarConfig(ctx, tx, cid, false)
	if err != nil {
		return nil, err
	}
	if em != nil {
		var totalEmail int
		_ = tx.QueryRow(ctx, `SELECT COALESCE(sum(cantidad), 0) FROM compras WHERE competition_id = $1 AND email = $2 AND estado = 'pagada'`, cid, *em).Scan(&totalEmail)
		v := map[string]string{"nombre": strings.Fields(nombre + " ")[0], "boletos": strings.Join(nums, ", "), "cantidad": itoa(cantidad), "importe": pagos.Euros(importe),
			"premio": cfg.Premio, "fechaSorteo": "", "enlace": s.webURL + "/sorteo/confirmacion?compra=" + id.String() + "&t=" + s.tokenCompra(id), "destino": cfg.Destino}
		if cfg.FechaSorteo != nil {
			v["fechaSorteo"] = fechaHora(*cfg.FechaSorteo)
		}
		if err := email(ctx, tx, cid, *em, "sorteo-boletos", v); err != nil {
			return nil, err
		}
		cs := []map[string]any{{"finalidad": "privacidad", "canal": "", "estado": "confirmado", "texto": "Política de privacidad (compra de boletos del sorteo)"}}
		ip, _ := cons["ip"].(string)
		if err := contacto(ctx, tx, cid, map[string]any{"email": *em, "nombre": nombre, "telefono": tel, "origen": "sorteo", "novedades": cons["novedades"] == true, "ip": ip,
			"relacion": map[string]any{"boletos": totalEmail}, "consentimientos": cs,
			"actividad": map[string]any{"tipo": "sorteo", "titulo": fmt.Sprintf("Compró %d boletos del sorteo", cantidad), "detalle": strings.Join(nums, ", ")}}); err != nil {
			return nil, err
		}
	}
	return nil, events.Enqueue(ctx, tx, events.New(ctx, "sorteo.compra", map[string]any{"cantidad": cantidad, "importe": importe, "pasarela": pas},
		events.Competition(cid.String()), events.ForPermission("sorteo.gestionar")))
}

// caducar marks abandoned checkouts (no webhook after 2 h) as expired so they stop holding the per-person limit,
// and pushes the pending automatic refunds.
func (s *Svc) caducar(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		_, _ = s.a.DB.Exec(ctx, `UPDATE compras SET estado = 'caducada', updated_at = now() WHERE estado = 'pendiente' AND created_at < now() - interval '2 hours'`)
		s.reembolsosPendientes(ctx)
	}
}

// reembolsosPendientes refunds the automatic refunds not confirmed yet (one try per purchase every 5 minutes); on
// success the buyer gets the «Te hemos devuelto…» email with the reason.
func (s *Svc) reembolsosPendientes(ctx context.Context) {
	// Claim atomically (the bump of updated_at keeps other pods away for 5 minutes): no double refunds.
	rows, err := s.a.DB.Query(ctx, `UPDATE compras SET updated_at = now() WHERE id IN (SELECT id FROM compras
		WHERE estado = 'reembolsada' AND reembolso = '' AND pago <> '' AND updated_at < now() - interval '5 minutes' ORDER BY updated_at LIMIT 10 FOR UPDATE SKIP LOCKED)
		RETURNING id, competition_id, pago, importe, pasarela, nombre, email::text, motivo`)
	if err != nil {
		return
	}
	type pend struct {
		id, cid                   uuid.UUID
		pago, pas, nombre, motivo string
		importe                   int
		em                        *string
	}
	var ps []pend
	for rows.Next() {
		var p pend
		if rows.Scan(&p.id, &p.cid, &p.pago, &p.importe, &p.pas, &p.nombre, &p.em, &p.motivo) == nil {
			ps = append(ps, p)
		}
	}
	rows.Close()
	for _, p := range ps {
		var prov pagos.Provider
		if p.pas == "simulado" && s.sim != nil {
			prov = s.sim
		} else if pr := s.proveedor(ctx, p.cid); pr != nil && pr.Name() == p.pas {
			prov = pr
		}
		if prov == nil {
			s.a.Log.Warn("reembolso automático sin pasarela", "compra", p.id)
			continue
		}
		ref, err := prov.Refund(ctx, p.pago, p.importe, "requested_by_customer")
		if err != nil {
			s.a.Log.Error("reembolso automático del sorteo", "compra", p.id, "err", err)
			continue
		}
		_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `UPDATE compras SET reembolso = $2, reembolsada_at = now(), updated_at = now() WHERE id = $1`, p.id, ref); err != nil {
				return err
			}
			if p.em == nil {
				return nil
			}
			return email(ctx, tx, p.cid, *p.em, "sorteo-reembolso", map[string]string{"nombre": strings.Fields(p.nombre + " ")[0], "importe": pagos.Euros(p.importe), "boletos": "pedidos", "motivo": p.motivo})
		})
	}
}

func listaTexto(l []int) string {
	var b strings.Builder
	for _, n := range l {
		b.WriteString(numero(n))
		b.WriteByte('\n')
	}
	return b.String()
}

func anonIP(ip string) string {
	if i := strings.LastIndexByte(ip, '.'); i > 0 && strings.Count(ip, ".") == 3 {
		return ip[:i] + ".0"
	}
	if i := strings.Index(ip, ":"); i > 0 {
		p := strings.Split(ip, ":")
		if len(p) > 3 {
			return strings.Join(p[:3], ":") + "::"
		}
	}
	return ip
}
