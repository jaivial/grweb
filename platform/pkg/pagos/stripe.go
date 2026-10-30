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

// Stripe is the real gateway (Checkout Sessions + refunds + signed webhooks) over the REST API.
type Stripe struct {
	Key           string // sk_test_… / sk_live_…
	WebhookSecret string // whsec_…
	HTTP          *http.Client
	Base          string
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
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.Base+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(s.Key, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if idem != "" {
		req.Header.Set("Idempotency-Key", idem)
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
	f := url.Values{}
	f.Set("payment_intent", paymentID)
	f.Set("amount", strconv.Itoa(amount))
	f.Set("metadata[motivo]", reason)
	var out struct {
		ID string `json:"id"`
	}
	err := s.post(ctx, "/v1/refunds", f, "", &out)
	return out.ID, err
}

// stripeEvent is the subset of a Stripe event (and of the simulated one) we read.
type stripeEvent struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
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
	return Event{ID: e.ID, Type: e.Type, SessionID: o.ID, PaymentID: o.PaymentIntent, Paid: o.PaymentStatus == "paid", Amount: o.AmountTotal,
		Card: o.Card, Metadata: o.Metadata, CreatedAt: time.Unix(e.Created, 0)}, nil
}

func (s *Stripe) VerifyWebhook(payload []byte, h http.Header) (Event, error) {
	if err := verify(s.WebhookSecret, payload, h.Get("Stripe-Signature"), time.Now()); err != nil {
		return Event{}, err
	}
	return parseEvent(payload)
}
