// Package messaging sends the transactional emails of the platform (Figma page 62 · «Emails y avisos»): it consumes
// the `*.email_solicitado` events of the other services, renders the competition's templates, keeps an outbox with
// retries and a circuit breaker per SMTP server, and lets the organiser edit templates and switch automations.
// WhatsApp (Meta templates) arrives with campaigns in step 12.
package messaging

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
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

const logoURL = "https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png"

// Svc holds the service dependencies.
type Svc struct {
	a      *app.App
	comp   *svcclient.Client
	comps  *compref.Resolver
	webURL string
	smtpMu sync.Mutex
	smtp   map[uuid.UUID]smtpEntry
}

type smtpEntry struct {
	cfg smtpCfg
	exp time.Time
}

// Service returns the messaging service definition.
func Service() app.Service {
	s := &Svc{smtp: map[uuid.UUID]smtpEntry{}}
	return app.Service{Name: "messaging", Title: "GR Cup · messaging", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "messaging", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
	// History is never re-sent: a new consumer group starts at the end of the stream.
	c := &events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: "messaging", Start: "$",
		Types: []string{"identity.email_", "athletes.email_", "cms.email_", "crm.email_"}, Handle: s.handle, Log: a.Log}
	a.Go(c.Run)
	a.Go(s.worker)
	s.registerAdmin()
	return nil
}

// handle queues an email request (idempotent by event id). Unknown templates fail at once; malformed addresses are
// skipped and reported to crm as invalid.
func (s *Svc) handle(ctx context.Context, e events.Event) error {
	if !strings.HasSuffix(e.Type, ".email_solicitado") {
		return nil
	}
	var d struct {
		Para      string            `json:"para"`
		Plantilla string            `json:"plantilla"`
		Vars      map[string]string `json:"vars"`
	}
	if err := json.Unmarshal(e.Data, &d); err != nil {
		return nil // poison message: nothing to send
	}
	cid := uuid.Nil
	if e.CompetitionID != "" {
		if id, err := uuid.Parse(e.CompetitionID); err == nil {
			cid = id
		}
	}
	estado, detalle := "en_cola", ""
	if _, ok := porClave[d.Plantilla]; !ok {
		estado, detalle = "fallido", "Plantilla desconocida: "+d.Plantilla
	}
	para := strings.ToLower(strings.TrimSpace(d.Para))
	if a, err := mail.ParseAddress(para); err != nil || a.Address != para {
		estado, detalle = "omitido", "Email no válido"
	}
	if d.Vars == nil {
		d.Vars = map[string]string{}
	}
	return s.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO mensajes (id, competition_id, evento_id, plantilla, destino, vars, estado, detalle) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (evento_id) DO NOTHING`,
			uuid.Must(uuid.NewV7()), cid, e.ID, d.Plantilla, para, d.Vars, estado, detalle)
		if err != nil || tag.RowsAffected() == 0 || detalle != "Email no válido" || cid == uuid.Nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "messaging.rebote", map[string]any{"para": para, "tipo": "email_invalido", "motivo": "Dirección mal formada"},
			events.Competition(cid.String()), events.Audience(events.Internal)))
	})
}

func (s *Svc) tx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---- templates: default (code) + competition override ----

type plantillaEfectiva struct {
	Plantilla
	Personalizada bool
	Version       int
	Estado        string
	Error         string
	UpdatedPor    string
	UpdatedAt     *time.Time
}

func (s *Svc) plantilla(ctx context.Context, cid uuid.UUID, clave string) (plantillaEfectiva, error) {
	base, ok := porClave[clave]
	if !ok {
		return plantillaEfectiva{}, problem.NotFound("Esa plantilla no existe.")
	}
	p := plantillaEfectiva{Plantilla: base, Version: 0, Estado: "activa"}
	var c Contenido
	var ver int
	var por string
	var at time.Time
	err := s.a.DB.QueryRow(ctx, `SELECT asunto, preheader, titulo, cuerpo, boton_texto, boton_url, pie, version, updated_por, updated_at FROM plantillas WHERE competition_id = $1 AND clave = $2`, cid, clave).
		Scan(&c.Asunto, &c.Preheader, &c.Titulo, &c.Cuerpo, &c.BotonTexto, &c.BotonURL, &c.Pie, &ver, &por, &at)
	if err == nil {
		p.Contenido, p.Personalizada, p.Version, p.UpdatedPor, p.UpdatedAt = c, true, ver, por, &at
	} else if !db.IsNoRows(err) {
		return p, err
	}
	err = s.a.DB.QueryRow(ctx, `SELECT estado, error FROM plantilla_estado WHERE competition_id = $1 AND clave = $2`, cid, clave).Scan(&p.Estado, &p.Error)
	if err != nil && !db.IsNoRows(err) {
		return p, err
	}
	return p, nil
}

func (s *Svc) marca(ctx context.Context, cid uuid.UUID) Marca {
	m := Marca{Nombre: "GR Strength Cup", Web: s.webURL, Logo: logoURL}
	if cid != uuid.Nil {
		if c, err := s.comps.ByID(ctx, cid); err == nil && c.Nombre != "" {
			m.Nombre = c.Nombre
		}
	}
	return m
}

// enEvento: today (competition time zone) is a competition day.
func (s *Svc) enEvento(ctx context.Context, cid uuid.UUID) (bool, time.Time) {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil || c.FechaInicio == "" {
		return false, time.Time{}
	}
	loc, err := time.LoadLocation(c.ZonaHoraria)
	if err != nil {
		loc = time.UTC
	}
	fin := c.FechaFin
	if fin == "" {
		fin = c.FechaInicio
	}
	hoy := time.Now().In(loc).Format("2006-01-02")
	if hoy < c.FechaInicio || hoy > fin {
		return false, time.Time{}
	}
	f, _ := time.ParseInLocation("2006-01-02 15:04", fin+" 09:00", loc)
	return true, f.AddDate(0, 0, 1) // deferred messages go out the morning after
}

func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}

var errNoEncontrado = problem.NotFound("Ese mensaje no existe.")
