package openlifter

// «Horario» → OpenLifter: the sessions of the published schedule of a meet as the day, platform, flight and lot of
// each linked entry. OpenLifter's sessions are the day + platform + flight of its entries, so the desk creates them
// by moving the entries; it polls this list and applies it when the published version changes, so a change in the
// backoffice (sessions, athletes of a session) reaches the desk without reopening the meet.

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// horarioDe reads the published schedule of the competition (3 s: a slow schedule must not hold the desk).
func (s *Svc) horarioDe(ctx context.Context, cid uuid.UUID) (*horarioPublicado, error) {
	hctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var sn *horarioPublicado
	if err := s.schedule.Do(hctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/horarios/publicados", nil, &sn); err != nil {
		return nil, err
	}
	return sn, nil
}

// asignacionHorario is what the desk needs to move an entry to the session of the published schedule.
type asignacionHorario struct {
	EntryID  int    `json:"entryId"`
	Day      int    `json:"day"`
	Platform int    `json:"platform"`
	Flight   string `json:"flight"`
	Lot      int    `json:"lot"`
}

// asignacionesDeHorario: the schedule as OpenLifter accepts it. asignarHorario does the work on the entry maps (the
// same one «Competiciones preparadas» uses when opening a meet), so the opening and the live sync never disagree.
// A judged entry keeps the day and flight it has (its session is not changed any more).
func asignacionesDeHorario(meet map[string]any, filas []*fila, links map[int]uuid.UUID, sn *horarioPublicado, niv niveles, mesa string) []asignacionHorario {
	entradas := make([]map[string]any, 0, len(filas))
	for _, f := range filas {
		e := map[string]any{"id": float64(f.EntryID)}
		if juzgadaFila(f) {
			e["squatStatus"] = []any{float64(1)}
		}
		entradas = append(entradas, e)
	}
	asignarHorario(meet, entradas, links, sn, niv, mesa)
	out := make([]asignacionHorario, 0, len(entradas))
	for _, e := range entradas {
		id, ok := entryID(e)
		dia, enSesion := e["day"].(int)
		if !ok || !enSesion {
			continue
		}
		plataforma, _ := e["platform"].(int)
		flight, _ := e["flight"].(string)
		lote, _ := e["lot"].(int)
		out = append(out, asignacionHorario{EntryID: id, Day: dia, Platform: plataforma, Flight: flight, Lot: lote})
	}
	return out
}

// juzgadaFila is juzgada for a stored entry.
func juzgadaFila(f *fila) bool {
	for _, xs := range [][]int{f.Datos.SquatStatus, f.Datos.BenchStatus, f.Datos.DeadliftStatus} {
		for _, x := range xs {
			if x != 0 {
				return true
			}
		}
	}
	return false
}

func (s *Svc) registerHorario() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/openlifter"

	type horarioIn struct {
		CID  uuid.UUID `path:"cid"`
		Mesa string    `query:"mesa" required:"true" minLength:"1" maxLength:"120"`
	}
	type horarioOut struct {
		Body struct {
			Publicado    bool                `json:"publicado"`
			Version      int                 `json:"version"`
			Asignaciones []asignacionHorario `json:"asignaciones"`
			Aviso        string              `json:"aviso,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "openlifter-horario", Method: http.MethodGet, Path: base + "/horario",
		Summary: "Horario publicado de la mesa (día, plataforma, flight y lote de cada entrada con atleta)", Tags: tag, Security: bearer},
		func(ctx context.Context, in *horarioIn) (*horarioOut, error) {
			if _, err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			o := &horarioOut{}
			o.Body.Asignaciones = []asignacionHorario{}
			var meet map[string]any
			var raw map[string]string
			err := s.a.DB.QueryRow(ctx, `SELECT meet, niveles FROM meets WHERE competition_id = $1 AND mesa = $2`, in.CID, in.Mesa).Scan(&meet, &raw)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("Esa competición no está preparada en el servidor.")
			}
			if err != nil {
				return nil, err
			}
			filas, err := cargar(ctx, s.a.DB, in.CID, in.Mesa)
			if err != nil {
				return nil, err
			}
			links := map[int]uuid.UUID{}
			for _, f := range filas {
				if f.AtletaID != nil && (f.Vinculo == "auto" || f.Vinculo == "confirmado") {
					links[f.EntryID] = *f.AtletaID
				}
			}
			sn, err := s.horarioDe(ctx, in.CID)
			if err != nil {
				s.a.Log.Warn("horarios publicados", "err", err)
				o.Body.Aviso = "No se pudieron leer los horarios publicados: el desk mantiene sus sesiones."
				return o, nil
			}
			if sn == nil {
				o.Body.Aviso = "Los horarios aún no están publicados: el desk mantiene sus sesiones."
				return o, nil
			}
			o.Body.Publicado = true
			o.Body.Version = sn.Numero
			o.Body.Asignaciones = asignacionesDeHorario(meet, filas, links, sn, leerNiveles(raw), in.Mesa)
			return o, nil
		})
}
