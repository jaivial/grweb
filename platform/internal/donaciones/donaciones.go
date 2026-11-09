// Package donaciones runs the donations announced in the live chat (Figma page 70 · /en-directo): fans pay with
// Stripe (or the simulated gateway in QA), the payment webhook confirms them, the chat and the ranking show them
// as GRS coins (only announced, never spendable) and the backoffice lists and refunds them.
package donaciones

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/cache"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func mustMigrations() fs.FS {
	m, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		panic(err)
	}
	return m
}

var bearer = []map[string][]string{{"bearer": {}}}

// Svc holds the service dependencies.
type Svc struct {
	a      *app.App
	comp   *svcclient.Client
	comps  *compref.Resolver
	sim    *pagos.Simulado
	fans   *fanauth.Verifier
	cache  *cache.Cache
	webURL string
}

// Service returns the donaciones service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "donaciones", Title: "GR Cup · donaciones", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "donaciones", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	s.fans = &fanauth.Verifier{Key: fanauth.Key(a.Cfg.InternalToken), Redis: a.Redis, Keys: a.Keys}
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "donaciones", "")}
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.initPagos()
	s.registerPublic()
	s.registerAdmin()
	a.Go(s.caducar)
	return nil
}

// ---- payments (same provider rules as raffle) ----

type provEntry struct {
	p   pagos.Provider
	exp time.Time
}

var provCache sync.Map

