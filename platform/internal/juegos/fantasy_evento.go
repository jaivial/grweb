// fantasy_evento.go: GRS Fantasy is one game for the whole event (Jaime 26-nov). One market with the approved
// athletes of every date, one fantasy wallet, rooms that can be created and joined until the event ends and
// clausulazos until the last session of the last day. The porra keeps one jornada per day; the fantasy lives in the
// last jornada of the schedule and the grades of every day add up there.
package juegos

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var errSinJornada = problem.NotFound("No hay jornada.")

// jornadaFantasy is the jornada that holds GRS Fantasy: the last date of the schedule still being played, or the last
// one once everything is closed (palmarés).
func (s *Svc) jornadaFantasy(ctx context.Context, q querier, cid uuid.UUID) (*jornada, error) {
	j, err := scanJornada(q.QueryRow(ctx, selJornada+` FROM jornadas WHERE competition_id = $1 AND estado <> 'borrador'
		ORDER BY estado <> 'cerrada' DESC, dia DESC LIMIT 1`, cid))
	if db.IsNoRows(err) {
		return nil, errSinJornada
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

var fantasyCache sync.Map // cid → *jornadaEntrada

// jornadaFantasyCache memoizes jornadaFantasy like jornadaPublicaCache (writes re-read the jornada in their tx).
func (s *Svc) jornadaFantasyCache(ctx context.Context, cid uuid.UUID) (*jornada, error) {
	if v, ok := fantasyCache.Load(cid); ok {
		if e := v.(*jornadaEntrada); time.Now().Before(e.exp) {
			j := e.j
			return &j, nil
		}
	}
	j, err := s.jornadaFantasy(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	fantasyCache.Store(cid, &jornadaEntrada{j: *j, exp: time.Now().Add(mercadosTTL)})
	return j, nil
}

// esFantasy tells whether j is the jornada of the fantasy (its market merges every day).
func (s *Svc) esFantasy(ctx context.Context, cid uuid.UUID, j jornada) bool {
	f, err := s.jornadaFantasyCache(ctx, cid)
	return err == nil && f.ID == j.ID
}

// marcadorFantasy is the scoreboard the fantasy reads: for the fantasy jornada, the scoreboards of every schedule date
// merged (each day ranks on its own, as in live); for any other jornada, the one of its day.
func (s *Svc) marcadorFantasy(ctx context.Context, cid uuid.UUID, j jornada) (*Marcador, bool, error) {
	if !s.esFantasy(ctx, cid, j) {
		return s.marcador(ctx, cid, j.Dia)
	}
	dias := s.diasDelHorario(ctx, cid)
	if len(dias) == 0 {
		dias = []string{j.Dia}
	}
	out := &Marcador{Atletas: []MarcadorAtleta{}, CategoriasPublicadas: []string{}}
	pos := map[uuid.UUID]int{}
	degradado := false
	for _, d := range dias {
		m, deg, err := s.marcador(ctx, cid, d)
		if err != nil {
			return nil, false, err
		}
		degradado = degradado || deg
		if m.Fase == "en_directo" || out.Fase == "" {
			out.Fase = m.Fase
		}
		if m.SesionEnCurso != "" {
			out.SesionEnCurso = m.SesionEnCurso
		}
		out.Degradado = out.Degradado || m.Degradado
		for _, a := range m.Atletas {
			a.Dia = d
			// an athlete without a sesion is listed on every day of his competition: keep one entry, the one with
			// a sesion (and his attempts) if any
			if i, ok := pos[a.AtletaID]; ok {
				if out.Atletas[i].SesionID == uuid.Nil && a.SesionID != uuid.Nil {
					out.Atletas[i] = a
				}
				continue
			}
			pos[a.AtletaID] = len(out.Atletas)
			out.Atletas = append(out.Atletas, a)
		}
	}
	return out, degradado, nil
}

// sincronizarFantasy brings the fantasy market in step with the merged scoreboard (athletes in and out, names,
// weight classes) and applies the grades of every day (clause changes, fantasy.nota). Idempotent.
func (s *Svc) sincronizarFantasy(ctx context.Context, cid uuid.UUID) error {
	j, err := s.jornadaFantasy(ctx, s.a.DB, cid)
	if err == errSinJornada {
		return nil
	}
	if err != nil {
		return err
	}
	if !j.jugable() {
		return nil // the event is over: the market is frozen with the palmarés
	}
	m, degradado, err := s.marcadorFantasy(ctx, cid, *j)
	if err != nil {
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		// the dispatcher and the reconciler of the worker may sync at the same time: one at a time per competition,
		// so a grade is never applied twice to a clause
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "juegos-fantasy:"+cid.String()); err != nil {
			return err
		}
		cfg, err := configJuegos(ctx, tx, cid)
		if err != nil {
			return err
		}
		if err := sincronizarAtletasTx(ctx, tx, cid, *j, m, cfg, degradado); err != nil {
			return err
		}
		// the one-day fantasy markets of the previous version: nobody plays them any more (owned ones are kept)
		if _, err := tx.Exec(ctx, `DELETE FROM fantasy_atletas fa WHERE fa.competition_id = $1 AND fa.jornada_id <> $2
			AND fa.jornada_id IN (SELECT id FROM jornadas WHERE competition_id = $1 AND estado IN ('borrador', 'abierta', 'en_juego'))
			AND NOT EXISTS (SELECT 1 FROM sala_atletas sa WHERE sa.jornada_id = fa.jornada_id AND sa.atleta_id = fa.atleta_id AND sa.dueno_fan_id IS NOT NULL)`, cid, j.ID); err != nil {
			return err
		}
		return aplicarNotasTx(ctx, tx, cid, *j, cfg, m)
	})
}
