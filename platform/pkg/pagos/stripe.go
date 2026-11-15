package pagos

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Stripe is the real gateway (Checkout Sessions + refunds + signed webhooks) over the REST API. With Account set it
// works as a Stripe Connect platform: every request runs on that connected account (direct charges, the organiser
// is the merchant of record) and checkouts keep FeePercent as application fee.
type Stripe struct {
	Key           string // sk_test_… / sk_live_… (Connect: the platform key)
	WebhookSecret string // whsec_… (several comma-separated: any one verifying is enough)
	HTTP          *http.Client
	Base          string
	Account       string  // acct_… of the competition (Connect); empty = the key's own account
	FeePercent    float64 // Connect: platform commission on each charge
}

// NewStripe returns a Stripe client.
func NewStripe(key, webhookSecret string) *Stripe {
	return &Stripe{Key: key, WebhookSecret: webhookSecret, HTTP: &http.Client{Timeout: 20 * time.Second}, Base: "https://api.stripe.com"}
}

func (s *Stripe) Name() string { return "stripe" }

// Test reports whether the key is a test-mode key.
func (s *Stripe) Test() bool {
	return strings.HasPrefix(s.Key, "sk_test_") || strings.HasPrefix(s.Key, "rk_test_")
}

func (s *Stripe) post(ctx context.Context, path string, form url.Values, idem string, out any) error {
	return s.do(ctx, http.MethodPost, path, form, idem, out)
}

func (s *Stripe) do(ctx context.Context, method, path string, form url.Values, idem string, out any) error {
	var reqBody io.Reader
	if form != nil {
		reqBody = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, s.Base+path, reqBody)
	if err != nil {
		return err
	}
	req.SetBasicAuth(s.Key, "")
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if idem != "" {
		req.Header.Set("Idempotency-Key", idem)
	}
	if s.Account != "" {
		req.Header.Set("Stripe-Account", s.Account)
	}
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("stripe: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		return fmt.Errorf("stripe %d: %s", resp.StatusCode, e.Error.Message)
	}
	return json.Unmarshal(body, out)
}

func (s *Stripe) CreateCheckout(ctx context.Context, in CheckoutIn) (CheckoutOut, error) {
	f := url.Values{}
	f.Set("mode", "payment")
	f.Set("success_url", in.SuccessURL)
	f.Set("cancel_url", in.CancelURL)
	if in.Email != "" {
		f.Set("customer_email", in.Email)
	}
	if !in.ExpiresAt.IsZero() {
		f.Set("expires_at", strconv.FormatInt(in.ExpiresAt.Unix(), 10))
	}
	f.Set("line_items[0][quantity]", "1")
	f.Set("line_items[0][price_data][currency]", "eur")
	f.Set("line_items[0][price_data][unit_amount]", strconv.Itoa(in.Amount))
	f.Set("line_items[0][price_data][product_data][name]", in.Description)
	if fee := s.applicationFee(in.Amount); fee > 0 {
		f.Set("payment_intent_data[application_fee_amount]", strconv.Itoa(fee))
	}
	for k, v := range in.Metadata {
		f.Set("metadata["+k+"]", v)
		f.Set("payment_intent_data[metadata]["+k+"]", v)
	}
	var out struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := s.post(ctx, "/v1/checkout/sessions", f, in.Metadata["idempotencia"], &out); err != nil {
		return CheckoutOut{}, err
	}
	return CheckoutOut{ID: out.ID, URL: out.URL}, nil
}

func (s *Stripe) Refund(ctx context.Context, paymentID string, amount int, reason string) (string, error) {
	return s.RefundConClave(ctx, paymentID, amount, reason, "")
}

// RefundConClave refunds with an idempotency key (Stripe's «Idempotency-Key»): the same key always returns the
// same refund, so a retry after a crash never returns the money twice.
func (s *Stripe) RefundConClave(ctx context.Context, paymentID string, amount int, reason, clave string) (string, error) {
	f := url.Values{}
	f.Set("payment_intent", paymentID)
	f.Set("amount", strconv.Itoa(amount))
	f.Set("metadata[motivo]", reason)
	if s.Account != "" {
		f.Set("refund_application_fee", "true") // the platform gives back its commission on what is refunded
	}
	var out struct {
		ID string `json:"id"`
	}
	err := s.post(ctx, "/v1/refunds", f, clave, &out)
	return out.ID, err
}

// stripeEvent is the subset of a Stripe event (and of the simulated one) we read.
type stripeEvent struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Account string `json:"account"` // Connect: the connected account the event happened on
	Created int64  `json:"created"`
	Data    struct {
		Object struct {
			ID            string            `json:"id"`
			PaymentIntent string            `json:"payment_intent"`
			PaymentStatus string            `json:"payment_status"`
			AmountTotal   int               `json:"amount_total"`
			Metadata      map[string]string `json:"metadata"`
			Card          string            `json:"x_card,omitempty"`
		} `json:"object"`
	} `json:"data"`
}

func parseEvent(payload []byte) (Event, error) {
	var e stripeEvent
	if err := json.Unmarshal(payload, &e); err != nil {
		return Event{}, fmt.Errorf("evento no válido: %w", err)
	}
	o := e.Data.Object
	return Event{ID: e.ID, Type: e.Type, Account: e.Account, SessionID: o.ID, PaymentID: o.PaymentIntent, Paid: o.PaymentStatus == "paid", Amount: o.AmountTotal,
		Card: o.Card, Metadata: o.Metadata, CreatedAt: time.Unix(e.Created, 0)}, nil
}

func (s *Stripe) VerifyWebhook(payload []byte, h http.Header) (Event, error) {
	err := ErrSignature
	for _, sec := range strings.Split(s.WebhookSecret, ",") {
		if sec = strings.TrimSpace(sec); sec != "" {
			if err = verify(sec, payload, h.Get("Stripe-Signature"), time.Now()); err == nil {
				break
			}
		}
	}
	if err != nil {
		return Event{}, err
	}
	ev, err := parseEvent(payload)
	if err == nil && s.Account != "" && ev.Account != s.Account {
		return Event{}, fmt.Errorf("%w (otra cuenta conectada)", ErrSignature)
	}
	return ev, err
}
