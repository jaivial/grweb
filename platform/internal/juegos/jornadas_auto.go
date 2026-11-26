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
		if snap == nil {
			return nil, false // nothing published yet and no draft endpoint: unknown, touch nothing
		}
		for _, d := range snap.Dias {
			out.Dias = append(out.Dias, struct {
				Fecha string `json:"fecha"`
			}{d.Fecha})
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

// reconciliarJornadas creates the missing jornada of every schedule date and keeps them playable on their own (no
// buttons in the backoffice): a jornada of today or of a day to come is open, a past one is closed (its open markets
// close and its rooms write the palmarés, what «Cerrar jornada» did). A jornada whose date left the schedule is
// deleted only while nobody played it (no bets, rooms, signings, balances, movements or prizes): a jornada that was
// played is never lost. Idempotent and concurrency-safe (UNIQUE (competition_id, dia) + ON CONFLICT).
func (s *Svc) reconciliarJornadas(ctx context.Context, cid uuid.UUID) error {
	fechas, ok := s.fechasSchedule(ctx, cid)
	if ok {
		if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			for _, f := range fechas {
				id := uuid.Must(uuid.NewV7())
				if _, err := tx.Exec(ctx, `INSERT INTO jornadas (id, competition_id, dia, nombre, estado) VALUES ($1,$2,$3,$4,'abierta')
					ON CONFLICT (competition_id, dia) DO NOTHING`, id, cid, f, nombreDia(f)); err != nil {
					return err
				}
			}
			_, err := tx.Exec(ctx, `WITH borradas AS (
				DELETE FROM jornadas j WHERE j.competition_id = $1 AND j.estado IN ('borrador', 'abierta')
				AND NOT (j.dia::text = ANY($2::text[]))
				AND NOT EXISTS (SELECT 1 FROM apuestas a WHERE a.jornada_id = j.id)
				AND NOT EXISTS (SELECT 1 FROM salas x WHERE x.jornada_id = j.id)
				AND NOT EXISTS (SELECT 1 FROM fichajes p WHERE p.jornada_id = j.id)
				AND NOT EXISTS (SELECT 1 FROM saldos v WHERE v.jornada_id = j.id)
				AND NOT EXISTS (SELECT 1 FROM movimientos v WHERE v.jornada_id = j.id)
				AND NOT EXISTS (SELECT 1 FROM premios v WHERE v.jornada_id = j.id)
				RETURNING j.id)
			DELETE FROM fantasy_atletas fa WHERE fa.jornada_id IN (SELECT id FROM borradas)`, cid, fechas) // markets and rooms go by ON DELETE CASCADE
			return err
		}); err != nil {
			return err
		}
	}
	return s.estadosAutomaticos(ctx, cid)
}

// estadosAutomaticos opens the jornadas of today and the days to come (old drafts included) and closes the ones
// whose day has passed. «En juego» comes from the reconciler when the day starts (enJuegoAutomatico).
func (s *Svc) estadosAutomaticos(ctx context.Context, cid uuid.UUID) error {
	if _, err := s.a.DB.Exec(ctx, `UPDATE jornadas SET estado = 'abierta', version = version + 1, updated_at = clock_timestamp()
		WHERE competition_id = $1 AND estado = 'borrador' AND dia >= (now() AT TIME ZONE 'Europe/Madrid')::date`, cid); err != nil {
		return err
	}
	rows, err := s.a.DB.Query(ctx, selJornada+` FROM jornadas WHERE competition_id = $1 AND estado IN ('borrador', 'abierta', 'en_juego')
		AND dia < (now() AT TIME ZONE 'Europe/Madrid')::date ORDER BY dia`, cid)
	if err != nil {
		return err
	}
	var pasadas []jornada
	for rows.Next() {
		if j, err := scanJornada(rows); err == nil {
			pasadas = append(pasadas, j)
		}
	}
	rows.Close()
	for _, j := range pasadas {
		if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			tag, err := tx.Exec(ctx, `UPDATE jornadas SET estado = 'cerrada', version = version + 1, updated_at = clock_timestamp()
				WHERE id = $1 AND estado <> 'cerrada'`, j.ID)
			if err != nil || tag.RowsAffected() == 0 {
				return err
			}
			if err := cerrarMercadosJornadaTx(ctx, tx, cid, j.ID); err != nil {
				return err
			}
			return s.finalizarSalasTx(ctx, tx, cid, j)
		}); err != nil {
			return err
		}
	}
	return nil
}

// enJuegoAutomatico moves today's open jornada to «en juego» once its day has begun (first session of the
// published schedule, or the live desk already broadcasting) and starts its rooms, what the «En juego» button did.
func (s *Svc) enJuegoAutomatico(ctx context.Context, cid uuid.UUID, j jornada) error {
	if j.Estado != "abierta" {
		return nil
	}
	empezado := s.horario(ctx, cid, j.Dia).empezado(j, time.Now())
	if !empezado {
		if m, _, err := s.marcador(ctx, cid, j.Dia); err == nil && m != nil && m.Fase == "en_directo" {
			empezado = true
		}
	}
	if !empezado {
		return nil
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE jornadas SET estado = 'en_juego', version = version + 1, updated_at = clock_timestamp()
			WHERE id = $1 AND estado = 'abierta'`, j.ID)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		j.Estado = "en_juego"
		return iniciarSalasTx(ctx, tx, cid, j)
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
