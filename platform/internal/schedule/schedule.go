// Package schedule owns the competition schedule (Figma page 56 · «Horarios y flights» and public page 41 ·
// /horarios): a draft planned in the backoffice (flights generated from the confirmed athletes, moved by drag and
// drop, weigh-in windows, agenda of the day), conflict checks, versioned publication with a diff and email notices,
// the public schedule with the live state of each flight and «Mi horario» as an .ics calendar.
package schedule

import (
	"context"
	"embed"
	"io/fs"
	"net/http"
	"strconv"
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
	a        *app.App
	comp     *svcclient.Client
	athletes *svcclient.Client
	comps    *compref.Resolver
	cache    *cache.Cache
	webURL   string
}

// Service returns the schedule service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{
		Name: "schedule", Title: "GR Cup · schedule", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup},
	}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "schedule", "competition", a.Cfg.InternalToken)
	s.athletes = svcclient.New(config.Str("UPSTREAM_ATHLETES", "http://athletes:8080"), "schedule", "athletes", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	s.cache = &cache.Cache{R: a.Redis, Prefix: a.Keys.Of("cache", "schedule", "")}
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerAdmin()
	s.registerPublicar()
	s.registerPublic()
	s.registerInternal()
	return nil
}

// readPerms may look at the planner (the desk, check-in and results teams need the flights too).
var readPerms = []string{"horarios.publicar", "atletas.editar", "directo.operar", "checkin.escanear", "resultados.publicar"}

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
	return nil, problem.Forbidden("Tu rol no tiene acceso a los horarios de esta competición.")
}

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

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func etag(rev int) string { return `W/"` + strconv.Itoa(rev) + `"` }

func ifMatch(h string) int {
	h = strings.TrimPrefix(strings.TrimSpace(h), "W/")
	n, err := strconv.Atoi(strings.Trim(h, `"`))
	if err != nil {
		return -1
	}
	return n
}

var errConflicto = problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado los horarios mientras los editabas. Recarga para ver sus cambios.")

// ---- public cache (keyed by a per-competition version bumped on publish and on live changes) ----

func (s *Svc) version(ctx context.Context, cid uuid.UUID) string {
	v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("schedule", "ver", cid.String())).Result()
	if err != nil {
		return "0"
	}
	return v
}

func (s *Svc) bump(ctx context.Context, cid uuid.UUID) {
	_ = s.a.Redis.Incr(ctx, s.a.Keys.Of("schedule", "ver", cid.String())).Err()
}

// ensureConfig creates the planner settings of a competition on first use (days from the competition dates).
func (s *Svc) ensureConfig(ctx context.Context, cid uuid.UUID) error {
	var ok bool
	if err := s.a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM config WHERE competition_id = $1)`, cid).Scan(&ok); err != nil || ok {
		return err
	}
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return err
	}
	_, err = s.a.DB.Exec(ctx, `INSERT INTO config (competition_id, dias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, cid, diasPorDefecto(c))
	return err
}

// diasPorDefecto: one day per date of the competition, 09:00–20:00 with a lunch break and doors at 08:30.
func diasPorDefecto(c compref.Comp) []Dia {
	ini, err := time.Parse("2006-01-02", c.FechaInicio)
	if err != nil {
		ini = time.Now().AddDate(0, 1, 0)
	}
	fin, err := time.Parse("2006-01-02", c.FechaFin)
	if err != nil || fin.Before(ini) || fin.Sub(ini) > 6*24*time.Hour {
		fin = ini
	}
	var out []Dia
	for d := ini; !d.After(fin); d = d.AddDate(0, 0, 1) {
		out = append(out, Dia{Fecha: d.Format("2006-01-02"), Inicio: "09:00", Fin: "20:00", Puertas: "08:30", PausaInicio: "14:00", PausaFin: "15:00"})
	}
	return out
}

