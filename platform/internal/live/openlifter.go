package live

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
)

// The OpenLifter desk (openlifter service) is the source of truth of the weights and of good / no lift while it
// runs the competition: it sends the state it has, and live reconciles its attempts with it. It emits the same
// events as the backoffice desk, so /en-directo, /horarios, the arena screen and the backoffice follow it by SSE.
//
// Rules:
//   - an attempt OpenLifter has (weight > 0) and live has not: created, judged if OpenLifter judged it;
//   - pending in live: OpenLifter's weight and result win;
//   - judged in live with another result or weight: corrected, with «OpenLifter» as the reason (audit);
//   - judged in live and pending in OpenLifter (lights entered first from another device): kept;
//   - live never deletes an attempt because OpenLifter has none: the next attempt may just not be declared yet.
//
// OpenLifter only knows good / no lift: the lights (votos) stay empty unless they came from the judges.

// IntentoOL is an attempt as the OpenLifter desk has it.
type IntentoOL struct {
	Movimiento string  `json:"movimiento" enum:"sq,bp,dl"`
	Numero     int     `json:"numero" minimum:"1" maximum:"3"`
	Peso       float64 `json:"peso" minimum:"0" maximum:"600"`
	Resultado  string  `json:"resultado" enum:"pendiente,valido,nulo"`
}

// AtletaOL is an athlete's attempts on the OpenLifter desk.
type AtletaOL struct {
	AtletaID uuid.UUID   `json:"atletaId"`
	Intentos []IntentoOL `json:"intentos" maxItems:"9"`
}

// SyncOL is what the openlifter service sends.
type SyncOL struct {
	Por    string `json:"por" maxLength:"120" doc:"Quién opera la mesa (auditoría)"`
	Estado *struct {
		Atletas    []uuid.UUID `json:"atletas" maxItems:"100" doc:"Atletas del grupo que la mesa tiene en pantalla: el flight en directo es el suyo"`
		Movimiento string      `json:"movimiento" enum:"sq,bp,dl"`
	} `json:"estado,omitempty" doc:"Grupo y movimiento que la mesa tiene en pantalla (solo cuando ya ha juzgado algún intento de ese grupo)"`
	Atletas []AtletaOL `json:"atletas" maxItems:"500"`
}

// AvisoOL is something that could not be applied.
type AvisoOL struct {
	AtletaID uuid.UUID `json:"atletaId,omitempty"`
	Mensaje  string    `json:"mensaje"`
}

// ResultadoSyncOL counts what changed.
type ResultadoSyncOL struct {
	Intentos     int       `json:"intentos" doc:"Intentos creados o con el peso cambiado"`
	Veredictos   int       `json:"veredictos"`
	Correcciones int       `json:"correcciones"`
	Estado       bool      `json:"estado" doc:"Cambió el flight o el movimiento en directo"`
	Avisos       []AvisoOL `json:"avisos"`
}

func (s *Svc) registerOpenLifter() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body SyncOL
	}
	type out struct{ Body ResultadoSyncOL }
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-directo-openlifter", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/directo/openlifter",
		Summary: "Estado de la mesa de OpenLifter (solo openlifter)", Tags: []string{"Interno"}, Hidden: true, MaxBodyBytes: 2 << 20},
		func(ctx context.Context, x *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			r, err := s.syncOpenLifter(ctx, x.CID, x.Body)
			if err != nil {
				return nil, err
			}
			return &out{Body: r}, nil
		})
}

