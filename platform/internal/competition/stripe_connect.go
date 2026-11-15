package competition

import (
	"context"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Stripe Connect («Sistema e integraciones › Integraciones · Stripe»): the platform creates a connected account
// for the competition and the organiser finishes Stripe's hosted onboarding (no keys, no webhooks). athletes and
// donaciones charge on that account once Stripe enables charges (pagos.DeCompeticion).

const connectWebhook = "/api/webhooks/stripe-connect"

type cuentaConnect struct {
	Cuenta        string
	Estado        string
	Cobros, Pagos bool
	DatosEnviados bool
}

// ConnectEstado is what the backoffice shows.
type ConnectEstado struct {
	Plataforma     bool     `json:"plataforma" doc:"La plataforma tiene Stripe Connect configurado"`
	Pruebas        bool     `json:"pruebas" doc:"Stripe en modo test: no se cobra dinero real"`
	Estado         string   `json:"estado" enum:"sin_conectar,pendiente,verificando,restringida,activa"`
	Cobros         bool     `json:"cobros" doc:"Stripe permite cobrar"`
	Pagos          bool     `json:"pagos" doc:"Stripe transfiere al banco del organizador"`
	DatosEnviados  bool     `json:"datosEnviados"`
	Pendiente      []string `json:"pendiente" doc:"Datos que Stripe pide todavía"`
	Motivo         string   `json:"motivo,omitempty" doc:"Por qué Stripe tiene la cuenta limitada"`
	Comision       float64  `json:"comision" doc:"Comisión de la plataforma (%) sobre cada cobro"`
	ClavesAntiguas bool     `json:"clavesAntiguas" doc:"Tiene claves propias de la integración anterior: se usan hasta que la cuenta conectada pueda cobrar"`
}

func (s *Svc) cuentaConnect(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, cid uuid.UUID) (*cuentaConnect, error) {
	var c cuentaConnect
	err := q.QueryRow(ctx, `SELECT cuenta, estado, cobros, pagos, datos_enviados FROM stripe_connect WHERE competition_id = $1`, cid).
		Scan(&c.Cuenta, &c.Estado, &c.Cobros, &c.Pagos, &c.DatosEnviados)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &c, err
}

// refrescarConnect reads the live state from Stripe and stores it (and announces it) when it changed.
func (s *Svc) refrescarConnect(ctx context.Context, cid uuid.UUID, c *cuentaConnect) (*pagos.ConnectAccount, error) {
	p := pagos.NewPlatform()
	if p == nil {
		return nil, errors.New("Stripe Connect sin configurar")
	}
	a, err := p.RetrieveAccount(ctx, c.Cuenta)
	if err != nil {
		return nil, err
	}
	nuevo := cuentaConnect{Cuenta: c.Cuenta, Estado: a.Estado(), Cobros: a.ChargesEnabled, Pagos: a.PayoutsEnabled, DatosEnviados: a.DetailsSubmitted}
	if nuevo == *c {
		return a, nil
	}
	*c = nuevo
	return a, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE stripe_connect SET estado = $2, cobros = $3, pagos = $4, datos_enviados = $5, updated_at = now() WHERE competition_id = $1`,
			cid, c.Estado, c.Cobros, c.Pagos, c.DatosEnviados); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "competition.integracion_actualizada", map[string]any{"tipo": "stripe", "estado": c.Estado},
			events.Competition(cid.String()), events.ForPermission("integraciones.config")))
	})
}

func (s *Svc) estadoConnect(ctx context.Context, cid uuid.UUID, c *cuentaConnect, a *pagos.ConnectAccount) ConnectEstado {
	out := ConnectEstado{Plataforma: pagos.PlatformKey() != "", Pruebas: !pagos.Live(), Estado: "sin_conectar", Comision: pagos.FeePercent(), Pendiente: []string{}}
	var legacy int
	_ = s.a.DB.QueryRow(ctx, `SELECT coalesce(length(secreto), 0) FROM integraciones WHERE competition_id = $1 AND tipo = 'stripe'`, cid).Scan(&legacy)
	out.ClavesAntiguas = legacy > 0
	if c == nil {
		return out
	}
	out.Estado, out.Cobros, out.Pagos, out.DatosEnviados = c.Estado, c.Cobros, c.Pagos, c.DatosEnviados
	if a != nil {
		out.Pendiente = append(append(out.Pendiente, a.Requirements.PastDue...), a.Requirements.CurrentlyDue...)
		out.Motivo = a.Requirements.DisabledReason
	}
	return out
}

// connectOrigen validates the backoffice origin Stripe sends the organiser back to.
func connectOrigen(o string) (string, bool) {
	o = strings.TrimRight(o, "/")
	return o, o != "" && slices.Contains(config.List("STRIPE_CONNECT_ORIGINS"), o)
}

// stripeConnectError turns a Stripe failure into a message the organiser (or the platform admin) can act on.
func stripeConnectError(err error) error {
	switch e := err.Error(); {
	case strings.Contains(e, "signed up for Connect"):
		return problem.New(http.StatusFailedDependency, "STRIPE_CONNECT_NO_ACTIVADO", "La plataforma todavía no tiene Stripe Connect activado (dashboard.stripe.com/connect).")
	case strings.Contains(e, "platform profile"):
		return problem.New(http.StatusFailedDependency, "STRIPE_CONNECT_PERFIL", "La plataforma aún no ha completado su perfil de Stripe Connect.")
	}
	return problem.New(http.StatusFailedDependency, "STRIPE_NO_DISPONIBLE", "Stripe no ha respondido. Inténtalo de nuevo en unos minutos.")
}

func (s *Svc) registerStripeConnect() {
	type estadoOut struct{ Body ConnectEstado }
	huma.Register(s.a.API, huma.Operation{OperationID: "stripe-connect-estado", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/integraciones/stripe/connect", Summary: "Estado de la cuenta de cobros (Stripe Connect)", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *cidIn) (*estadoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			c, err := s.cuentaConnect(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			var a *pagos.ConnectAccount
			if c != nil {
				if a, err = s.refrescarConnect(ctx, in.CID, c); err != nil {
					s.a.Log.Warn("stripe connect: refrescar", "cid", in.CID, "err", err) // the stored state is shown
				}
			}
			return &estadoOut{Body: s.estadoConnect(ctx, in.CID, c, a)}, nil
		})

	type altaIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Origen string `json:"origen" doc:"Origen del backoffice al que vuelve Stripe"`
		}
	}
	type urlOut struct {
		Body struct {
			URL string `json:"url"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "stripe-connect-alta", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/integraciones/stripe/connect", Summary: "Conectar con Stripe o continuar el alta: crea la cuenta conectada (una vez) y devuelve el enlace del alta de Stripe", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *altaIn) (*urlOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			p := pagos.NewPlatform()
			if p == nil {
				return nil, problem.Unprocessable("STRIPE_SIN_CONFIGURAR", "La plataforma no tiene configurado Stripe Connect.")
			}
			origen, ok := connectOrigen(in.Body.Origen)
			if !ok {
				return nil, problem.Unprocessable("ORIGEN_NO_PERMITIDO", "Este backoffice no está autorizado para conectar Stripe.")
			}
			comp, err := getComp(ctx, s.a.DB, "id", in.CID)
			if err != nil {
				return nil, err
			}
			var cuenta string
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				// One account per competition even with two clicks at once: serialise on the competition.
				if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('stripe-connect:' || $1::text))`, in.CID); err != nil {
					return err
				}
				c, err := s.cuentaConnect(ctx, tx, in.CID)
				if err != nil || c != nil {
					if c != nil {
						cuenta = c.Cuenta
					}
					return err
				}
				a, err := p.CreateAccount(ctx, comp.Evento.EmailContacto, comp.Nombre, map[string]string{"competicion": in.CID.String(), "slug": comp.Slug})
				if err != nil {
					s.a.Log.Warn("stripe connect: crear cuenta", "cid", in.CID, "err", err)
					return stripeConnectError(err)
				}
				cuenta = a.ID
				if _, err := tx.Exec(ctx, `INSERT INTO stripe_connect (competition_id, cuenta, estado, cobros, pagos, datos_enviados) VALUES ($1,$2,$3,$4,$5,$6)`,
					in.CID, a.ID, a.Estado(), a.ChargesEnabled, a.PayoutsEnabled, a.DetailsSubmitted); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.integracion_actualizada", map[string]any{"tipo": "stripe", "estado": a.Estado()},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config")))
			})
			if err != nil {
				return nil, err
			}
			volver := origen + "/" + comp.Slug + "/sistema/integraciones?stripe="
			link, err := p.AccountLink(ctx, cuenta, volver+"refrescar", volver+"volver")
			if err != nil {
				s.a.Log.Warn("stripe connect: enlace de alta", "cid", in.CID, "err", err)
				return nil, stripeConnectError(err)
			}
			o := &urlOut{}
			o.Body.URL = link
			return o, nil
		})

	huma.Register(s.a.API, huma.Operation{OperationID: "stripe-connect-panel", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/integraciones/stripe/connect/panel", Summary: "Enlace de un solo uso al panel de Stripe de la cuenta conectada (cobros, transferencias, IBAN)", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *cidIn) (*urlOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			c, err := s.cuentaConnect(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			p := pagos.NewPlatform()
			if c == nil || !c.DatosEnviados || p == nil {
				return nil, problem.Conflict("ALTA_PENDIENTE", "Completa primero el alta en Stripe.")
			}
			link, err := p.LoginLink(ctx, c.Cuenta)
			if err != nil {
				s.a.Log.Warn("stripe connect: panel", "cid", in.CID, "err", err)
				return nil, stripeConnectError(err)
			}
			o := &urlOut{}
			o.Body.URL = link
			return o, nil
		})

	// Internal: the connected account athletes and donaciones charge on (pagos.DeCompeticion).
	type intOut struct {
		Body struct {
			Cuenta string `json:"cuenta"`
			Cobros bool   `json:"cobros"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-stripe-connect", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/integraciones/stripe/connect", Summary: "Cuenta conectada de Stripe de la competición (solo servicios)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidIn) (*intOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			c, err := s.cuentaConnect(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			o := &intOut{}
			if c != nil {
				o.Body.Cuenta, o.Body.Cobros = c.Cuenta, c.Cobros
			}
			return o, nil
		})

	// Connect webhook (account.updated of the connected accounts): signed with STRIPE_CONNECT_WEBHOOK_SECRET; the
	// state is re-read from Stripe, so a replayed or reordered event cannot set a wrong state.
	s.a.Mux.HandleFunc("POST "+connectWebhook, func(w http.ResponseWriter, r *http.Request) {
		p := pagos.NewPlatform()
		if p == nil || p.WebhookSecret == "" {
			http.Error(w, "webhook no configurado", http.StatusServiceUnavailable)
			return
		}
		payload, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, "cuerpo no válido", http.StatusBadRequest)
			return
		}
		ev, err := p.VerifyWebhook(payload, r.Header)
		if err != nil {
			http.Error(w, "firma no válida", http.StatusBadRequest)
			return
		}
		if ev.Type != "account.updated" {
			w.WriteHeader(http.StatusOK)
			return
		}
		cuenta := ev.Account
		if cuenta == "" {
			cuenta = ev.SessionID // data.object.id: the account itself
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		var cid uuid.UUID
		if err := s.a.DB.QueryRow(ctx, `SELECT competition_id FROM stripe_connect WHERE cuenta = $1`, cuenta).Scan(&cid); err != nil {
			w.WriteHeader(http.StatusOK) // not one of ours (the platform account is shared)
			return
		}
		code := http.StatusOK
		if c, err := s.cuentaConnect(ctx, s.a.DB, cid); err == nil && c != nil {
			if _, err := s.refrescarConnect(ctx, cid, c); err != nil {
				s.a.Log.Warn("stripe connect: account.updated", "cid", cid, "err", err)
				code = http.StatusInternalServerError // Stripe retries
			}
		}
		events.Webhook(ctx, s.a.Redis, s.a.Stream(), cid.String(), "stripe", ev.Type, ev.ID, code)
		w.WriteHeader(code)
	})
}
