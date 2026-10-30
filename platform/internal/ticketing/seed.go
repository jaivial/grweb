package ticketing

import (
	"context"
	"fmt"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

// seedGRCup creates the sessions of the GR Cup 2026 on the competition dates (Figma 58: Sábado mañana open,
// Sábado tarde almost full, Domingo mañana sold out with a waiting list, Domingo tarde unpublished), the bookings
// of the design plus synthetic ones («Datos de ejemplo», .test addresses), the waiting list and the stations.
// Idempotent; no emails are sent.
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "ticketing", "competition", a.Cfg.InternalToken)
	var c compref.Comp
	for i := 0; ; i++ {
		if err := comp.Do(ctx, http.MethodGet, "/internal/competiciones/slug/grcup", nil, &c); err == nil {
			break
		} else if i > 30 {
			return err
		}
		time.Sleep(5 * time.Second)
	}
	var hay bool
	if err := a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sesiones WHERE competition_id = $1)`, c.ID).Scan(&hay); err != nil || hay {
		return err
	}
	d1, err := time.ParseInLocation("2006-01-02", c.FechaInicio, madrid)
	if err != nil {
		d1 = time.Now().AddDate(0, 1, 0)
	}
	d2 := d1.AddDate(0, 0, 1)
	if f, err := time.ParseInLocation("2006-01-02", c.FechaFin, madrid); err == nil {
		d2 = f
	}
	at := func(d time.Time, h, m int) time.Time {
		return time.Date(d.Year(), d.Month(), d.Day(), h, m, 0, 0, madrid)
	}
	apertura := at(d1.AddDate(0, -2, 0), 10, 0)
	type ses struct {
		id                uuid.UUID
		nombre, detalle   string
		ini, fin, puertas time.Time
		aforo, objetivo   int
		publicada         bool
	}
	ss := []ses{
		{newID(), "Sábado mañana", "Bloques 1–3 · femenino", at(d1, 9, 0), at(d1, 14, 0), at(d1, 8, 30), 600, 412, true},
		{newID(), "Sábado tarde", "Bloques 4–5 · masculino", at(d1, 16, 0), at(d1, 20, 30), at(d1, 15, 30), 600, 562, true},
		{newID(), "Domingo mañana", "Bloques 6–8 · masculino", at(d2, 9, 0), at(d2, 14, 0), at(d2, 8, 30), 600, 600, true},
		{newID(), "Domingo tarde (finales)", "Premios y sorteo en directo", at(d2, 16, 0), at(d2, 19, 0), at(d2, 15, 30), 400, 0, false},
	}
	r := rand.New(rand.NewPCG(2026, 58))
	nombres := []string{"Lucía", "Hugo", "Paula", "Álvaro", "Carmen", "Sergio", "Irene", "Adrián", "Alba", "Daniel", "Nerea", "Jorge", "Claudia", "Rubén", "Sara", "Víctor", "Julia", "Mario", "Noelia", "Iker"}
	apellidos := []string{"García", "Martínez", "López", "Navarro", "Torres", "Ramos", "Gil", "Serrano", "Molina", "Ortega", "Vidal", "Soler", "Puig", "Ferrer", "Ribes", "Climent"}
	origenes := []string{"ig_story_lanzamiento", "ig_story_lanzamiento", "ig_reel", "directo", "club", "cartel_qr", "boca_a_boca", "web"}
	sin := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "Á", "a")
	return db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for i, x := range ss {
			if _, err := tx.Exec(ctx, `INSERT INTO sesiones (id, competition_id, nombre, detalle, inicio, fin, puertas, aforo, max_por_reserva, apertura_at, publicada, orden)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,6,$9,$10,$11)`, x.id, c.ID, x.nombre, x.detalle, x.ini, x.fin, x.puertas, x.aforo, apertura, x.publicada, i); err != nil {
				return err
			}
		}
		// ins reports false when the random code already exists (try another one).
		ins := func(sid uuid.UUID, cod, nom, ape, email, origen, estado string, personas, dentro int, hace time.Duration) (bool, error) {
			tag, err := tx.Exec(ctx, `INSERT INTO entradas (id, competition_id, sesion_id, codigo, nombre, apellidos, email, personas, dentro, estado, origen, consentimientos, created_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (competition_id, codigo) DO NOTHING`, newID(), c.ID, sid, cod, nom, ape, email, personas, dentro, estado, origen,
				map[string]any{"privacidad": "ejemplo", "novedades": r.IntN(2) == 0}, time.Now().Add(-hace))
			return err == nil && tag.RowsAffected() == 1, err
		}
		// The bookings of the design.
		figma := []struct {
			s                       int
			cod, nom, ape, mail, or string
			estado                  string
			p, d                    int
		}{
			{0, "GRC-7K3P", "Laura", "Gómez Ruiz", "laura.gomez@ejemplo.test", "ig_story_lanzamiento", "reservada", 3, 0},
			{1, "GRC-2M9Q", "Pablo", "Romero", "pablo.r@ejemplo.test", "directo", "usada", 2, 2},
			{0, "GRC-8T5L", "Marta", "Ruiz", "marta.ruiz@ejemplo.test", "club", "reservada", 1, 0},
			{1, "GRC-4Z7D", "Diego", "Moreno", "diego.m@ejemplo.test", "cartel_qr", "reservada", 4, 0},
			{1, "GRC-9H2W", "Sara", "López", "sara.l@ejemplo.test", "web", "anulada", 2, 0},
			{2, "GRC-6N4N", "Iván", "Soler", "ivan.soler@ejemplo.test", "voluntarios", "reservada", 1, 0},
		}
		usado := make([]int, len(ss))
		for _, f := range figma {
			if _, err := ins(ss[f.s].id, f.cod, f.nom, f.ape, f.mail, f.or, f.estado, f.p, f.d, 30*24*time.Hour); err != nil {
				return err
			}
			if f.estado != "anulada" {
				usado[f.s] += f.p
			}
		}
		n := 0
		for i, x := range ss {
			for usado[i] < x.objetivo {
				p := 1 + r.IntN(4)
				if usado[i]+p > x.objetivo {
					p = x.objetivo - usado[i]
				}
				nom, ape := nombres[r.IntN(len(nombres))], apellidos[r.IntN(len(apellidos))]
				estado := "reservada"
				if r.IntN(40) == 0 {
					estado = "anulada"
				}
				ok, err := ins(x.id, fmt.Sprintf("GRC-%c%c%c%c", alfabeto[r.IntN(31)], alfabeto[r.IntN(31)], alfabeto[r.IntN(31)], alfabeto[r.IntN(31)]), nom, ape,
					fmt.Sprintf("%s.%d@ejemplo.test", strings.ToLower(sin.Replace(nom)), n), origenes[r.IntN(len(origenes))], estado, p, 0, time.Duration(r.IntN(60*24))*time.Hour)
				if err != nil {
					return err
				}
				if !ok {
					continue
				}
				n++
				if estado != "anulada" {
					usado[i] += p
				}
			}
		}
		for i := 0; i < 24; i++ {
			nom := nombres[r.IntN(len(nombres))] + " " + apellidos[r.IntN(len(apellidos))]
			estado := "en_espera"
			if _, err := tx.Exec(ctx, `INSERT INTO lista_espera (id, competition_id, sesion_id, nombre, email, personas, estado, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
				newID(), c.ID, ss[2].id, nom, fmt.Sprintf("espera.%d@ejemplo.test", i), 1+r.IntN(4), estado, time.Now().Add(-time.Duration(48-i)*time.Hour)); err != nil {
				return err
			}
		}
		for i, p := range []struct{ n, t, d string }{{"Puerta A", "puerta", "Acceso principal · 1 escáner"}, {"Puerta B", "puerta", "Grada norte · 1 escáner"},
			{"Taquilla 2", "taquilla", "Reservas manuales y dudas"}, {"Pesaje de atletas", "pesaje", "Solo staff de competición"}} {
			if _, err := tx.Exec(ctx, `INSERT INTO puestos (id, competition_id, nombre, tipo, detalle, orden) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, newID(), c.ID, p.n, p.t, p.d, i); err != nil {
				return err
			}
		}
		a.Log.Info("entradas de ejemplo", "reservas", n+len(figma))
		return nil
	})
}