func (s *Svc) syncOpenLifter(ctx context.Context, cid uuid.UUID, b SyncOL) (ResultadoSyncOL, error) {
	res := ResultadoSyncOL{Avisos: []AvisoOL{}}
	por := strings.TrimSpace(b.Por)
	if por == "" {
		por = "OpenLifter"
	}
	p, err := s.cargarPlan(ctx, cid)
	if err != nil {
		return res, err
	}
	var f *flight
	if b.Estado != nil {
		// OpenLifter groups its own flights: the live flight is the published one most of the group's athletes are in.
		votos := map[uuid.UUID]int{}
		for _, id := range b.Estado.Atletas {
			if a := p.Atletas[id]; a != nil && a.Flight != uuid.Nil {
				votos[a.Flight]++
				if f == nil || votos[a.Flight] > votos[f.ID] {
					f = p.flight(a.Flight)
				}
			}
		}
	}
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		res = ResultadoSyncOL{Avisos: []AvisoOL{}}
		e, err := s.estado(ctx, tx, cid, true)
		if err != nil {
			return err
		}
		t, err := cargarIntentos(ctx, tx, cid)
		if err != nil {
			return err
		}
		for _, x := range b.Atletas {
			a := p.Atletas[x.AtletaID]
			if a == nil || a.Flight == uuid.Nil {
				res.Avisos = append(res.Avisos, AvisoOL{x.AtletaID, "No está en los horarios publicados: sus intentos no salen en el directo."})
				continue
			}
			for _, it := range x.Intentos {
				if it.Peso <= 0 {
					continue
				}
				if err := s.reconciliar(ctx, tx, cid, a, t.get(a.ID, it.Movimiento, it.Numero), it, por, &res); err != nil {
					return err
				}
			}
		}
		if res.Veredictos > 0 {
			if _, err := tx.Exec(ctx, `UPDATE estado SET turno_at = now() WHERE competition_id = $1`, cid); err != nil {
				return err
			}
		}
		if f == nil || (e.Fase == "en_directo" && eqID(e.FlightID, &f.ID) && e.Movimiento == b.Estado.Movimiento) {
			return nil
		}
		// The desk moved to another flight or lift: the live follows it (same events as Directo › estado).
		res.Estado = true
		if err := abrir(ctx, tx, cid, p, f, b.Estado.Movimiento); err != nil {
			return err
		}
		retraso := e.RetrasoMin
		if e.FlightID != nil {
			if prev := p.flight(*e.FlightID); prev != nil && prev.Dia != f.Dia {
				retraso = 0 // a new day starts on time
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE estado SET fase = 'en_directo', flight_id = $2, movimiento = $3, pausa = false, retraso_min = $4, turno_at = now(),
			version = version + 1, updated_at = now() WHERE competition_id = $1`, cid, f.ID, b.Estado.Movimiento, retraso); err != nil {
			return err
		}
		d := map[string]any{"fase": "en_directo", "movimiento": b.Estado.Movimiento, "pausa": false, "retrasoMin": retraso, "flightId": f.ID, "flight": f.Codigo}
		sub := "flight " + f.Codigo
		if err := evento(ctx, tx, cid, "directo.estado", d, events.Subject(sub)); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "directo.cambio", map[string]any{"antes": map[string]any{"fase": e.Fase, "pausa": e.Pausa, "retrasoMin": e.RetrasoMin},
			"despues": d, "por": por}, events.Competition(cid.String()), events.ForPermission("directo.operar"), events.Subject(sub)))
	})
	if err != nil {
		return res, err
	}
	if b.Estado != nil && f == nil {
		res.Avisos = append(res.Avisos, AvisoOL{Mensaje: "Ningún atleta del grupo en pantalla está en los horarios publicados: el directo no cambia de flight."})
	}
	if res.Intentos+res.Veredictos+res.Correcciones > 0 || res.Estado {
		s.bump(ctx, cid)
		if p, err := s.cargarPlan(ctx, cid); err == nil {
			if t, err := cargarIntentos(ctx, s.a.DB, cid); err == nil {
				if e, err := s.estadoLeer(ctx, cid); err == nil {
					s.sincronizarHorarios(ctx, cid, p, e, t)
					s.publicarAuto(ctx, cid, p, t, e)
				}
			}
		}
	}
	return res, nil
}

// reconciliar applies one OpenLifter attempt to live (see the rules above).
func (s *Svc) reconciliar(ctx context.Context, tx pgx.Tx, cid uuid.UUID, a *atleta, cur *intento, it IntentoOL, por string, res *ResultadoSyncOL) error {
	peso := float64(int64(it.Peso*10+0.5)) / 10 // numeric(5,1)
	juzgar := it.Resultado == "valido" || it.Resultado == "nulo"
	veredicto := func(fl uuid.UUID, votos string) error {
		res.Veredictos++
		return evento(ctx, tx, cid, "directo.veredicto", map[string]any{"flightId": fl, "movimiento": it.Movimiento, "numero": it.Numero, "peso": peso,
			"votos": votos, "resultado": it.Resultado})
	}
	switch {
	case cur == nil:
		if _, err := tx.Exec(ctx, `INSERT INTO intentos (id, competition_id, atleta_id, flight_id, movimiento, numero, peso, resultado, juzgado_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'pendiente' THEN NULL ELSE now() END)
			ON CONFLICT (competition_id, atleta_id, movimiento, numero) DO NOTHING`, newID(), cid, a.ID, a.Flight, it.Movimiento, it.Numero, peso, it.Resultado); err != nil {
			return err
		}
		res.Intentos++
		if err := evento(ctx, tx, cid, "directo.intento", map[string]any{"flightId": a.Flight, "movimiento": it.Movimiento, "numero": it.Numero, "peso": peso}); err != nil {
			return err
		}
		if juzgar {
			return veredicto(a.Flight, "")
		}
		return nil

	case cur.Resultado == "pendiente":
		if cur.Peso != peso {
			if _, err := tx.Exec(ctx, `UPDATE intentos SET peso = $2, updated_at = now() WHERE id = $1`, cur.ID, peso); err != nil {
				return err
			}
			res.Intentos++
			if err := evento(ctx, tx, cid, "directo.intento", map[string]any{"flightId": cur.FlightID, "movimiento": it.Movimiento, "numero": it.Numero, "peso": peso}); err != nil {
				return err
			}
		}
		if !juzgar {
			return nil
		}
		if _, err := tx.Exec(ctx, `UPDATE intentos SET resultado = $2, juzgado_at = now(), updated_at = now() WHERE id = $1`, cur.ID, it.Resultado); err != nil {
			return err
		}
		return veredicto(cur.FlightID, cur.Votos)

	case !juzgar: // judged in live (judges' lights), still pending in OpenLifter: live keeps it
		return nil

	case cur.Resultado == it.Resultado && cur.Peso == peso:
		return nil
	}

	// Judged in both with a different result or weight: OpenLifter's desk corrects it.
	votos := cur.Votos
	if votos != "" && (strings.Count(votos, "B") >= 2) != (it.Resultado == "valido") {
		votos = "" // the lights no longer match the decision
	}
	motivo := "Cambiado en la mesa de OpenLifter"
	if _, err := tx.Exec(ctx, `UPDATE intentos SET votos = $2, resultado = $3, peso = $4, corregido_por = $5, motivo = $6, updated_at = now() WHERE id = $1`,
		cur.ID, votos, it.Resultado, peso, por, motivo); err != nil {
		return err
	}
	res.Correcciones++
	if err := evento(ctx, tx, cid, "directo.correccion", map[string]any{"flightId": cur.FlightID, "movimiento": it.Movimiento, "numero": it.Numero}); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "directo.correccion_registrada", map[string]any{"intentoId": cur.ID, "movimiento": movNombre[it.Movimiento], "numero": it.Numero,
		"antes": map[string]any{"resultado": cur.Resultado, "votos": cur.Votos, "peso": cur.Peso}, "despues": map[string]any{"resultado": it.Resultado, "votos": votos, "peso": peso},
		"motivo": motivo, "por": por}, events.Competition(cid.String()), events.ForPermission("directo.operar"), events.Subject("intento:"+cur.ID.String())))
}
