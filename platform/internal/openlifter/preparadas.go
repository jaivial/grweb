package openlifter

// «Competiciones preparadas»: the setup of each OpenLifter meet lives on the server (meets), so the desk signs in
// and opens its meet from the list instead of loading a .openlifter file. Opening merges the prepared registration
// with the latest synchronised state of each entry (entradas.datos wins) and, when the schedule is published, gives
// each linked lifter the day, platform, flight and lot of their session.

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// MeetResumen is a prepared meet of the competition.
type MeetResumen struct {
	Mesa        string    `json:"mesa"`
	Nombre      string    `json:"nombre"`
	Fecha       string    `json:"fecha"`
	Atletas     int       `json:"atletas" doc:"Entradas de la inscripción"`
	Vinculados  int       `json:"vinculados" doc:"Entradas vinculadas con un atleta"`
	Actualizado time.Time `json:"actualizado"`
}

// Horario says what the published schedule gave to the meet.
type Horario struct {
	Publicado bool   `json:"publicado"`
	Version   int    `json:"version,omitempty"`
	Sesiones  int    `json:"sesiones" doc:"Sesiones publicadas con atletas de esta mesa"`
	Asignadas int    `json:"asignadas" doc:"Entradas con día, plataforma, flight y lote del horario"`
	Aviso     string `json:"aviso,omitempty"`
}

// MeetCompleto is everything the desk needs to open a meet.
type MeetCompleto struct {
	Mesa     string           `json:"mesa"`
	Meet     map[string]any   `json:"meet" doc:"«meet» de OpenLifter"`
	Entradas []map[string]any `json:"entradas" doc:"Entradas de OpenLifter (inscripción preparada + último estado sincronizado)"`
	Grupo    *Grupo           `json:"grupo,omitempty" doc:"Último grupo en pantalla de la mesa"`
	Horario  Horario          `json:"horario"`
}

// the published schedule, only what the desk uses (schedule.Snapshot)
type horarioPublicado struct {
	Numero int `json:"numero"`
	Dias   []struct {
		Fecha    string `json:"fecha"`
		Sesiones []struct {
			Prueba  string    `json:"prueba"`
			Inicio  time.Time `json:"inicio"`
			Atletas []struct {
				ID   uuid.UUID `json:"id"`
				Lote int       `json:"lote"`
			} `json:"atletas"`
		} `json:"sesiones"`
	} `json:"dias"`
}

func entryID(e map[string]any) (int, bool) {
	f, ok := e["id"].(float64)
	return int(f), ok && f >= 0
}

// juzgada: the entry already has a decision (its schedule is not changed any more).
func juzgada(e map[string]any) bool {
	for _, k := range []string{"squatStatus", "benchStatus", "deadliftStatus"} {
		xs, _ := e[k].([]any)
		for _, x := range xs {
			if f, _ := x.(float64); f != 0 {
				return true
			}
		}
	}
	return false
}

// flightDe: A…Z, then AA, AB… (OpenLifter allows 2 characters).
func flightDe(n int) string {
	if n < 26 {
		return string(rune('A' + n))
	}
	n -= 26
	return string(rune('A'+n/26%26)) + string(rune('A'+n%26))
}

