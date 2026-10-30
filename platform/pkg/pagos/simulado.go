package pagos

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Simulado is a gateway that behaves like Stripe Checkout without charging anything: hosted payment page (in the
// public web, /pago/simulado), test cards, signed webhook in Stripe's format and refunds. Sessions live in Redis.
type Simulado struct {
	Redis   *redis.Client
	Prefix  string // e.g. grcup:qa:pagos:sim:athletes:
	Secret  string // webhook signing secret
	Service string // path segment of the service (athletes, raffle…)
	WebURL  string // public web base (hosted page)
	// Deliver posts the signed webhook to the service (in-process: same verification path as Stripe's).
	Deliver func(ctx context.Context, payload []byte, signature string) error
}

func (s *Simulado) Name() string { return "simulado" }

type simSession struct {
	ID          string            `json:"id"`
	Amount      int               `json:"amount"`
	Description string            `json:"description"`
	Email       string            `json:"email"`
	SuccessURL  string            `json:"successUrl"`
	CancelURL   string            `json:"cancelUrl"`
	Metadata    map[string]string `json:"metadata"`
	Status      string            `json:"status"` // open · paid
	PaymentID   string            `json:"paymentId,omitempty"`
	Card        string            `json:"card,omitempty"`
	Refunded    int               `json:"refunded"`
	ExpiresAt   time.Time         `json:"expiresAt"`
}

func rnd(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

func (s *Simulado) key(id string) string  { return s.Prefix + "cs:" + id }
func (s *Simulado) pkey(id string) string { return s.Prefix + "pi:" + id }

func (s *Simulado) load(ctx context.Context, id string) (simSession, error) {
	var ss simSession
	b, err := s.Redis.Get(ctx, s.key(id)).Bytes()
	if err != nil {
		return ss, err
	}
	err = json.Unmarshal(b, &ss)
	return ss, err
}

func (s *Simulado) save(ctx context.Context, ss simSession) error {
	b, _ := json.Marshal(ss)
	ttl := time.Until(ss.ExpiresAt) + 30*24*time.Hour // kept for refunds after the payment
	return s.Redis.Set(ctx, s.key(ss.ID), b, ttl).Err()
}

func (s *Simulado) CreateCheckout(ctx context.Context, in CheckoutIn) (CheckoutOut, error) {
	exp := in.ExpiresAt
	if exp.IsZero() {
		exp = time.Now().Add(30 * time.Minute)
	}
	ss := simSession{ID: "sim_cs_" + rnd(10), Amount: in.Amount, Description: in.Description, Email: in.Email, SuccessURL: in.SuccessURL,
		CancelURL: in.CancelURL, Metadata: in.Metadata, Status: "open", ExpiresAt: exp}
	if err := s.save(ctx, ss); err != nil {
		return CheckoutOut{}, err
	}
	return CheckoutOut{ID: ss.ID, URL: strings.TrimRight(s.WebURL, "/") + "/pago/simulado?s=" + s.Service + ":" + ss.ID}, nil
}

func (s *Simulado) Refund(ctx context.Context, paymentID string, amount int, _ string) (string, error) {
	sid, err := s.Redis.Get(ctx, s.pkey(paymentID)).Result()
	if err != nil {
		return "", errors.New("pago simulado no encontrado")
	}
	ss, err := s.load(ctx, sid)
	if err != nil {
		return "", err
	}
	if amount <= 0 || ss.Refunded+amount > ss.Amount {
		return "", errors.New("el reembolso supera lo pagado")
	}
	ss.Refunded += amount
	if err := s.save(ctx, ss); err != nil {
		return "", err
	}
	return "sim_re_" + rnd(8), nil
}

func (s *Simulado) VerifyWebhook(payload []byte, h http.Header) (Event, error) {
	if err := verify(s.Secret, payload, h.Get("Stripe-Signature"), time.Now()); err != nil {
		return Event{}, err
	}
	return parseEvent(payload)
}

// Mount registers the hosted-page API: GET {base}/{id} and POST {base}/{id}/pagar.
func (s *Simulado) Mount(mux *http.ServeMux, base string) {
	write := func(w http.ResponseWriter, code int, v any) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(v)
	}
	mux.HandleFunc("GET "+base+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		ss, err := s.load(r.Context(), r.PathValue("id"))
		if err != nil {
			write(w, http.StatusNotFound, map[string]string{"code": "SESION_NO_ENCONTRADA", "detail": "Este pago no existe o ha caducado."})
			return
		}
		estado := ss.Status
		if estado == "open" && time.Now().After(ss.ExpiresAt) {
			estado = "caducada"
		}
		write(w, http.StatusOK, map[string]any{"id": ss.ID, "descripcion": ss.Description, "importe": ss.Amount, "email": ss.Email, "estado": estado,
			"cancelUrl": ss.CancelURL, "pruebas": true, "tarjetas": [][2]string{{"4242 4242 4242 4242", "pago correcto"}, {"4000 0000 0000 0002", "tarjeta rechazada"}, {"4000 0000 0000 3220", "pide 3D Secure"}}})
	})
	mux.HandleFunc("POST "+base+"/{id}/pagar", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Tarjeta string `json:"tarjeta"`
			Email   string `json:"email"`
			TresDS  string `json:"tresDS"` // "" · "ok" · "fallo"
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
			write(w, http.StatusBadRequest, map[string]string{"code": "PETICION_INVALIDA", "detail": "Datos de pago no válidos."})
			return
		}
		ctx := r.Context()
		ss, err := s.load(ctx, r.PathValue("id"))
		if err != nil {
			write(w, http.StatusNotFound, map[string]string{"code": "SESION_NO_ENCONTRADA", "detail": "Este pago no existe o ha caducado."})
			return
		}
		if ss.Status == "paid" {
			write(w, http.StatusOK, map[string]string{"estado": "pagado", "redirect": strings.ReplaceAll(ss.SuccessURL, "{CHECKOUT_SESSION_ID}", ss.ID)})
			return
		}
		if time.Now().After(ss.ExpiresAt) {
			write(w, http.StatusGone, map[string]string{"code": "SESION_CADUCADA", "detail": "El tiempo para pagar ha terminado. Vuelve a empezar la inscripción."})
			return
		}
		card := strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, in.Tarjeta)
		switch {
		case card == "4000000000000002":
			write(w, http.StatusOK, map[string]string{"estado": "rechazada", "mensaje": "Tu tarjeta ha sido rechazada. Prueba con otra."})
			return
		case card == "4000000000003220" && in.TresDS == "":
			write(w, http.StatusOK, map[string]string{"estado": "3ds", "mensaje": "Tu banco pide confirmar el pago (3D Secure)."})
			return
		case card == "4000000000003220" && in.TresDS != "ok":
			write(w, http.StatusOK, map[string]string{"estado": "rechazada", "mensaje": "No se pudo autenticar el pago con tu banco."})
			return
		case card != "4242424242424242" && card != "4000000000003220":
			write(w, http.StatusOK, map[string]string{"estado": "invalida", "mensaje": "Modo pruebas: usa una de las tarjetas de prueba."})
			return
		}
		ss.Status, ss.PaymentID, ss.Card = "paid", "sim_pi_"+rnd(10), "Visa ···· "+card[len(card)-4:]
		if err := s.save(ctx, ss); err != nil {
			write(w, http.StatusServiceUnavailable, map[string]string{"code": "SERVICIO_NO_DISPONIBLE", "detail": "No se pudo completar el pago. Inténtalo de nuevo."})
			return
		}
		_ = s.Redis.Set(ctx, s.pkey(ss.PaymentID), ss.ID, time.Until(ss.ExpiresAt)+30*24*time.Hour).Err()
		ev := stripeEvent{ID: "sim_evt_" + rnd(10), Type: "checkout.session.completed", Created: time.Now().Unix()}
		ev.Data.Object.ID, ev.Data.Object.PaymentIntent, ev.Data.Object.PaymentStatus = ss.ID, ss.PaymentID, "paid"
		ev.Data.Object.AmountTotal, ev.Data.Object.Metadata, ev.Data.Object.Card = ss.Amount, ss.Metadata, ss.Card
		payload, _ := json.Marshal(ev)
		// Like Stripe, the webhook is delivered after the payment; a failed delivery is retried by the next visit
		// to the success page (the service can also re-check the session).
		if s.Deliver != nil {
			if err := s.Deliver(context.WithoutCancel(ctx), payload, Sign(s.Secret, payload, time.Now())); err != nil {
				_ = s.Redis.Set(ctx, s.Prefix+"pendiente:"+ss.ID, payload, 24*time.Hour).Err()
			}
		}
		write(w, http.StatusOK, map[string]string{"estado": "pagado", "redirect": strings.ReplaceAll(ss.SuccessURL, "{CHECKOUT_SESSION_ID}", ss.ID)})
	})
}

// Redeliver retries a webhook whose in-process delivery failed (called when the success page polls).
func (s *Simulado) Redeliver(ctx context.Context, sessionID string) {
	b, err := s.Redis.Get(ctx, s.Prefix+"pendiente:"+sessionID).Bytes()
	if err != nil || s.Deliver == nil {
		return
	}
	if s.Deliver(ctx, b, Sign(s.Secret, b, time.Now())) == nil {
		_ = s.Redis.Del(ctx, s.Prefix+"pendiente:"+sessionID).Err()
	}
}
