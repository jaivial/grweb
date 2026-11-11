// Package athletes owns the athletes of every competition (Figma page 55 · «Atletas»): the list imported from the
// AEP, records and public profiles, weigh-in, reserve promotion, email alerts («Avísame cuando compita») and the
// athlete area with magic links (Figma pages 39, 40, 42 and 26).
package athletes

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io/fs"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/bodylimit"
	"github.com/jaivial/grweb/platform/pkg/cache"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/pagos"
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

// maxImport is the request limit of an AEP list upload (5 MB file + multipart overhead); photos go up to 8 MB.
const (
	maxImport = bodylimit.Import
	maxFoto   = bodylimit.Foto
)

// Svc holds the service dependencies.
type Svc struct {
	a            *app.App
	comp         *svcclient.Client
	cms          *svcclient.Client
	identity     *svcclient.Client
	comps        *compref.Resolver
	cache        *cache.Cache
	qrKey        []byte
	webURL       string
	boURL        string
	cookieSecure bool
	sim          *pagos.Simulado
	// fans verifies the public account session (atleta or público) required to register.
	fans *fanauth.Verifier
	// Public «alta de atleta»: keys of the antibot challenge, of the time token and of the
	// signed URLs of the private photos (all derived from the internal secret).
	altchaKey string
	tiempoKey []byte
	firmaKey  []byte
	// Volume of the service where the private files of the requests are kept.
	fotoDir string
	// altaCfg caches the stable part of the public config of the alta (2 s, singleflight).
	altaCfg configMemo
}

// Service returns the athletes service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{
		Name: "athletes", Title: "GR Cup · athletes", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		BodyLimitFor: bodylimit.For("athletes"),

		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup, "enlace-area": s.cmdEnlaceArea, "etl-mysql": s.etlMySQL},
		// The user agent of the request (the proof of the consents of the public form), the rewrite of
		// the history of an athlete (see «reescribeHistorial») and the size of the public form.
		// The rate limit of the alta goes first: a 429 never reads (nor spools) the body.
		Middlewares: []httpx.Middleware{conUserAgent, s.limitaIPAlta, reescribeHistorial, limitaFotoAlta},
	}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "athletes", "competition", a.Cfg.InternalToken)
	s.cms = svcclient.New(config.Str("UPSTREAM_CMS", "http://cms:8080"), "athletes", "cms", a.Cfg.InternalToken)
	s.identity = svcclient.New(config.Str("UPSTREAM_IDENTITY", "http://identity:8080"), "athletes", "identity", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "athletes", "")}
	s.fans = &fanauth.Verifier{Key: fanauth.Key(a.Cfg.InternalToken), Redis: a.Redis, Keys: a.Keys}
	// The accreditation QR is signed with a key derived from the internal secret (never leaves the service).
	m := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	m.Write([]byte("grcup/athletes/qr/v1"))
	s.qrKey = m.Sum(nil)
	// Keys of the public form: the antibot challenge, the time token and the signed photo URLs.
	ma := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	ma.Write([]byte("grcup/athletes/altcha/v1"))
	s.altchaKey = hex.EncodeToString(ma.Sum(nil))
	mt := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	mt.Write([]byte("grcup/athletes/tiempo/v1"))
	s.tiempoKey = mt.Sum(nil)
	mf := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	mf.Write([]byte("grcup/athletes/foto/v1"))
	s.firmaKey = mf.Sum(nil)
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
	s.boURL = strings.TrimRight(config.Str("BACKOFFICE_URL", "http://localhost:4201"), "/")
	s.fotoDir = config.Str("ATLETAS_DIR", "/data/atletas")
	s.cookieSecure = config.Bool("COOKIE_SECURE", a.Cfg.Env != "dev")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerAdmin()
	s.registerImport()
	s.registerPublic()
	s.registerArea()
	s.registerInternal()
	s.registerOpenLifter()
	s.initPagos()
	s.registerInscripcion()
	s.registerInscripcionAdmin()
	s.registerAltaAtleta()
	s.registerAltaAtletaAdmin()
	s.registerAltaCupos()
	a.Go(s.expirador)
	a.Go(s.avisosSalida)
	a.Go(s.purgaSolicitudes)
	return nil
}

