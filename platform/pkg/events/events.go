// Package events implements the domain event model, the transactional outbox and the Redis Streams
// relay/consumers (compatible with Redis 6.0: pending entries are reclaimed with XPENDING + XCLAIM).
package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/httpx"
)

// Audiences of an event.
const (
	Public   = "public"   // anyone following the competition (SSE público): never personal data
	Admin    = "admin"    // backoffice users holding Permission (SSE admin)
	Internal = "internal" // only other services (e.g. email requests)
)

// Actor is who caused the change.
type Actor struct {
	UserID  string `json:"userId,omitempty"`
	Name    string `json:"name,omitempty"`
	Origin  string `json:"origin,omitempty"` // web | cli | mcp | token:<name>
	Service string `json:"service,omitempty"`
}

// Event is the envelope published on grcup:<env>:events.
type Event struct {
	ID            uuid.UUID       `json:"id"`
	Type          string          `json:"type"`
	Source        string          `json:"source"`
	CompetitionID string          `json:"competitionId,omitempty"`
	Subject       string          `json:"subject,omitempty"`
	Audience      string          `json:"audience"`
	Permission    string          `json:"permission,omitempty"`
	Actor         *Actor          `json:"actor,omitempty"`
	Data          json.RawMessage `json:"data,omitempty"`
	Diff          json.RawMessage `json:"diff,omitempty"`
	RequestID     string          `json:"requestId,omitempty"`
	OccurredAt    time.Time       `json:"occurredAt"`
}

// Option customises a new event.
type Option func(*Event)

func Competition(id string) Option  { return func(e *Event) { e.CompetitionID = id } }
func Subject(s string) Option       { return func(e *Event) { e.Subject = s } }
func Audience(a string) Option      { return func(e *Event) { e.Audience = a } }
func ForPermission(p string) Option { return func(e *Event) { e.Audience, e.Permission = Admin, p } }
func WithDiff(diff any) Option {
	return func(e *Event) { e.Diff, _ = json.Marshal(diff) }
}

// source is the publishing service, set once at startup by app.
var source = "unknown"

// SetSource names the publishing service.
func SetSource(s string) { source = s }

// New builds an event, taking actor, origin and request id from the request context.
func New(ctx context.Context, typ string, data any, opts ...Option) Event {
	e := Event{ID: uuid.Must(uuid.NewV7()), Type: typ, Source: source, Audience: Admin, OccurredAt: time.Now().UTC(), RequestID: httpx.RequestIDFrom(ctx)}
	if data != nil {
		e.Data, _ = json.Marshal(data)
	}
	if p, ok := auth.FromContext(ctx); ok {
		a := &Actor{Name: p.Name, Origin: p.Origin, Service: p.Service}
		if p.UserID != uuid.Nil {
			a.UserID = p.UserID.String()
		}
		if a.Origin == "" {
			a.Origin = httpx.OriginFrom(ctx)
		}
		e.Actor = a
	}
	for _, o := range opts {
		o(&e)
	}
	return e
}

// Enqueue writes events to the outbox inside the caller's transaction.
func Enqueue(ctx context.Context, tx pgx.Tx, evs ...Event) error {
	for _, e := range evs {
		payload, err := json.Marshal(e)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO outbox (id, type, payload) VALUES ($1, $2, $3)`, e.ID, e.Type, payload); err != nil {
			return fmt.Errorf("outbox: %w", err)
		}
	}
	return nil
}

// Relay publishes pending outbox rows to the stream. Several replicas can run it: rows are claimed with SKIP LOCKED.
type Relay struct {
	DB     *pgxpool.Pool
	Redis  *redis.Client
	Stream string
	MaxLen int64
	Log    *slog.Logger
}

// Run loops until ctx is cancelled.
func (r *Relay) Run(ctx context.Context) {
	if r.MaxLen == 0 {
		r.MaxLen = 200_000
	}
	lastCleanup := time.Time{}
	for ctx.Err() == nil {
		n, err := r.publishBatch(ctx)
		if err != nil && ctx.Err() == nil {
			r.Log.Warn("outbox relay", "err", err)
			sleep(ctx, 2*time.Second)
			continue
		}
		if time.Since(lastCleanup) > time.Hour {
			_, _ = r.DB.Exec(ctx, `DELETE FROM outbox WHERE published_at < now() - interval '7 days'`)
			lastCleanup = time.Now()
		}
		if n == 0 {
			sleep(ctx, 250*time.Millisecond)
		}
	}
}

func (r *Relay) publishBatch(ctx context.Context) (int, error) {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	rows, err := tx.Query(ctx, `SELECT id, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return 0, err
	}
	type row struct {
		id      uuid.UUID
		payload []byte
	}
	var batch []row
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.id, &x.payload); err != nil {
			rows.Close()
			return 0, err
		}
		batch = append(batch, x)
	}
	rows.Close()
	if len(batch) == 0 {
		return 0, tx.Commit(ctx)
	}
	pipe := r.Redis.Pipeline()
	for _, x := range batch {
		pipe.XAdd(ctx, &redis.XAddArgs{Stream: r.Stream, MaxLen: r.MaxLen, Approx: true, Values: map[string]any{"e": x.payload}})
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, fmt.Errorf("xadd: %w", err)
	}
	ids := make([]uuid.UUID, len(batch))
	for i, x := range batch {
		ids[i] = x.id
	}
	if _, err := tx.Exec(ctx, `UPDATE outbox SET published_at = now() WHERE id = ANY($1)`, ids); err != nil {
		return 0, err
	}
	return len(batch), tx.Commit(ctx)
}

// Handler processes one event. Returning an error leaves it pending for a retry.
type Handler func(ctx context.Context, e Event) error

