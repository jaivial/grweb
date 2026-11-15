// Package patrocinio shows sponsor banners in the live chat (Figma pages 70 · /en-directo and 73 · BO ·
// Patrocinio): banners by tier (oro, plata, bronce) with weights, a leader worker that picks the banner of each
// tic (everyone out at least once per día, then smooth weighted round-robin), the public click redirect and the
// backoffice CRUD, config and daily report.
package patrocinio

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
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
	live   *svcclient.Client
	webURL string

	fmu     sync.Mutex
	directo map[uuid.UUID]faseVal
}

// faseVal caches the fase of live of one competition for 10 s.
type faseVal struct {
	en  bool
	exp time.Time
}

// Service returns the patrocinio service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "patrocinio", Title: "GR Cup · patrocinio", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	s.comp = svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "patrocinio", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(s.comp, a.Log)
	s.live = svcclient.New(config.Str("UPSTREAM_LIVE", "http://live:8080"), "patrocinio", "live", a.Cfg.InternalToken)
	s.webURL = trimSlash(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"))
	s.directo = map[uuid.UUID]faseVal{}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	s.registerPublic()
	s.registerAdmin()
	a.Go(s.worker)
	return nil
}

// ---- time, ids, helpers ----

var madrid = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// hoyMadrid is the día of a moment in Europe/Madrid (the banner queue, like the chat and the ranking, is per
// jornada).
func hoyMadrid(now time.Time) time.Time {
	f := now.In(madrid).Format("2006-01-02")
	t, _ := time.ParseInLocation("2006-01-02", f, time.UTC)
	return t
}

func diaTexto(t time.Time) string { return t.Format("2006-01-02") }

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func trimSlash(u string) string {
	for len(u) > 0 && u[len(u)-1] == '/' {
		u = u[:len(u)-1]
	}
	return u
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

// clicURL is where the chat sends every banner click.
func (s *Svc) clicURL(slug string, id uuid.UUID) string {
	return s.webURL + "/api/competiciones/" + slug + "/patrocinio/banners/" + id.String() + "/clic"
}

// ---- worker (one leader, chosen and renewed in Redis) ----

var (
	renovarScript = redis.NewScript(`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end`)
	liberarScript = redis.NewScript(`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`)
)

// compActiva is one competition with patrocinio activo, with its slug and config.
type compActiva struct {
	ID     uuid.UUID
	Slug   string
	Config Config
}

// worker is the singleton that picks and injects the banner of every tic: leadership via SET NX PX (30 s,
// renewed every 10 s), one tic per active competition every intervalo_seg.
func (s *Svc) worker(ctx context.Context) {
	lock := s.a.Keys.Of("lock", "patrocinio", "worker")
	pod := newID().String()
	var soy bool
	var renov time.Time
	next := map[uuid.UUID]time.Time{}
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			if soy {
				_, _ = liberarScript.Run(context.WithoutCancel(ctx), s.a.Redis, []string{lock}, pod).Int()
			}
			return
		case <-t.C:
		}
		if !s.soyLider(ctx, lock, pod, &soy, &renov) {
			continue
		}
		activas := s.activas(ctx)
		vivas := map[uuid.UUID]bool{}
		for _, c := range activas {
			vivas[c.ID] = true
			if v, ok := next[c.ID]; ok && time.Now().Before(v) {
				continue
			}
			s.tic(ctx, c)
			next[c.ID] = time.Now().Add(time.Duration(c.Config.IntervaloSeg) * time.Second)
		}
		for id := range next {
			if !vivas[id] {
				delete(next, id)
			}
		}
	}
}

// soyLider acquires (SET NX PX) or renews the worker lock; only one worker of the deployment runs at a time.
func (s *Svc) soyLider(ctx context.Context, lock, pod string, soy *bool, renov *time.Time) bool {
	if ok, err := s.a.Redis.SetNX(ctx, lock, pod, 30*time.Second).Result(); err == nil && ok {
		*soy, *renov = true, time.Now()
		return true
	}
	if !*soy {
		return false
	}
	if time.Since(*renov) >= 10*time.Second {
		if n, err := renovarScript.Run(ctx, s.a.Redis, []string{lock}, pod, "30000").Int(); err != nil || n != 1 {
			*soy = false // expired and taken by another pod
			return false
		}
		*renov = time.Now()
	}
	return true
}

