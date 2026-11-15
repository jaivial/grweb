package pagos

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/jaivial/grweb/platform/pkg/config"
)

// Stripe Connect: one platform Stripe account (GR Cup) and one connected account per competition, created by the
// platform and onboarded on Stripe's hosted pages (identity + IBAN), so organisers never handle keys or webhooks.
// Checkouts are direct charges on the connected account and the platform keeps STRIPE_PLATFORM_FEE_PERCENT.
//
// Env (never in the repo):
//   STRIPE_CONNECT_SANDBOX_KEY     platform key outside production (sk_test_/rk_test_ only: QA never charges)
//   STRIPE_CONNECT_PRODUCTION_KEY  platform key with SERVICE_ENV=prod (sk_live_/rk_live_ only)
//   STRIPE_CONNECT_WEBHOOK_SECRET  whsec_ of the Connect webhook endpoints (comma-separated)
//   STRIPE_PLATFORM_FEE_PERCENT    platform commission, 0–30 (default 0)

// Live is true in production: real charges with the live platform key.
func Live() bool { return config.Str("SERVICE_ENV", "dev") == "prod" }

// PlatformKey returns the Connect platform key, or "" when Connect is not configured or the key's mode does not match
// the environment (a live key outside production, or a test key in production).
func PlatformKey() string {
	name, mode := "STRIPE_CONNECT_SANDBOX_KEY", "_test_"
	if Live() {
		name, mode = "STRIPE_CONNECT_PRODUCTION_KEY", "_live_"
	}
	k := strings.TrimSpace(config.Str(name, ""))
	if !strings.HasPrefix(k, "sk"+mode) && !strings.HasPrefix(k, "rk"+mode) {
		return ""
	}
	return k
}

// FeePercent is the platform commission (STRIPE_PLATFORM_FEE_PERCENT, clamped to 0–30).
func FeePercent() float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(config.Str("STRIPE_PLATFORM_FEE_PERCENT", "0")), 64)
	if err != nil || math.IsNaN(f) || f < 0 {
		return 0
	}
	return math.Min(f, 30)
}

// NewPlatform returns the platform client (no connected account), or nil when Connect is not configured.
func NewPlatform() *Stripe {
	k := PlatformKey()
	if k == "" {
		return nil
	}
	s := NewStripe(k, config.Str("STRIPE_CONNECT_WEBHOOK_SECRET", ""))
	s.FeePercent = FeePercent()
	return s
}

// NewConnect returns the gateway that charges on a competition's connected account, or nil without Connect.
func NewConnect(account string) *Stripe {
	s := NewPlatform()
	if s == nil || account == "" {
		return nil
	}
	s.Account = account
	return s
}

// applicationFee is what the platform keeps from a charge (only on connected accounts; never the whole amount).
func (s *Stripe) applicationFee(amount int) int {
	if s.Account == "" || s.FeePercent <= 0 {
		return 0
	}
	fee := int(math.Round(float64(amount) * s.FeePercent / 100))
	return max(0, min(fee, amount-1))
}

// ConnectAccount is the subset of a connected account the platform needs.
type ConnectAccount struct {
	ID               string `json:"id"`
	ChargesEnabled   bool   `json:"charges_enabled"`
	PayoutsEnabled   bool   `json:"payouts_enabled"`
	DetailsSubmitted bool   `json:"details_submitted"`
	Requirements     struct {
		CurrentlyDue        []string `json:"currently_due"`
		PastDue             []string `json:"past_due"`
		PendingVerification []string `json:"pending_verification"`
		DisabledReason      string   `json:"disabled_reason"`
	} `json:"requirements"`
}

// Estado summarises the onboarding: pendiente (not finished) · verificando (submitted, Stripe is checking) ·
// restringida (Stripe needs more data) · activa (charges and payouts enabled).
func (a *ConnectAccount) Estado() string {
	switch {
	case a.ChargesEnabled && a.PayoutsEnabled:
		return "activa"
	case a.DetailsSubmitted && len(a.Requirements.CurrentlyDue) == 0 && len(a.Requirements.PastDue) == 0:
		return "verificando"
	case a.DetailsSubmitted:
		return "restringida"
	}
	return "pendiente"
}

// managedRiskAPIVersion: Accounts v2 with Express dashboard and Stripe as fees and losses collector (Managed
// Risk), the model Stripe requires for new platforms; charges are then direct charges on the account.
const managedRiskAPIVersion = "2026-08-26.preview"

// CreateAccount creates a connected account (Accounts v2, Managed Risk). v1 endpoints (account links, login
// links, retrieve) keep working with its id.
func (s *Stripe) CreateAccount(ctx context.Context, email, nombre string, metadata map[string]string) (*ConnectAccount, error) {
	body := map[string]any{
		"dashboard": "express",
		"identity":  map[string]any{"country": "es"},
		"defaults": map[string]any{
			"currency":         "eur",
			"responsibilities": map[string]any{"fees_collector": "stripe", "losses_collector": "stripe"},
		},
		"configuration": map[string]any{"merchant": map[string]any{
			"mcc":          "7941", // sports clubs, athletic fields and sports promoters
			"capabilities": map[string]any{"card_payments": map[string]any{"requested": true}},
		}},
		"metadata": metadata,
	}
	if email != "" {
		body["contact_email"] = email
	}
	if nombre != "" {
		body["display_name"] = nombre
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.Base+"/v2/core/accounts", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(s.Key, "")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Stripe-Version", managedRiskAPIVersion)
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stripe: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("stripe %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var created struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(b, &created) != nil || created.ID == "" {
		return nil, fmt.Errorf("stripe: la cuenta creada no trae id")
	}
	return s.RetrieveAccount(ctx, created.ID)
}

// RetrieveAccount reads a connected account's onboarding state.
func (s *Stripe) RetrieveAccount(ctx context.Context, id string) (*ConnectAccount, error) {
	var out ConnectAccount
	return &out, s.do(ctx, http.MethodGet, "/v1/accounts/"+url.PathEscape(id), nil, "", &out)
}

// AccountLink returns a single-use URL of Stripe's hosted onboarding.
func (s *Stripe) AccountLink(ctx context.Context, id, refreshURL, returnURL string) (string, error) {
	f := url.Values{"account": {id}, "type": {"account_onboarding"}, "refresh_url": {refreshURL}, "return_url": {returnURL}}
	f.Set("collection_options[fields]", "eventually_due")
	var out struct {
		URL string `json:"url"`
	}
	return out.URL, s.post(ctx, "/v1/account_links", f, "", &out)
}

// LoginLink returns a one-time link to the connected account's Express dashboard (payouts, IBAN).
func (s *Stripe) LoginLink(ctx context.Context, id string) (string, error) {
	var out struct {
		URL string `json:"url"`
	}
	return out.URL, s.post(ctx, "/v1/accounts/"+url.PathEscape(id)+"/login_links", url.Values{}, "", &out)
}