// Consumer reads the stream in a consumer group (one group per consuming service and purpose).
type Consumer struct {
	Redis  *redis.Client
	DB     *pgxpool.Pool // optional: enables exactly-once handling via processed_events
	Stream string
	Group  string
	Types  []string // optional prefix filter (e.g. "entrada.", "identity.email")
	Start  string   // where a NEW group starts: "$" (default, only new events) or "0" (whole retained history, e.g. audit)
	Handle Handler
	Log    *slog.Logger
}

// Run consumes until ctx is cancelled. A new group starts at c.Start ("$" by default).
func (c *Consumer) Run(ctx context.Context) {
	name, _ := os.Hostname()
	if c.Start == "" {
		c.Start = "$"
	}
	if err := c.Redis.XGroupCreateMkStream(ctx, c.Stream, c.Group, c.Start).Err(); err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		c.Log.Error("xgroup create", "group", c.Group, "err", err)
	}
	lastReclaim, lastClean := time.Now(), time.Time{}
	for ctx.Err() == nil {
		if time.Since(lastReclaim) > 30*time.Second {
			c.reclaim(ctx, name)
			lastReclaim = time.Now()
		}
		if time.Since(lastClean) > 10*time.Minute {
			c.limpiar(ctx, name)
			lastClean = time.Now()
		}
		res, err := c.Redis.XReadGroup(ctx, &redis.XReadGroupArgs{Group: c.Group, Consumer: name, Streams: []string{c.Stream, ">"}, Count: 50, Block: 5 * time.Second}).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) || ctx.Err() != nil {
				continue
			}
			if strings.Contains(err.Error(), "NOGROUP") {
				_ = c.Redis.XGroupCreateMkStream(ctx, c.Stream, c.Group, c.Start).Err()
				continue
			}
			c.Log.Warn("xreadgroup", "group", c.Group, "err", err)
			sleep(ctx, 2*time.Second)
			continue
		}
		for _, s := range res {
			for _, m := range s.Messages {
				c.process(ctx, m)
			}
		}
	}
}

func (c *Consumer) process(ctx context.Context, m redis.XMessage) {
	raw, _ := m.Values["e"].(string)
	var e Event
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		c.Log.Error("evento ilegible", "id", m.ID, "err", err)
		_ = c.Redis.XAck(ctx, c.Stream, c.Group, m.ID).Err()
		return
	}
	if !c.wants(e.Type) {
		_ = c.Redis.XAck(ctx, c.Stream, c.Group, m.ID).Err()
		return
	}
	if c.DB != nil {
		var seen bool
		if err := c.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM processed_events WHERE consumer = $1 AND event_id = $2)`, c.Group, e.ID).Scan(&seen); err == nil && seen {
			_ = c.Redis.XAck(ctx, c.Stream, c.Group, m.ID).Err()
			return
		}
	}
	if err := c.Handle(ctx, e); err != nil {
		c.Log.Warn("evento no procesado (se reintentará)", "group", c.Group, "type", e.Type, "id", e.ID, "err", err)
		return
	}
	if c.DB != nil {
		_, _ = c.DB.Exec(ctx, `INSERT INTO processed_events (consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, c.Group, e.ID)
	}
	_ = c.Redis.XAck(ctx, c.Stream, c.Group, m.ID).Err()
}

func (c *Consumer) wants(t string) bool {
	if len(c.Types) == 0 {
		return true
	}
	for _, p := range c.Types {
		if strings.HasPrefix(t, p) {
			return true
		}
	}
	return false
}

// reclaim takes over messages idle for > 60 s (crashed pods) — Redis 6.0 has no XAUTOCLAIM.
func (c *Consumer) reclaim(ctx context.Context, name string) {
	pend, err := c.Redis.XPendingExt(ctx, &redis.XPendingExtArgs{Stream: c.Stream, Group: c.Group, Start: "-", End: "+", Count: 100, Idle: 60 * time.Second}).Result()
	if err != nil || len(pend) == 0 {
		return
	}
	ids := make([]string, 0, len(pend))
	for _, p := range pend {
		if p.RetryCount > 20 {
			c.Log.Error("evento descartado tras 20 intentos", "group", c.Group, "id", p.ID)
			_ = c.Redis.XAck(ctx, c.Stream, c.Group, p.ID).Err()
			continue
		}
		ids = append(ids, p.ID)
	}
	if len(ids) == 0 {
		return
	}
	msgs, err := c.Redis.XClaim(ctx, &redis.XClaimArgs{Stream: c.Stream, Group: c.Group, Consumer: name, MinIdle: 60 * time.Second, Messages: ids}).Result()
	if err != nil {
		return
	}
	for _, m := range msgs {
		c.process(ctx, m)
	}
}

// limpiar removes the consumers of pods that are gone (idle for more than an hour and nothing pending: their
// messages were already reclaimed), so the group does not grow with every deploy.
func (c *Consumer) limpiar(ctx context.Context, name string) {
	cs, err := c.Redis.XInfoConsumers(ctx, c.Stream, c.Group).Result()
	if err != nil {
		return
	}
	for _, x := range cs {
		if x.Name != name && x.Pending == 0 && x.Idle > time.Hour {
			_ = c.Redis.XGroupDelConsumer(ctx, c.Stream, c.Group, x.Name).Err()
		}
	}
}

func sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}

// Publish adds one event straight to the stream, for services without a database (no outbox). Delivery is
// at-most-once: use it only for facts that may be lost (e.g. the audit line of an AI request).
func Publish(ctx context.Context, rdb *redis.Client, stream string, e Event) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return rdb.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]any{"e": string(b)}}).Err()
}
