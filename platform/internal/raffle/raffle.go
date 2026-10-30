// Package raffle runs the charity raffle of a competition (Figma pages 07 · /sorteo, 15 · /politica-concurso and
// 60 · BO · Sorteo): a legal checklist that gates the sale, tickets paid online (Stripe from the competition's
// integration, or the simulated gateway in QA) and numbered in order, refunds, and a draw anyone can verify.
package raffle

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
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
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
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
	tokKey []byte
	webURL string
}

// Service returns the raffle service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "raffle", Title: "GR Cup · raffle", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup, "etl-mysql": s.etlMySQL}}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "raffle", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	m := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	m.Write([]byte("grcup/raffle/compra/v1"))
	s.tokKey = m.Sum(nil)
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.initPagos()
	s.registerPublic()
	s.registerAdmin()
	s.registerSorteos()
	s.registerRGPD()
	a.Go(s.caducar)
	return nil
}

// ---- payments (same provider rules as registrations) ----

type provEntry struct {
	p   pagos.Provider
	exp time.Time
}

var provCache sync.Map

// proveedor: Stripe with the competition's keys, else the simulated gateway where enabled (PAGOS_SIMULADOS, never in
// production), else nil.
func (s *Svc) proveedor(ctx context.Context, cid uuid.UUID) pagos.Provider {
	if e, ok := provCache.Load(cid); ok && time.Now().Before(e.(provEntry).exp) {
		return e.(provEntry).p
	}
	var p pagos.Provider
	if s.sim != nil {
		p = s.sim
	}
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
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
	s.sim = &pagos.Simulado{Redis: s.a.Redis, Prefix: s.a.Keys.Of("pagos", "sim", "raffle", ""), Secret: hex.EncodeToString(m.Sum(nil)), Service: "raffle", WebURL: s.webURL}
	s.sim.Deliver = func(ctx context.Context, payload []byte, sig string) error {
		return s.webhook(ctx, payload, http.Header{"Stripe-Signature": []string{sig}})
	}
	s.sim.Mount(s.a.Mux, "/api/pagos/simulado/raffle")
}

func provName(p pagos.Provider) string {
	if p == nil {
		return "ninguna"
	}
	return p.Name()
}

// ---- tokens, ids, helpers ----

// tokenCompra is the key of the purchase status page (derived from the id: the same link in every email).
func (s *Svc) tokenCompra(id uuid.UUID) string {
	m := hmac.New(sha256.New, s.tokKey)
	m.Write([]byte(id.String()))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:18])
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func sha(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}

// numero is how a ticket is shown: «0427».
func numero(n int) string {
	s := itoa(n)
	for len(s) < 4 {
		s = "0" + s
	}
	return s
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// nombrePublico: «Laura G.» (first name and initial: enough for the audience, not a full identity).
func nombrePublico(n string) string {
	f := strings.Fields(n)
	if len(f) == 0 {
		return "—"
	}
	if len(f) == 1 {
		return f[0]
	}
	r := []rune(f[1])
	return f[0] + " " + strings.ToUpper(string(r[0])) + "."
}

func (s *Svc) bump(ctx context.Context, cid uuid.UUID) {
	_ = s.a.Redis.Incr(ctx, s.a.Keys.Of("raffle", "ver", cid.String())).Err()
}

func (s *Svc) version(ctx context.Context, cid uuid.UUID) string {
	v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("raffle", "ver", cid.String())).Result()
	if err != nil {
		return "0"
	}
	return v
}

func email(ctx context.Context, tx pgx.Tx, cid uuid.UUID, para, plantilla string, vars map[string]string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "raffle.email_solicitado", map[string]any{"para": para, "plantilla": plantilla, "vars": vars},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}

func contacto(ctx context.Context, tx pgx.Tx, cid uuid.UUID, data map[string]any) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "raffle.contacto", data, events.Competition(cid.String()), events.Audience(events.Internal)))
}

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

func fechaHora(t time.Time) string {
	return t.In(madrid).Format("02/01 15:04")
}
