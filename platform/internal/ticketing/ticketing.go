// Package ticketing owns the free tickets of a competition (Figma pages 37, 38, 58 and 59): sessions with capacity,
// public reservation with consents, the ticket page with a magic link («Mi entrada»), the waiting list with offers,
// door check-in with an offline queue and the box-office summary.
package ticketing

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"io/fs"
	"math/big"
	"strings"
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
	"github.com/jaivial/grweb/platform/pkg/problem"
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
	cms    *svcclient.Client
	comps  *compref.Resolver
	cache  *cache.Cache
	qrKey  []byte
	webURL string
}

// Service returns the ticketing service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "ticketing", Title: "GR Cup · ticketing", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup}}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "ticketing", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	s.cms = svcclient.New(config.Str("UPSTREAM_CMS", "http://cms:8080"), "ticketing", "cms", a.Cfg.InternalToken)
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "ticketing", "")}
	m := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	m.Write([]byte("grcup/ticketing/qr/v1"))
	s.qrKey = m.Sum(nil)
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerPublic()
	s.registerMiEntrada()
	s.registerAdmin()
	s.registerCheckin()
	s.registerRGPD()
	a.Go(s.worker)
	return nil
}

// ---- codes, QR and tokens ----

const alfabeto = "23456789ABCDEFGHJKMNPQRSTUVWXYZ" // no 0/O, 1/I/L

// nuevoCodigo: «GRC-7K3P» (read aloud at the door, typed in the search).
func nuevoCodigo() string {
	b := make([]byte, 4)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alfabeto))))
		b[i] = alfabeto[n.Int64()]
	}
	return "GRC-" + string(b)
}

// firma signs a ticket code for its QR (verified by the server; offline stations match the code in their list).
func (s *Svc) firma(cid uuid.UUID, codigo string) string {
	m := hmac.New(sha256.New, s.qrKey)
	m.Write([]byte(cid.String() + ":" + codigo))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:9])
}

// qr is the content of the ticket QR: «E:GRC-7K3P:<firma>».
func (s *Svc) qr(cid uuid.UUID, codigo string) string {
	return "E:" + codigo + ":" + s.firma(cid, codigo)
}

// leerQR returns the code of a valid QR (false for anything else: another event, tampered, a bare code).
func (s *Svc) leerQR(cid uuid.UUID, v string) (string, bool) {
	p := strings.Split(strings.TrimSpace(v), ":")
	if len(p) != 3 || p[0] != "E" {
		return "", false
	}
	return p[1], hmac.Equal([]byte(s.firma(cid, p[1])), []byte(p[2]))
}

func (s *Svc) qrURL(slug string, cid uuid.UUID, codigo string) string {
	return s.webURL + "/api/competiciones/" + slug + "/entradas/" + codigo + "/qr.png?s=" + s.firma(cid, codigo)
}

func randomToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }

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

func requireAny(ctx context.Context, cid uuid.UUID, perms ...string) (*auth.Principal, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return nil, err
	}
	for _, k := range perms {
		if p.Can(cid.String(), k) {
			return p, nil
		}
	}
	return nil, problem.Forbidden("Tu rol no tiene acceso a las entradas de esta competición.")
}

// ---- public cache version and events ----

func (s *Svc) version(ctx context.Context, cid uuid.UUID) string {
	v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("ticketing", "ver", cid.String())).Result()
	if err != nil {
		return "0"
	}
	return v
}

func (s *Svc) bump(ctx context.Context, cid uuid.UUID) {
	_ = s.a.Redis.Incr(ctx, s.a.Keys.Of("ticketing", "ver", cid.String())).Err()
}

// email asks messaging to send a template (outbox → messaging consumer).
func email(ctx context.Context, tx pgx.Tx, cid uuid.UUID, para, plantilla string, vars map[string]string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "ticketing.email_solicitado", map[string]any{"para": para, "plantilla": plantilla, "vars": vars},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}

// contacto tells crm about a person (internal event).
func contacto(ctx context.Context, tx pgx.Tx, cid uuid.UUID, data map[string]any) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "ticketing.contacto", data, events.Competition(cid.String()), events.Audience(events.Internal)))
}

// aforoEvento announces the use of a session (public: no personal data) and refreshes the public cache.
func (s *Svc) aforoEvento(ctx context.Context, tx pgx.Tx, cid, sesion uuid.UUID) error {
	var usado, total int
	if err := tx.QueryRow(ctx, `SELECT aforo, (SELECT COALESCE(sum(personas), 0) FROM entradas WHERE sesion_id = $1 AND estado <> 'anulada')::int FROM sesiones WHERE id = $1`, sesion).Scan(&total, &usado); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "aforo.actualizado", map[string]any{"sesionId": sesion, "usado": usado, "total": total},
		events.Competition(cid.String()), events.Audience(events.Public)))
}

// ---- formatting ----

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

var diasSemana = [...]string{"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"}
var meses = [...]string{"", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"}

func diaTxt(t time.Time) string {
	t = t.In(madrid)
	return diasSemana[t.Weekday()] + " " + t.Format("2") + " " + meses[t.Month()]
}

func hm(t time.Time) string { return t.In(madrid).Format("15:04") }

func dbTx(ctx context.Context, s *Svc, fn func(tx pgx.Tx) error) error { return db.Tx(ctx, s.a.DB, fn) }
