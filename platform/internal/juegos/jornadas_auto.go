// jornadas_auto.go: the jornadas follow the dates of the schedule (review BO 15-nov). There is no manual
// creation: every date of `schedule` (sábado 19, domingo 20, and any date added with «+») has exactly one jornada
// with the same template (porra, fantasy, rooms, prizes per jornada). The athletes, categories and grades of each
// jornada already come from the scoreboard of its day (sync.go), so the date is the only key that correlates
// schedule, live and games.
package juegos

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
)

var diasSemana = [...]string{"Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"}

// nombreDia is the visible name of an automatic jornada: «Sábado 19» (the same label as the schedule tabs).
func nombreDia(dia string) string {
	t, err := time.Parse("2006-01-02", dia)
	if err != nil {
		return dia
	}
	return diasSemana[t.Weekday()] + " " + t.Format("2")
}

// fechasSchedule reads the dates of the schedule: the draft dates (GET …/horarios/dias) and, while that endpoint
// does not exist, the dates of the published version. ok=false when schedule could not be read: the caller must
// not delete anything then.
func (s *Svc) fechasSchedule(ctx context.Context, cid uuid.UUID) (fechas []string, ok bool) {
	if s.sched == nil {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var out struct {
		Dias []struct {
			Fecha string `json:"fecha"`
		} `json:"dias"`
	}
	base := "/internal/competiciones/" + cid.String() + "/horarios"
	if err := s.sched.Do(ctx, http.MethodGet, base+"/dias", nil, &out); err != nil {
		var snap *struct {
			Dias []snapDia `json:"dias"`
		}
		if err := s.sched.Do(ctx, http.MethodGet, base+"/publicados", nil, &snap); err != nil {
			s.a.Log.Warn("fechas del horario no disponibles", "cid", cid, "err", err)
			return nil, false
		}
		out.Dias = out.Dias[:0]
		if snap != nil {
			for _, d := range snap.Dias {
				out.Dias = append(out.Dias, struct {
					Fecha string `json:"fecha"`
				}{d.Fecha})
			}
		}
	}
	vistas := map[string]bool{}
	for _, d := range out.Dias {
		if _, err := time.Parse("2006-01-02", d.Fecha); err == nil && !vistas[d.Fecha] {
			vistas[d.Fecha] = true
			fechas = append(fechas, d.Fecha)
		}
	}
	sort.Strings(fechas)
	return fechas, true
}

// reconciliarJornadas creates the missing jornada of every schedule date (estado borrador, named after the day)
// and deletes the jornadas whose date left the schedule only while they are an untouched borrador (no markets,
// rooms, signings, balances, movements or prizes): a jornada that was played is never lost. Idempotent and concurrency-safe
// (UNIQUE (competition_id, dia) + ON CONFLICT).
func (s *Svc) reconciliarJornadas(ctx context.Context, cid uuid.UUID) error {
	fechas, ok := s.fechasSchedule(ctx, cid)
	if !ok {
		return nil
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		for _, f := range fechas {
			id := uuid.Must(uuid.NewV7())
			if _, err := tx.Exec(ctx, `INSERT INTO jornadas (id, competition_id, dia, nombre) VALUES ($1,$2,$3,$4)
				ON CONFLICT (competition_id, dia) DO NOTHING`, id, cid, f, nombreDia(f)); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `DELETE FROM jornadas j WHERE j.competition_id = $1 AND j.estado = 'borrador'
			AND NOT (j.dia::text = ANY($2::text[]))
			AND NOT EXISTS (SELECT 1 FROM mercados m WHERE m.jornada_id = j.id)
			AND NOT EXISTS (SELECT 1 FROM salas x WHERE x.jornada_id = j.id)
			AND NOT EXISTS (SELECT 1 FROM fichajes p WHERE p.jornada_id = j.id)
			AND NOT EXISTS (SELECT 1 FROM saldos v WHERE v.jornada_id = j.id)
			AND NOT EXISTS (SELECT 1 FROM movimientos v WHERE v.jornada_id = j.id)
			AND NOT EXISTS (SELECT 1 FROM premios v WHERE v.jornada_id = j.id)`, cid, fechas)
		return err
	})
}

// reconciliarTodas runs reconciliarJornadas for every competition that juegos knows (configured or with
// jornadas). Called by the worker reconciler; a competition that never opened the BO page is picked up the first
// time an admin opens it (GET /jornadas reconciles too).
func (s *Svc) reconciliarTodas(ctx context.Context) {
	rows, err := s.a.DB.Query(ctx, `SELECT competition_id FROM config_juegos UNION SELECT competition_id FROM jornadas`)
	if err != nil {
		return
	}
	var cids []uuid.UUID
	for rows.Next() {
		var c uuid.UUID
		if rows.Scan(&c) == nil {
			cids = append(cids, c)
		}
	}
	rows.Close()
	for _, c := range cids {
		if err := s.reconciliarJornadas(ctx, c); err != nil && ctx.Err() == nil {
			s.a.Log.Warn("jornadas automáticas", "cid", c, "err", err)
		}
	}
}