func (s *Svc) loc(ctx context.Context, cid uuid.UUID) *time.Location {
	if c, err := s.comps.ByID(ctx, cid); err == nil && c.ZonaHoraria != "" {
		if l, err := time.LoadLocation(c.ZonaHoraria); err == nil {
			return l
		}
	}
	return madrid
}

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// change runs a draft mutation: locks the settings row, checks If-Match, applies fn, increments the revision and
// announces it to the other planner sessions. Returns the new revision.
// desc, when given, describes the change once fn has run (e.g. «movió a Lucía de C a B»).
func (s *Svc) change(ctx context.Context, cid uuid.UUID, ifm, accion string, fn func(tx pgx.Tx) error, desc ...func() string) (int, error) {
	if err := s.ensureConfig(ctx, cid); err != nil {
		return 0, err
	}
	var rev int
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT rev FROM config WHERE competition_id = $1 FOR UPDATE`, cid).Scan(&rev); err != nil {
			return err
		}
		if ifm != "" && ifMatch(ifm) != rev {
			return errConflicto
		}
		if err := fn(tx); err != nil {
			return err
		}
		if err := recode(ctx, tx, cid); err != nil {
			return err
		}
		if len(desc) > 0 {
			accion = desc[0]()
		}
		rev++
		if _, err := tx.Exec(ctx, `UPDATE config SET rev = $2, updated_at = now() WHERE competition_id = $1`, cid, rev); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "horarios.borrador", map[string]any{"rev": rev, "accion": accion},
			events.Competition(cid.String()), events.ForPermission("horarios.publicar")))
	})
	return rev, err
}

// recode gives a letter to the flights that lack one (new ones, in chronological order), after the highest letter
// used in the draft or in the published version; existing flights never change letter, so generating AEP-3
// never recodes the flights of another competition (or of «Sin competición»).
func recode(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	rows, err := tx.Query(ctx, `SELECT id, prueba, codigo FROM flights WHERE competition_id = $1 ORDER BY dia, inicio, plataforma, created_at`, cid)
	if err != nil {
		return err
	}
	type fr struct {
		ID             uuid.UUID
		Prueba, Codigo string
	}
	fl, err := pgx.CollectRows(rows, pgx.RowToStructByPos[fr])
	if err != nil {
		return err
	}
	usado := map[string]bool{}
	enBorrador := map[uuid.UUID]bool{}
	for _, f := range fl {
		enBorrador[f.ID] = true
	}
	// Letters of published flights that are no longer in the draft stay reserved (no «Flight F» twice on the web).
	var sn Snapshot
	if err := tx.QueryRow(ctx, `SELECT snapshot FROM versiones WHERE competition_id = $1 AND estado = 'publicada'`, cid).Scan(&sn); err != nil && !db.IsNoRows(err) {
		return err
	}
	for _, d := range sn.Dias {
		for _, f := range d.Flights {
			if !enBorrador[f.ID] {
				usado[f.Codigo] = true
			}
		}
	}
	// A flight keeps its letter; only new flights («?») or a repeated letter get one, after the highest letter in use.
	var nuevos []uuid.UUID
	for _, f := range fl {
		if f.Codigo == "?" || f.Codigo == "" || usado[f.Codigo] {
			nuevos = append(nuevos, f.ID)
			continue
		}
		usado[f.Codigo] = true
	}
	libre := 0
	for c := range usado {
		libre = max(libre, indiceCodigo(c)+1)
	}
	for _, id := range nuevos {
		if _, err := tx.Exec(ctx, `UPDATE flights SET codigo = $2 WHERE id = $1`, id, codigoFlight(libre)); err != nil {
			return err
		}
		libre++
	}
	return nil
}

// indiceCodigo is the inverse of codigoFlight (-1 if it is not a letter code).
func indiceCodigo(c string) int {
	i := 0
	for _, r := range c {
		if r < 'A' || r > 'Z' {
			return -1
		}
		i = i*26 + int(r-'A') + 1
	}
	return i - 1
}

// codigoFlight: 0 → A … 25 → Z, 26 → AA…
func codigoFlight(i int) string {
	s := ""
	for i >= 0 {
		s = string(rune('A'+i%26)) + s
		i = i/26 - 1
	}
	return s
}

// marcarChecklist ticks «Horarios publicados» in the competition checklist (best effort).
func (s *Svc) marcarChecklist(ctx context.Context, cid uuid.UUID, hecho bool) {
	if err := s.comp.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/checklist/horarios-publicados", map[string]bool{"hecho": hecho}, nil); err != nil {
		s.a.Log.Warn("checklist horarios", "err", err)
	}
}