// activas lists the competitions with patrocinio activo and their slug (the resolver caches the lookup).
func (s *Svc) activas(ctx context.Context) []compActiva {
	rows, err := s.a.DB.Query(ctx, `SELECT competition_id, intervalo_seg, peso_oro, peso_plata, peso_bronce, solo_en_directo, activo FROM config_patrocinio WHERE activo`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []compActiva
	for rows.Next() {
		var c compActiva
		if err := rows.Scan(&c.ID, &c.Config.IntervaloSeg, &c.Config.PesoOro, &c.Config.PesoPlata, &c.Config.PesoBronce, &c.Config.SoloEnDirecto, &c.Config.Activo); err != nil {
			continue
		}
		comp, err := s.comps.ByID(ctx, c.ID)
		if err != nil {
			s.a.Log.Warn("patrocinio: competición no disponible", "cid", c.ID, "err", err)
			continue
		}
		c.Slug = comp.Slug
		out = append(out, c)
	}
	return out
}

// pesoDe is the weight of a tier in a config.
func pesoDe(c Config, tier string) int {
	switch tier {
	case "oro":
		return c.PesoOro
	case "plata":
		return c.PesoPlata
	case "bronce":
		return c.PesoBronce
	}
	return 0
}

// enDirecto says whether the fase of live is «en_directo» (public endpoint, cached 10 s). When live is not
// reachable the answer is no: banners wait instead of showing outside the direct.
func (s *Svc) enDirecto(ctx context.Context, cid uuid.UUID) bool {
	s.fmu.Lock()
	if c, ok := s.directo[cid]; ok && time.Now().Before(c.exp) {
		s.fmu.Unlock()
		return c.en
	}
	s.fmu.Unlock()
	en := false
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		var out struct {
			Fase string `json:"fase" enum:"antes,en_directo,finalizado"`
		}
		if err := s.live.Do(ctx, http.MethodGet, "/api/competiciones/"+c.Slug+"/directo", nil, &out); err == nil {
			en = out.Fase == "en_directo"
		} else {
			s.a.Log.Warn("patrocinio: live no disponible", "slug", c.Slug, "err", err)
		}
	}
	s.fmu.Lock()
	s.directo[cid] = faseVal{en, time.Now().Add(10 * time.Second)}
	s.fmu.Unlock()
	return en
}

// ---- the tic itself ----

// estadoRR reads the round-robin state of a competition and día from Redis (missing: fresh).
func (s *Svc) estadoRR(ctx context.Context, cid uuid.UUID, dia string) Estado {
	b, err := s.a.Redis.Get(ctx, s.a.Keys.Of("patrocinio", "rr", cid.String(), dia)).Bytes()
	if err != nil {
		return Estado{}
	}
	var m map[string]int
	if json.Unmarshal(b, &m) != nil {
		return Estado{}
	}
	e := Estado{}
	for k, v := range m {
		if id, err := uuid.Parse(k); err == nil {
			e[id] = v
		}
	}
	return e
}

// guardarEstadoRR keeps the round-robin state of a competition and día (two jornadas of margin).
func (s *Svc) guardarEstadoRR(ctx context.Context, cid uuid.UUID, dia string, e Estado) {
	m := make(map[string]int, len(e))
	for id, v := range e {
		m[id.String()] = v
	}
	b, _ := json.Marshal(m)
	_ = s.a.Redis.Set(ctx, s.a.Keys.Of("patrocinio", "rr", cid.String(), dia), b, 48*time.Hour).Err()
}

// candidatos are the active banners in force right now, ordered (the picker re-orders them anyway).
func (s *Svc) candidatos(ctx context.Context, cid uuid.UUID) ([]Banner, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT id, patrocinador, imagen_url, imagen_movil_url, url_destino, tier, orden FROM banners
		WHERE competition_id = $1 AND activo AND (desde IS NULL OR desde <= now()) AND (hasta IS NULL OR hasta >= now())`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Banner{}
	for rows.Next() {
		var b Banner
		if err := rows.Scan(&b.ID, &b.Patrocinador, &b.ImagenURL, &b.ImagenMovilURL, &b.URLDestino, &b.Tier, &b.Orden); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Svc) aparicionesHoy(ctx context.Context, cid uuid.UUID, dia string) (map[uuid.UUID]int, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT banner_id, count(*) FROM apariciones WHERE competition_id = $1 AND dia = $2 GROUP BY banner_id`, cid, dia)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[uuid.UUID]int{}
	for rows.Next() {
		var id uuid.UUID
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		m[id] = n
	}
	return m, rows.Err()
}

// tic shows one banner: first those pending today, then weighted round-robin. The appearance and the public
// event go in the same transaction; the state is saved whichever the outcome.
func (s *Svc) tic(ctx context.Context, c compActiva) {
	if c.Config.SoloEnDirecto && !s.enDirecto(ctx, c.ID) {
		return
	}
	d := diaTexto(hoyMadrid(time.Now()))
	banners, err := s.candidatos(ctx, c.ID)
	if err != nil || len(banners) == 0 {
		return
	}
	vistos, err := s.aparicionesHoy(ctx, c.ID, d)
	if err != nil {
		return
	}
	sels := make([]BannerSel, len(banners))
	for i, b := range banners {
		sels[i] = BannerSel{ID: b.ID, Tier: b.Tier, Orden: b.Orden, Peso: pesoDe(c.Config, b.Tier), Apariciones: vistos[b.ID]}
	}
	elegido, nuevo := Elegir(sels, s.estadoRR(ctx, c.ID, d))
	s.guardarEstadoRR(ctx, c.ID, d, nuevo)
	if elegido == uuid.Nil {
		return
	}
	var b Banner
	for _, x := range banners {
		if x.ID == elegido {
			b = x
			break
		}
	}
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO apariciones (id, competition_id, banner_id, dia) VALUES ($1,$2,$3,$4)`, newID(), c.ID, b.ID, d); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "patrocinio.banner", map[string]any{
			"bannerId": b.ID.String(), "patrocinador": b.Patrocinador, "imagenUrl": b.ImagenURL, "imagenMovilUrl": b.ImagenMovilURL,
			"clicUrl": s.clicURL(c.Slug, b.ID), "tier": b.Tier, "dia": d,
		}, events.Competition(c.ID.String()), events.Audience(events.Public), events.Subject("banner:"+b.ID.String())))
	})
	if err != nil {
		s.a.Log.Error("patrocinio: aparición", "cid", c.ID, "banner", b.ID, "err", err)
	}
}
