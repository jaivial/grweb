package pagos

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

// DeCompeticion picks the gateway of a competition (asking the competition service):
//  1. its Stripe Connect account, once Stripe lets it take charges;
//  2. else its own Stripe keys of the old «stripe» integration (legacy: competitions configured before Connect);
//  3. else sim (the simulated gateway where enabled, or nil: no payments possible).
func DeCompeticion(ctx context.Context, comp *svcclient.Client, cid string, sim Provider) Provider {
	var cc struct {
		Cuenta string `json:"cuenta"`
		Cobros bool   `json:"cobros"`
	}
	if err := comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid+"/integraciones/stripe/connect", nil, &cc); err == nil && cc.Cobros {
		if p := NewConnect(cc.Cuenta); p != nil {
			return p
		}
	}
	var out struct {
		Secreto string `json:"secreto"`
	}
	if err := comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid+"/integraciones/stripe", nil, &out); err == nil && out.Secreto != "" {
		// The legacy secret holds the API key and the webhook signing secret: {"clave":"sk_…","webhook":"whsec_…"}.
		var sec struct {
			Clave   string `json:"clave"`
			Webhook string `json:"webhook"`
		}
		if json.Unmarshal([]byte(out.Secreto), &sec) == nil && sec.Clave != "" && sec.Webhook != "" {
			return NewStripe(sec.Clave, sec.Webhook)
		}
	}
	return sim
}
