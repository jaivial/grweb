package schedule

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// seedGRCup plans and publishes v1 of the GR Cup 2026 schedule from the seeded athletes («Datos de ejemplo»: notes
// and agenda of the day are examples), without emailing anyone. Idempotent: does nothing once there is a draft or
// a version. Waits up to 5 minutes for the athletes seed (both jobs run on the same deploy).
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	var c compref.Comp
	var ats []atleta
	deadline := time.Now().Add(5 * time.Minute)
	for {
		err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/slug/grcup", nil, &c)
		if err == nil {
			ats, err = s.confirmados(ctx, c.ID)
		}
		if err == nil && len(ats) > 0 {
			break
		}
		if time.Now().After(deadline) {
			if err == nil {
				err = errors.New("no hay atletas confirmados todavía")
			}
			return err
		}
		a.Log.Info("esperando a competition y athletes", "err", err)
		time.Sleep(10 * time.Second)
	}
	var hay bool
	if err := a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM flights WHERE competition_id = $1) OR EXISTS (SELECT 1 FROM versiones WHERE competition_id = $1)`, c.ID).Scan(&hay); err != nil {
		return err
	}
	if hay {
		a.Log.Info("horarios ya sembrados")
		return nil
	}
	if err := s.ensureConfig(ctx, c.ID); err != nil {
		return err
	}
	loc := s.loc(ctx, c.ID)
	_, err := s.change(ctx, c.ID, "", "sembró los horarios de ejemplo", func(tx pgx.Tx) error {
		cfg, _, _, _, err := loadConfig(ctx, tx, c.ID)
		if err != nil {
			return err
		}
		// Example day: 6 min per athlete and flights until 21:00, so the 11 flights fit in the two days.
		cfg.MinPorAtleta = 6
		for i := range cfg.Dias {
			cfg.Dias[i].Fin = "21:00"
		}
		if _, err := tx.Exec(ctx, `UPDATE config SET min_por_atleta = $2 WHERE competition_id = $1`, c.ID, cfg.MinPorAtleta); err != nil {
			return err
		}
		notas := []string{"Pesaje en la Sala 2 (planta baja).", "Entrada de público por la puerta principal con tu QR.", "Sorteo en directo tras la entrega de premios."}
		for i := range cfg.Dias {
			cfg.Dias[i].Notas = notas
			if i < len(cfg.Dias)-1 {
				cfg.Dias[i].Notas = notas[:2]
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, c.ID, cfg.Dias); err != nil {
			return err
		}
		plan := generar(cfg, loc, ats)
		if err := s.reemplazar(ctx, tx, c.ID, cfg, plan); err != nil {
			return err
		}
		if len(cfg.Dias) == 0 {
			return nil
		}
		// Doors on every day; awards and raffle 30 minutes after the last flight.
		var ultimo time.Time
		ultimoDia := cfg.Dias[len(cfg.Dias)-1].Fecha
		for _, p := range plan {
			if f := p.Inicio.Add(time.Duration(p.Duracion) * time.Minute); p.Dia == ultimoDia && f.After(ultimo) {
				ultimo = f
			}
		}
		for i, d := range cfg.Dias {
			first := "08:30"
			if d.Puertas != "" {
				first = d.Puertas
			}
			titulo := "Apertura de puertas · primer pesaje a las 07:00 (Sala 2)"
			if i > 0 {
				titulo = "Apertura de puertas"
			}
			if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden) VALUES ($1,$2,$3,$4,$5,'door',0)`, newID(), c.ID, d.Fecha, first, titulo); err != nil {
				return err
			}
		}
		if !ultimo.IsZero() {
			premios := hhmm(ceil30(ultimo.Add(30*time.Minute)), loc)
			if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden) VALUES ($1,$2,$3,$4,'Entrega de premios y sorteo en directo','trophy',1)`,
				newID(), c.ID, ultimoDia, premios); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	p, err := s.publicar(ctx, c.ID, "", false, false)
	if err != nil {
		return err
	}
	a.Log.Info("horarios de ejemplo publicados", "version", p.Version, "atletas", len(ats))
	return nil
}

func ceil30(t time.Time) time.Time {
	r := t.Truncate(30 * time.Minute)
	if r.Before(t) {
		r = r.Add(30 * time.Minute)
	}
	return r
}
