package events

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
)

// WebhookRecibido is the type of the fact «a provider called one of our webhooks» (Sistema › Salud, Figma 64).
const WebhookRecibido = "webhook.recibido"

// Webhook publishes, best effort, that a provider webhook was received and how it was answered. audit keeps the
// list (one row per provider event, counting retries). Never carries the payload (it may hold personal data).
func Webhook(ctx context.Context, rdb *redis.Client, stream, cid, proveedor, tipo, eventoID string, respuesta int) {
	if rdb == nil || cid == "" {
		return
	}
	e := New(context.WithoutCancel(ctx), WebhookRecibido, map[string]any{"proveedor": proveedor, "tipo": tipo, "eventoId": eventoID, "respuesta": respuesta},
		Competition(cid), Audience(Internal))
	_ = Publish(context.WithoutCancel(ctx), rdb, stream, e)
}

// PeekPago reads id, type and the competition of a payment webhook payload (Stripe format, also used by the
// simulated gateway) without verifying it: only to report it.
func PeekPago(payload []byte) (id, tipo, cid string) {
	var p struct {
		ID   string `json:"id"`
		Type string `json:"type"`
		Data struct {
			Object struct {
				Metadata map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	_ = json.Unmarshal(payload, &p)
	return p.ID, p.Type, p.Data.Object.Metadata["competicion"]
}