// asignarHorario gives the linked entries of the published sessions of this meet the day, platform 1, the flight
// (one letter per session of the day, in start order) and the lot of the schedule. A desk of a level (AEP 2 / AEP 3)
// takes the sessions of its level, whatever their date (its days are the session dates in order); any other desk
// takes the sessions that fall on the meet's days.
func asignarHorario(meet map[string]any, entradas []map[string]any, links map[int]uuid.UUID, sn *horarioPublicado, nivel string) Horario {
	const mantener = ": se mantienen el día, la plataforma y el flight de la inscripción."
	if sn == nil {
		return Horario{Aviso: "Los horarios de la competición aún no están publicados" + mantener}
	}
	h := Horario{Publicado: true, Version: sn.Numero}
	dias := 1
	if f, ok := meet["lengthDays"].(float64); ok && f >= 1 {
		dias = int(f)
	}
	fecha, _ := meet["date"].(string)
	inicio, errFecha := time.Parse("2006-01-02", fecha)
	if nivel == "" && errFecha != nil {
		h.Aviso = "La competición de OpenLifter no tiene fecha" + mantener
		return h
	}
	porAtleta := map[uuid.UUID]map[string]any{}
	for _, e := range entradas {
		if id, ok := entryID(e); ok {
			if a, ok := links[id]; ok {
				porAtleta[a] = e
			}
		}
	}
	type ses struct {
		fecha  string
		dia    int // by date (desk without level)
		inicio time.Time
		ats    []map[string]any
		lotes  []int
	}
	var lista []ses
	for _, d := range sn.Dias {
		f, err := time.Parse("2006-01-02", d.Fecha)
		if err != nil {
			continue
		}
		n := int(f.Sub(inicio).Hours()/24) + 1
		if nivel == "" && (n < 1 || n > dias) {
			continue
		}
		for _, x := range d.Sesiones {
			if nivel != "" && x.Prueba != "" && x.Prueba != nivel {
				continue
			}
			s := ses{fecha: d.Fecha, dia: n, inicio: x.Inicio}
			for _, a := range x.Atletas {
				if e := porAtleta[a.ID]; e != nil {
					s.ats, s.lotes = append(s.ats, e), append(s.lotes, a.Lote)
				}
			}
			if len(s.ats) > 0 {
				lista = append(lista, s)
			}
		}
	}
	sort.SliceStable(lista, func(i, j int) bool {
		if lista[i].fecha != lista[j].fecha {
			return lista[i].fecha < lista[j].fecha
		}
		return lista[i].inicio.Before(lista[j].inicio)
	})
	dia := map[string]int{} // session date → OpenLifter day (1…lengthDays; extra dates go to the last day)
	letras := map[int]int{}
	for _, s := range lista {
		if _, ok := dia[s.fecha]; !ok {
			dia[s.fecha] = min(len(dia)+1, dias)
			if nivel == "" {
				dia[s.fecha] = s.dia
			}
		}
		d := dia[s.fecha]
		flight := flightDe(letras[d])
		letras[d]++
		h.Sesiones++
		for i, e := range s.ats {
			if juzgada(e) {
				continue
			}
			e["day"], e["platform"], e["flight"], e["lot"] = d, 1, flight, s.lotes[i]
			h.Asignadas++
		}
	}
	if h.Sesiones == 0 {
		h.Aviso = "El horario publicado no tiene sesiones con atletas de esta mesa" + mantener
	}
	return h
}

