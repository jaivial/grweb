// Package pagos is the payment gateway used by the services that charge (inscriptions, raffle): Stripe Checkout
// (test or live keys from the competition's «stripe» integration) or a simulated gateway with the same interface,
// the same webhook format and signature (Stripe-Signature: t=…,v1=HMAC-SHA256) and test cards, used while there
// are no Stripe keys. Amounts are in euro cents.
package pagos

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// CheckoutIn describes a one-off payment.
type CheckoutIn struct {
	Amount      int    // cents
	Description string // shown on the payment page
	Email       string // pre-filled
	SuccessURL  string // {CHECKOUT_SESSION_ID} is replaced by the session id
	CancelURL   string
	Metadata    map[string]string // echoed back in the webhook
	ExpiresAt   time.Time         // Stripe: 30 min to 24 h
	Lines       []Line            // optional breakdown (fee, discounts) shown by the simulated gateway; Stripe shows its own summary
}

// Line is one row of the breakdown on the payment page («Cupón GR25», −875).
type Line struct {
	Label  string `json:"concepto"`
	Amount int    `json:"importe"`
}

// CheckoutOut is the created session.
type CheckoutOut struct {
	ID  string
	URL string
}

// Event is a verified webhook event.
type Event struct {
	ID        string // unique (idempotency)
	Type      string // checkout.session.completed · checkout.session.expired · checkout.session.async_payment_failed
	SessionID string
	PaymentID string // payment intent (needed for refunds)
	Paid      bool
	Amount    int
	Card      string // «Visa ···· 4242» when known
	Metadata  map[string]string
	CreatedAt time.Time
}

// Provider is a payment gateway.
type Provider interface {
	Name() string // "stripe" | "simulado"
	CreateCheckout(ctx context.Context, in CheckoutIn) (CheckoutOut, error)
	Refund(ctx context.Context, paymentID string, amount int, reason string) (string, error)
	VerifyWebhook(payload []byte, h http.Header) (Event, error)
}

// ErrSignature means the webhook signature is missing, wrong or too old.
var ErrSignature = errors.New("firma del webhook no válida")

const tolerance = 5 * time.Minute

// Sign returns a Stripe-Signature header value for payload.
func Sign(secret string, payload []byte, t time.Time) string {
	ts := strconv.FormatInt(t.Unix(), 10)
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(ts + "." + string(payload)))
	return "t=" + ts + ",v1=" + hex.EncodeToString(m.Sum(nil))
}

// verify checks a Stripe-Signature header (any v1 signature may match; timestamp within 5 minutes).
func verify(secret string, payload []byte, header string, now time.Time) error {
	if secret == "" || header == "" {
		return ErrSignature
	}
	var ts string
	var sigs []string
	for _, part := range strings.Split(header, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(part), "=")
		switch k {
		case "t":
			ts = v
		case "v1":
			sigs = append(sigs, v)
		}
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || len(sigs) == 0 {
		return ErrSignature
	}
	if d := now.Sub(time.Unix(sec, 0)); d > tolerance || d < -tolerance {
		return fmt.Errorf("%w (fuera de tiempo)", ErrSignature)
	}
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(ts + "." + string(payload)))
	want := hex.EncodeToString(m.Sum(nil))
	for _, s := range sigs {
		if hmac.Equal([]byte(s), []byte(want)) {
			return nil
		}
	}
	return ErrSignature
}

// Euros formats cents as «26,25 €».
func Euros(cents int) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	s := fmt.Sprintf("%d,%02d €", cents/100, cents%100)
	if neg {
		return "−" + s
	}
	return s
}