// proveedor: Stripe with the competition's keys, else the simulated gateway where enabled (PAGOS_SIMULADOS, never
// in production), else nil.
func (s *Svc) proveedor(ctx context.Context, cid uuid.UUID) pagos.Provider {
	if e, ok := provCache.Load(cid); ok && time.Now().Before(e.(provEntry).exp) {
		return e.(provEntry).p
	}
	var p pagos.Provider
	if s.sim != nil {
		p = s.sim
	}
	var out struct {
		Secreto string `json:"secreto"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/stripe", nil, &out); err == nil && out.Secreto != "" {
		var sec struct {
			Clave   string `json:"clave"`
			Webhook string `json:"webhook"`
		}
		if json.Unmarshal([]byte(out.Secreto), &sec) == nil && sec.Clave != "" && sec.Webhook != "" {
			p = pagos.NewStripe(sec.Clave, sec.Webhook)
		}
	}
	provCache.Store(cid, provEntry{p: p, exp: time.Now().Add(time.Minute)})
	return p
}

func (s *Svc) initPagos() {
	if !config.Bool("PAGOS_SIMULADOS", s.a.Cfg.Env == "dev") {
		return
	}
	m := hmac.New(sha256.New, []byte(s.a.Cfg.InternalToken))
	m.Write([]byte("grcup/pagos/simulado/v1"))
	s.sim = &pagos.Simulado{Redis: s.a.Redis, Prefix: s.a.Keys.Of("pagos", "sim", "donaciones", ""), Secret: hex.EncodeToString(m.Sum(nil)), Service: "donaciones", WebURL: s.webURL}
	s.sim.Deliver = func(ctx context.Context, payload []byte, sig string) error {
		return s.webhook(ctx, payload, http.Header{"Stripe-Signature": []string{sig}})
	}
	s.sim.Mount(s.a.Mux, "/api/pagos/simulado/donaciones")
}

// ---- time, ids, helpers ----

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// hoyMadrid is the día of a moment in Europe/Madrid (donations, like the ranking, are per jornada).
func hoyMadrid(now time.Time) time.Time {
	f := now.In(madrid).Format("2006-01-02")
	t, _ := time.ParseInLocation("2006-01-02", f, time.UTC)
	return t
}

func diaTexto(t time.Time) string { return t.Format("2006-01-02") }

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}

// sesionDe reads the fan session: cookie first (browsers), header second (load test).
func sesionDe(cookie, hdr string) string {
	if cookie != "" {
		return cookie
	}
	return hdr
}

// fan verifies the fan session of a competition (the token carries its competition).
func (s *Svc) fan(ctx context.Context, sess, hdr string, cid uuid.UUID) (fanauth.Fan, error) {
	f, err := s.fans.Verify(ctx, sesionDe(sess, hdr))
	if err != nil {
		return fanauth.Fan{}, fanauth.Problem(err)
	}
	if f.CompetitionID != cid {
		return fanauth.Fan{}, fanauth.Problem(fanauth.ErrInvalid)
	}
	return f, nil
}

// rankingKey is the Redis cache key of the ranking of a día (5 s).
func (s *Svc) rankingKey(cid uuid.UUID, dia string) string {
	return "ranking:" + cid.String() + ":" + dia
}

func (s *Svc) invalidarRanking(ctx context.Context, cid uuid.UUID, dia string) {
	s.cache.Del(ctx, s.rankingKey(cid, dia))
}

// caducar marks abandoned checkouts (the expiration webhook may be lost): 30 min of checkout plus a margin.
func (s *Svc) caducar(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		_, _ = s.a.DB.Exec(ctx, `UPDATE donaciones SET estado = 'caducada', motivo = 'Checkout sin pagar' WHERE estado = 'pendiente' AND created_at < now() - interval '40 minutes'`)
	}
}

// confirmarPago marks a donation as paid and enqueues the events that chat and juegos-worker consume (the fanId
// is an opaque UUID). Idempotent by webhook event and by state. Returns the día touched (to invalidate the
// ranking cache).
func (s *Svc) confirmarPago(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, ev pagos.Event) (string, error) {
	var estado, alias, mensaje string
	var anonimo bool
	var importe, coins int
	var fanID uuid.UUID
	var dia time.Time
	err := tx.QueryRow(ctx, `SELECT estado, alias, anonimo, importe, coins, mensaje, fan_id, dia FROM donaciones WHERE id = $1 AND competition_id = $2 FOR UPDATE`, id, cid).
		Scan(&estado, &alias, &anonimo, &importe, &coins, &mensaje, &fanID, &dia)
	if err != nil {
		return "", err
	}
	if estado != "pendiente" {
		return "", nil
	}
	if _, err := tx.Exec(ctx, `UPDATE donaciones SET estado = 'pagada', payment_id = $2, pagada_at = now() WHERE id = $1`, id, ev.PaymentID); err != nil {
		return "", err
	}
	nombre := alias
	if anonimo {
		nombre = "Anónimo"
	}
	d := diaTexto(dia)
	// donacion.confirmada es interno: lleva el fanId (juegos-worker acredita la recompensa de fantasy con él) y
	// realtime nunca lo reenvía al SSE público, que solo reparte eventos «public» (PR review I1).
	err = events.Enqueue(ctx, tx, events.New(ctx, "donacion.confirmada", map[string]any{
		"donacionId": id.String(), "fanId": fanID.String(), "alias": nombre, "importe": importe, "coins": coins, "mensaje": mensaje, "dia": d,
	}, events.Competition(cid.String()), events.Audience(events.Internal), events.Subject("donacion:"+id.String())))
	if err != nil {
		return "", err
	}
	// donacion.anunciada es su gemelo público: lo que se anuncia en el directo (alias, importe, coins, mensaje y
	// día), sin identificadores del fan.
	err = events.Enqueue(ctx, tx, events.New(ctx, "donacion.anunciada", map[string]any{
		"alias": nombre, "importe": importe, "coins": coins, "mensaje": mensaje, "dia": d,
	}, events.Competition(cid.String()), events.Audience(events.Public)))
	return d, err
}

// webhook verifies the payment event (Stripe or simulated, same format) and applies it once (webhook_eventos).
func (s *Svc) webhook(ctx context.Context, payload []byte, h http.Header) error {
	var peek struct {
		Data struct {
			Object struct {
				Metadata map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if json.Unmarshal(payload, &peek) != nil {
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
	id, err := uuid.Parse(ev.Metadata["donacion"])
	if err != nil {
		return nil // not ours
	}
	dia := ""
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO webhook_eventos (id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING`, ev.ID, ev.Type)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		switch {
		case ev.Type == "checkout.session.completed" && ev.Paid:
			dia, err = s.confirmarPago(ctx, tx, cid, id, ev)
			return err
		case ev.Type == "checkout.session.expired":
			_, err := tx.Exec(ctx, `UPDATE donaciones SET estado = 'caducada' WHERE id = $1 AND competition_id = $2 AND estado = 'pendiente'`, id, cid)
			return err
		case ev.Type == "checkout.session.async_payment_failed":
			_, err := tx.Exec(ctx, `UPDATE donaciones SET estado = 'caducada', motivo = 'Pago fallido' WHERE id = $1 AND competition_id = $2 AND estado = 'pendiente'`, id, cid)
			return err
		}
		return nil
	})
	if err == nil && dia != "" {
		s.invalidarRanking(ctx, cid, dia)
	}
	return err
}