func (s *Svc) registerPreparadas() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/openlifter"

	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type listaOut struct {
		Body struct {
			Meets []MeetResumen `json:"meets"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "openlifter-meets", Method: http.MethodGet, Path: base + "/meets", Summary: "Competiciones de OpenLifter preparadas en el servidor", Tags: tag, Security: bearer},
		func(ctx context.Context, in *cidIn) (*listaOut, error) {
			if _, err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT m.mesa, COALESCE(m.meet->>'name', ''), COALESCE(m.meet->>'date', ''), m.updated_at, jsonb_array_length(m.entradas),
				(SELECT count(*) FROM entradas e WHERE e.competition_id = m.competition_id AND e.mesa = m.mesa AND e.datos ? 'id'),
				(SELECT count(*) FROM entradas e WHERE e.competition_id = m.competition_id AND e.mesa = m.mesa AND e.datos ? 'id' AND e.atleta_id IS NOT NULL AND e.vinculo IN ('auto', 'confirmado'))
				FROM meets m WHERE m.competition_id = $1 ORDER BY 3, 1`, in.CID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &listaOut{}
			o.Body.Meets = []MeetResumen{}
			for rows.Next() {
				var m MeetResumen
				var preparadas, sincronizadas int
				if err := rows.Scan(&m.Mesa, &m.Nombre, &m.Fecha, &m.Actualizado, &preparadas, &sincronizadas, &m.Vinculados); err != nil {
					return nil, err
				}
				m.Atletas = preparadas
				if sincronizadas > 0 {
					m.Atletas = sincronizadas // what the desk opens (see meet)
				}
				o.Body.Meets = append(o.Body.Meets, m)
			}
			return o, rows.Err()
		})

	type meetIn struct {
		CID  uuid.UUID `path:"cid"`
		Mesa string    `query:"mesa" required:"true" minLength:"1" maxLength:"120"`
	}
	type meetOut struct{ Body MeetCompleto }
	huma.Register(api, huma.Operation{OperationID: "openlifter-meet", Method: http.MethodGet, Path: base + "/meet", Summary: "Competición de OpenLifter completa para abrirla en la mesa (setup, inscripción y horario publicado)", Tags: tag, Security: bearer},
		func(ctx context.Context, in *meetIn) (*meetOut, error) {
			if _, err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			o := &meetOut{}
			m := &o.Body
			m.Mesa = in.Mesa
			var preparadas []map[string]any
			err := s.a.DB.QueryRow(ctx, `SELECT meet, entradas FROM meets WHERE competition_id = $1 AND mesa = $2`, in.CID, in.Mesa).Scan(&m.Meet, &preparadas)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("Esa competición no está preparada en el servidor.")
			}
			if err != nil {
				return nil, err
			}
			if err := s.a.DB.QueryRow(ctx, `SELECT grupo FROM mesas WHERE competition_id = $1 AND mesa = $2`, in.CID, in.Mesa).Scan(&m.Grupo); err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT entry_id, datos, atleta_id, vinculo FROM entradas WHERE competition_id = $1 AND mesa = $2 AND datos ? 'id' ORDER BY entry_id`, in.CID, in.Mesa)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			sinc := map[int]map[string]any{}
			var orden []int
			links := map[int]uuid.UUID{}
			for rows.Next() {
				var id int
				var datos map[string]any
				var atleta *uuid.UUID
				var vinculo string
				if err := rows.Scan(&id, &datos, &atleta, &vinculo); err != nil {
					return nil, err
				}
				sinc[id] = datos
				orden = append(orden, id)
				if atleta != nil && (vinculo == "auto" || vinculo == "confirmado") {
					links[id] = *atleta
				}
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			if len(sinc) == 0 {
				m.Entradas = preparadas // never synchronised: the registration as prepared
			} else {
				// The synchronised entries are the registration (an entry deleted at the desk is gone); the
				// prepared copy fills in what the sync does not carry, in the prepared order.
				m.Entradas = make([]map[string]any, 0, len(sinc))
				usadas := map[int]bool{}
				for _, e := range preparadas {
					if id, ok := entryID(e); ok && sinc[id] != nil && !usadas[id] {
						for k, v := range sinc[id] {
							e[k] = v
						}
						m.Entradas = append(m.Entradas, e)
						usadas[id] = true
					}
				}
				for _, id := range orden {
					if !usadas[id] {
						m.Entradas = append(m.Entradas, sinc[id])
					}
				}
			}
			var sn *horarioPublicado
			if err := s.schedule.Do(ctx, http.MethodGet, "/internal/competiciones/"+in.CID.String()+"/horarios/publicados", nil, &sn); err != nil {
				s.a.Log.Warn("horarios publicados", "err", err)
				m.Horario = Horario{Aviso: "No se pudieron leer los horarios: se mantienen el día, la plataforma y el flight de la inscripción."}
			} else {
				m.Horario = asignarHorario(m.Meet, m.Entradas, links, sn, nivelMesa(in.Mesa))
			}
			s.a.Log.Info("openlifter.meet_abierto", "mesa", in.Mesa, "entradas", len(m.Entradas), "horario", m.Horario.Publicado, "asignadas", m.Horario.Asignadas)
			return o, nil
		})

	type guardarIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Mesa     string           `json:"mesa" minLength:"1" maxLength:"120"`
			Meet     map[string]any   `json:"meet" doc:"«meet» de OpenLifter"`
			Entradas []map[string]any `json:"entradas" maxItems:"1000" doc:"Inscripción preparada (entradas completas de OpenLifter)"`
		}
	}
	type guardarOut struct{ Body MeetResumen }
	huma.Register(api, huma.Operation{OperationID: "openlifter-meet-guardar", Method: http.MethodPut, Path: base + "/meet", Summary: "Guardar en el servidor el setup y la inscripción preparada de una competición de OpenLifter", Tags: tag, Security: bearer, MaxBodyBytes: 4 << 20},
		func(ctx context.Context, in *guardarIn) (*guardarOut, error) {
			por, err := operar(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			b := in.Body
			if len(b.Meet) == 0 {
				return nil, problem.Unprocessable("MEET_VACIO", "Falta el setup de la competición («meet»).")
			}
			if b.Entradas == nil {
				b.Entradas = []map[string]any{}
			}
			for _, e := range b.Entradas {
				if _, ok := entryID(e); !ok {
					return nil, problem.Unprocessable("ENTRADA_SIN_ID", "Cada entrada necesita su «id» de OpenLifter.")
				}
			}
			o := &guardarOut{}
			o.Body.Mesa, o.Body.Atletas = b.Mesa, len(b.Entradas)
			o.Body.Nombre, _ = b.Meet["name"].(string)
			o.Body.Fecha, _ = b.Meet["date"].(string)
			if err := s.a.DB.QueryRow(ctx, `INSERT INTO meets (competition_id, mesa, meet, entradas, por) VALUES ($1,$2,$3,$4,$5)
				ON CONFLICT (competition_id, mesa) DO UPDATE SET meet = $3, entradas = $4, por = $5, updated_at = now() RETURNING updated_at`,
				in.CID, b.Mesa, b.Meet, b.Entradas, por).Scan(&o.Body.Actualizado); err != nil {
				return nil, err
			}
			s.a.Log.Info("openlifter.meet_guardado", "mesa", b.Mesa, "entradas", len(b.Entradas))
			return o, nil
		})
}

// guardarSetup keeps the server copy of the meet setup in step with the desk (sync with «meet»).
func guardarSetup(ctx context.Context, tx pgx.Tx, cid uuid.UUID, mesa, por string, meet map[string]any) error {
	_, err := tx.Exec(ctx, `INSERT INTO meets (competition_id, mesa, meet, por) VALUES ($1,$2,$3,$4)
		ON CONFLICT (competition_id, mesa) DO UPDATE SET meet = $3, por = $4, updated_at = now()`, cid, mesa, meet, por)
	return err
}