// requireAny passes with any of perms (reading the list is open to every role that works with athletes).
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
	return nil, problem.Forbidden("Tu rol no tiene acceso a los atletas de esta competición.")
}

var readPerms = []string{"atletas.editar", "checkin.escanear", "horarios.publicar", "directo.operar", "resultados.publicar"}

func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		if p.Service != "" {
			return "Sistema"
		}
		return p.Email
	}
	return "Sistema"
}

// ---- public cache (keyed by a per-competition content version) ----

func (s *Svc) version(ctx context.Context, cid uuid.UUID) string {
	v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("athletes", "ver", cid.String())).Result()
	if err != nil {
		return "0"
	}
	return v
}

func (s *Svc) bump(ctx context.Context, cid uuid.UUID) {
	_ = s.a.Redis.Incr(ctx, s.a.Keys.Of("athletes", "ver", cid.String())).Err()
}

func cached[T any](ctx context.Context, s *Svc, cid uuid.UUID, key string, build func() (T, error)) (T, error) {
	full := cid.String() + ":" + s.version(ctx, cid) + ":" + key
	var v T
	if s.cache.Get(ctx, full, &v) {
		return v, nil
	}
	v, err := build()
	if err == nil {
		s.cache.Set(ctx, full, v, 5*time.Minute)
	}
	return v, err
}

// change runs a mutation with its admin event in one transaction and bumps the public content version.
func (s *Svc) change(ctx context.Context, cid uuid.UUID, ev string, data any, fn func(tx pgx.Tx) error) error {
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err := fn(tx); err != nil {
			return err
		}
		if ev == "" {
			return nil
		}
		return events.Enqueue(ctx, tx, events.New(ctx, ev, data, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
	if err == nil {
		s.bump(ctx, cid)
	}
	return err
}

// email asks messaging to send a transactional email (outbox → messaging consumer).
func email(ctx context.Context, tx pgx.Tx, cid uuid.UUID, para, plantilla string, vars map[string]string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "athletes.email_solicitado", map[string]any{"para": para, "plantilla": plantilla, "vars": vars},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}

// contacto tells crm about a person (internal event: personal data never reaches the public or admin streams).
func contacto(ctx context.Context, tx pgx.Tx, cid uuid.UUID, data map[string]any) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "athletes.contacto", data, events.Competition(cid.String()), events.Audience(events.Internal)))
}

func hist(ctx context.Context, tx pgx.Tx, atleta uuid.UUID, accion, detalle string) error {
	return histPor(ctx, tx, atleta, actor(ctx), accion, detalle)
}

func histPor(ctx context.Context, tx pgx.Tx, atleta uuid.UUID, por, accion, detalle string) error {
	_, err := tx.Exec(ctx, `INSERT INTO historial (id, atleta_id, actor, accion, detalle) VALUES ($1,$2,$3,$4,$5)`, newID(), atleta, por, accion, detalle)
	return err
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func randomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }

// qr is the accreditation code of an athlete: A:<competition>:<athlete>:<hmac> (checked at the weigh-in).
func (s *Svc) qr(cid, id uuid.UUID) string {
	m := hmac.New(sha256.New, s.qrKey)
	m.Write([]byte(cid.String() + ":" + id.String()))
	return "A:" + cid.String() + ":" + id.String() + ":" + base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:12])
}

// validQR checks an accreditation code and returns the athlete id.
func (s *Svc) validQR(cid uuid.UUID, code string) (uuid.UUID, bool) {
	parts := strings.Split(code, ":")
	if len(parts) != 4 || parts[0] != "A" || parts[1] != cid.String() {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(parts[2])
	if err != nil {
		return uuid.Nil, false
	}
	return id, hmac.Equal([]byte(s.qr(cid, id)), []byte(code))
}

func asProblem(err error, p **problem.Error) bool { return errors.As(err, p) }
