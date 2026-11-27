package athletes

// BIZ-211 · «Padrón AEP» en la ficha del atleta y en la revisión de una solicitud: el equipo confirma, descarta o
// cambia la fila del padrón que propone el emparejamiento, y puede volver a intentarlo con la IA.
//
// A candidate is never thrown away: a slow or failing model, or a low confidence, leaves the row as «parcial» with its
// reason and the team answers. Confirming does exactly what an automatic match does today (a request still pending is
// approved — athlete created or linked, notices sent —, the row is linked, the athlete takes its class and level and the
// OpenLifter entry of the desk is linked). Every answer is written in emparejamientos_log with origen «staff».

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// EmparejamientoAtleta is the matching of an athlete with the roll: the last decision of the request that produced it
// (or the link already made), the row it points at and the history.
type EmparejamientoAtleta struct {
	Emparejamiento
	// SolicitudID is the request the athlete came from: «reintentar» and the history hang from it (nil without one).
	SolicitudID *uuid.UUID `json:"solicitudId,omitempty"`
}

// solicitudDeAtleta returns the last «alta» request that ended in this athlete (nil when it was added by hand or from
// the acta).
func (s *Svc) solicitudDeAtleta(ctx context.Context, cid, atleta uuid.UUID) (*uuid.UUID, error) {
	var id uuid.UUID
	err := s.a.DB.QueryRow(ctx, `SELECT id FROM solicitudes_atleta WHERE competition_id = $1 AND match_atleta_id = $2 AND tipo = 'alta'
		ORDER BY created_at DESC LIMIT 1`, cid, atleta).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// leerPadronAtleta reads the matching of an athlete. The link wins: a row already pointing at the athlete is the
// answer, whatever a later failed attempt said.
func (s *Svc) leerPadronAtleta(ctx context.Context, cid, atleta uuid.UUID) (EmparejamientoAtleta, error) {
	if _, err := getRow(ctx, s.a.DB, cid, atleta); err != nil {
		return EmparejamientoAtleta{}, err
	}
	out := EmparejamientoAtleta{}
	var e Emparejamiento
	var det []byte
	var conf *float32
	var insc *uuid.UUID
	var solID *uuid.UUID
	var estado, origen string
	err := s.a.DB.QueryRow(ctx, `SELECT id, padron_estado, padron_origen, padron_confianza, padron_inscripcion_id, padron_detalle
		FROM solicitudes_atleta WHERE competition_id = $1 AND match_atleta_id = $2 AND tipo = 'alta'
		ORDER BY (padron_estado <> '') DESC, created_at DESC LIMIT 1`, cid, atleta).
		Scan(&solID, &estado, &origen, &conf, &insc, &det)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}
	if err == nil {
		e.Estado, e.Origen = estado, origen
	}
	var enlace uuid.UUID
	var estadoEnlace string
	switch err := s.a.DB.QueryRow(ctx, `SELECT id, estado_enlace FROM inscripciones_aep WHERE competition_id = $1 AND atleta_id = $2
		AND estado_enlace <> 'rechazado' LIMIT 1`, cid, atleta).Scan(&enlace, &estadoEnlace); {
	case err == nil:
		e.Estado, e.Origen = "confirmada", "staff"
		if estadoEnlace == "auto" {
			e.Estado, e.Origen = "auto", "exacto"
		}
		if insc == nil {
			insc = &enlace
		}
	case !errors.Is(err, pgx.ErrNoRows):
		return out, err
	}
	out.SolicitudID = solID
	e, err = s.leerDetalle(ctx, e, conf, insc, det, `atleta_id = $1 OR solicitud_id = $2`, atleta, solID)
	out.Emparejamiento = e
	return out, err
}

// conflictoEdicion is the answer of a request already read with another version.
func conflictoEdicion(ifm string, version int) error {
	if ifm != "" && ifMatch(ifm) != version {
		return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha revisado esta solicitud mientras la tenías abierta. Recarga para ver sus cambios.")
	}
	return nil
}

// conflictoEdicionAtleta is the answer of a record already saved with another version (412, as the requests do).
func conflictoEdicionAtleta() error {
	return problem.New(http.StatusPreconditionFailed, "CONFLICTO_EDICION",
		"Otra persona ha guardado esta ficha mientras la veías. Recarga para ver sus cambios.")
}

// bloqueaAtleta locks the record and checks the version the panel holds.
func (s *Svc) bloqueaAtleta(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID, ifm string) error {
	r, err := s.lock(ctx, tx, cid, atleta, "")
	if err != nil {
		return err
	}
	if ifm != "" && ifMatch(ifm) != r.Version {
		return conflictoEdicionAtleta()
	}
	return nil
}

// panelRevision is where the answer of the team comes from: the review panel of a request (its If-Match) or the record
// of an athlete (the record's If-Match). The request is always locked first, then the record, so two panels never take
// the same two locks in a different order.
type panelRevision struct {
	// Atleta is the record the answer was made from (nil: the review panel of the request).
	Atleta  *uuid.UUID
	IfMatch string
}

// candidatura is the proposal the team is confirming: the row compared with the request, its differences and the
// confidence of the matching that proposed it (the name score when nothing better was stored).
func (s *Svc) candidatura(ctx context.Context, cid uuid.UUID, sol solEmp, fila *LifterPadron, prev *float64) (candidato, DetalleEmparejamiento, float64) {
	cand := candidato{personaIA: personaIA{ID: fila.ID.String(), Nombre: fila.Nombre, Apellidos: fila.Apellidos, Sexo: fila.Sexo, Anio: fila.Anio,
		Club: fila.Club, Division: fila.Division, Categoria: fila.Categoria, Nivel: fila.Nivel}, uuid: fila.ID, lifterID: fila.LifterID,
		atletaID: fila.AtletaID, score: puntuar(sol.Nombre, sol.Apellidos, fila.Nombre, fila.Apellidos)}
	det := DetalleEmparejamiento{Coincide: map[string]bool{}, NivelAEP: []string{fila.Nivel}, NotasIA: []string{},
		Discrepancias: compararPadron(sol, cand, s.compYear(ctx, cid))}
	conf := cand.score
	if prev != nil {
		conf = *prev
	}
	return cand, det, conf
}

// confirmarPadron links the row the team confirms. A request still pending is approved exactly as an automatic match
// would do; a closed one takes the link on the athlete it produced. Both answer under the row lock of the request (and
// of the record when the answer comes from the record): a second panel that read another version loses with 412.
func (s *Svc) confirmarPadron(ctx context.Context, cid, solID, insc uuid.UUID, p panelRevision, por string) error {
	sol, err := s.cargarSolEmp(ctx, cid, solID)
	if err != nil {
		return err
	}
	if sol.Estado == "pendiente" || sol.Estado == "revision" {
		ifm := p.IfMatch
		if p.Atleta != nil {
			ifm = "" // the record's panel holds the record's version, not the request's
		}
		if err := conflictoEdicion(ifm, sol.Version); err != nil {
			return err
		}
		fila, err := s.filaPadron(ctx, insc)
		if err != nil {
			return problem.NotFound("Esa fila del padrón no existe: puede que se haya vuelto a importar la lista.")
		}
		var prev *float64
		if e, err := s.leerEmparejamiento(ctx, cid, solID); err == nil {
			prev = e.Confianza
		}
		cand, det, conf := s.candidatura(ctx, cid, sol, fila, prev)
		if motivo := s.puedeAutoAprobar(sol, &cand); motivo != "" {
			return problem.Unprocessable("NO_CONFIRMABLE", motivo)
		}
		det.Motivo = motivoConfirmado(por, det)
		// The approval locks the request and checks the If-Match on its own (apruebaSolicitud).
		if _, err := s.aplicarAuto(ctx, cid, sol, &cand, "manual", por, ifm); err != nil {
			return err
		}
		return s.guardarDecision(ctx, cid, decisionEmparejamiento{Solicitud: sol, AtletaID: sol.MatchAtletaID, Candidato: &cand, Decision: "confirmada",
			Origen: "staff", Confianza: &conf, Detalle: det, Entrada: map[string]any{"fila": insc}, Por: por})
	}
	return s.confirmarCerrada(ctx, cid, solID, insc, p, por)
}

// confirmarCerrada confirms the row of a request that is already reviewed: one transaction takes the lock of the
// request (and of the record, if the answer comes from the record), links the row and writes the decision.
func (s *Svc) confirmarCerrada(ctx context.Context, cid, solID, insc uuid.UUID, p panelRevision, por string) error {
	var nivel string
	var lifter *int
	var atleta uuid.UUID
	err := s.change(ctx, cid, "", nil, func(tx pgx.Tx) error {
		sol, err := s.bloqueaYLee(ctx, tx, cid, solID, p)
		if err != nil {
			return err
		}
		if sol.MatchAtletaID == nil {
			return problem.Unprocessable("SIN_ATLETA", "La solicitud no tiene atleta enlazado: aprueba primero el alta.")
		}
		atleta = *sol.MatchAtletaID
		fila, err := s.filaPadron(ctx, insc)
		if err != nil {
			return problem.NotFound("Esa fila del padrón no existe: puede que se haya vuelto a importar la lista.")
		}
		var prev *float64
		if err := tx.QueryRow(ctx, `SELECT padron_confianza::float8 FROM solicitudes_atleta WHERE id = $1`, solID).Scan(&prev); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		cand, det, conf := s.candidatura(ctx, cid, sol, fila, prev)
		det.Motivo = motivoConfirmado(por, det)
		if nivel, lifter, err = enlazarPadronTx(ctx, tx, cid, insc, atleta, "manual", por); err != nil {
			return err
		}
		return guardarDecisionTx(ctx, tx, cid, decisionEmparejamiento{Solicitud: sol, AtletaID: &atleta, Candidato: &cand, Decision: "confirmada",
			Origen: "staff", Confianza: &conf, Detalle: det, Entrada: map[string]any{"fila": insc}, Por: por})
	})
	if err != nil {
		return err
	}
	s.vinculoOpenLifter(ctx, cid, nivel, lifter, atleta, por)
	return nil
}

// motivoConfirmado is the reason stored with a confirmation, naming who answered (the panel shows it as is).
func motivoConfirmado(por string, det DetalleEmparejamiento) string {
	if por == "" {
		por = "El equipo"
	}
	m := "Confirmado por " + por + ": es la misma persona del padrón AEP."
	if len(det.Discrepancias) > 0 {
		m += " Diferencias: " + diferenciasTexto(det.Discrepancias) + "."
	}
	return m
}

// descartarPadron says «no es esta persona»: the proposal is cleared, nothing is approved and the row goes back to the
// queue of the roll. It answers under the same locks as a confirmation.
func (s *Svc) descartarPadron(ctx context.Context, cid, solID uuid.UUID, p panelRevision, por string) error {
	return s.change(ctx, cid, "", nil, func(tx pgx.Tx) error {
		sol, err := s.bloqueaYLee(ctx, tx, cid, solID, p)
		if err != nil {
			return err
		}
		var insc *uuid.UUID
		var conf *float64
		var det []byte
		if err := tx.QueryRow(ctx, `SELECT padron_inscripcion_id, padron_confianza::float8, padron_detalle FROM solicitudes_atleta WHERE id = $1`,
			solID).Scan(&insc, &conf, &det); err != nil {
			return err
		}
		if insc != nil {
			// The row returns to the queue of the roll (an automatic match is never undone from here).
			if _, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET atleta_id = NULL, estado_enlace = 'pendiente', updated_at = now()
				WHERE competition_id = $1 AND id = $2 AND estado_enlace <> 'auto'`, cid, *insc); err != nil {
				return err
			}
		}
		var d DetalleEmparejamiento
		_ = json.Unmarshal(det, &d)
		d.Motivo = motivoDescartado(por)
		return guardarDecisionTx(ctx, tx, cid, decisionEmparejamiento{Solicitud: sol, AtletaID: sol.MatchAtletaID, Decision: "descartada", Origen: "staff",
			Confianza: conf, Detalle: d, Por: por})
	})
}

// motivoDescartado is the reason stored with a discarded proposal.
func motivoDescartado(por string) string {
	if por == "" {
		por = "El equipo"
	}
	return "Descartada por " + por + ": no es la misma persona del padrón."
}

// bloqueaYLee locks the request (checking the If-Match the panel holds) and, when the answer comes from a record, the
// record too. The request always goes first: every path takes the two locks in the same order.
func (s *Svc) bloqueaYLee(ctx context.Context, tx pgx.Tx, cid, solID uuid.UUID, p panelRevision) (solEmp, error) {
	ifm := p.IfMatch
	if p.Atleta != nil {
		// The version the record's panel holds is not the request's: the record is the one checked.
		ifm = ""
	}
	sol, err := s.lockSolicitud(ctx, tx, cid, solID, ifm)
	if err != nil {
		return solEmp{}, err
	}
	if p.Atleta != nil {
		if sol.MatchAtletaID == nil || *sol.MatchAtletaID != *p.Atleta {
			return solEmp{}, problem.Conflict("CONFLICTO_EDICION", "Esa ficha ya no es la de esta solicitud: recarga la ficha antes de contestar.")
		}
		if err := s.bloqueaAtleta(ctx, tx, cid, *p.Atleta, p.IfMatch); err != nil {
			return solEmp{}, err
		}
	}
	return solEmpDe(ctx, tx, sol)
}

// confirmarPadronAtleta answers «sí es esta fila» from the record: the decision is written on the request that produced
// the athlete, or on the athlete itself when it was added by hand.
func (s *Svc) confirmarPadronAtleta(ctx context.Context, cid, atleta, insc uuid.UUID, ifm, por string) error {
	if solID, err := s.solicitudDeAtleta(ctx, cid, atleta); err != nil {
		return err
	} else if solID != nil {
		return s.confirmarPadron(ctx, cid, *solID, insc, panelRevision{Atleta: &atleta, IfMatch: ifm}, por)
	}
	var nivel string
	var lifter *int
	err := s.change(ctx, cid, "athletes.atleta_actualizado", map[string]any{"id": atleta}, func(tx pgx.Tx) error {
		if err := s.bloqueaAtleta(ctx, tx, cid, atleta, ifm); err != nil {
			return err
		}
		var err error
		if nivel, lifter, err = enlazarPadronTx(ctx, tx, cid, insc, atleta, "manual", por); err != nil {
			return err
		}
		return logEmparejamiento(ctx, tx, cid, nil, &atleta, &insc, "confirmada", "staff", nil, []byte(`{}`), []byte(`{}`),
			[]byte(`[]`), "", por)
	})
	if err != nil {
		return err
	}
	s.vinculoOpenLifter(ctx, cid, nivel, lifter, atleta, por)
	return nil
}

// descartarPadronAtleta clears the proposal of an athlete added by hand (the log is written on the athlete).
func (s *Svc) descartarPadronAtleta(ctx context.Context, cid, atleta uuid.UUID, ifm, por string) error {
	if solID, err := s.solicitudDeAtleta(ctx, cid, atleta); err != nil {
		return err
	} else if solID != nil {
		return s.descartarPadron(ctx, cid, *solID, panelRevision{Atleta: &atleta, IfMatch: ifm}, por)
	}
	return s.change(ctx, cid, "athletes.atleta_actualizado", map[string]any{"id": atleta}, func(tx pgx.Tx) error {
		if err := s.bloqueaAtleta(ctx, tx, cid, atleta, ifm); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE atletas SET version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`,
			cid, atleta); err != nil {
			return err
		}
		return logEmparejamiento(ctx, tx, cid, nil, &atleta, nil, "descartada", "staff", nil, []byte(`{}`), []byte(`{}`),
			[]byte(`[]`), "", por)
	})
}

// reintentarSolicitud runs the matching of one request again (the model gets another chance). It answers when the
// model does or when its time is up, so the panel can wait with a loading state.
func (s *Svc) reintentarSolicitud(ctx context.Context, cid, solID uuid.UUID) error {
	if n, _ := s.a.Redis.Exists(ctx, s.a.Keys.Of("athletes", "emparejando", solID.String())).Result(); n > 0 {
		return problem.Conflict("EMPAREJANDO", "Ya se está emparejando esta solicitud: espera unos segundos y vuelve a intentarlo.")
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	_, err := s.emparejar(ctx, cid, solID, true)
	return err
}

// reintentarPadron repeats the matching of the request the athlete came from.
func (s *Svc) reintentarPadron(ctx context.Context, cid, atleta uuid.UUID) error {
	solID, err := s.solicitudDeAtleta(ctx, cid, atleta)
	if err != nil {
		return err
	}
	if solID == nil {
		return problem.Unprocessable("SIN_SOLICITUD", "Este atleta no viene de una solicitud de alta: elige la fila del padrón a mano.")
	}
	return s.reintentarSolicitud(ctx, cid, *solID)
}

func (s *Svc) registerPadronEquipo() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/atletas"

	type padronOut struct{ Body EmparejamientoAtleta }
	type empOut struct{ Body Emparejamiento }

	// ---- the athlete record ----
	//
	// /atletas/padron/{id} (the athlete first would be /atletas/{id}/padron, but Go's router cannot tell it apart from
	// /atletas/historial/{id} and panics at start-up: /atletas/{id}/padron/confirmar is ambiguous with
	// /atletas/importaciones/{id}/confirmar in the same way). The roll itself lives in /atletas/padron-aep.
	pbase := base + "/padron"
	huma.Register(api, huma.Operation{OperationID: "atleta-padron", Method: http.MethodGet, Path: pbase + "/{id}",
		Summary: "Coincidencia de un atleta con el padrón AEP (estado, fila y registro)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*padronOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			e, err := s.leerPadronAtleta(ctx, in.CID, in.ID)
			return &padronOut{Body: e}, err
		})

	// The confirmation carries the row the team chose; discarding carries nothing (a required body made the endpoint
	// answer 422 «body es obligatorio» with an empty one, which is exactly what the button sends).
	type padronIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			InscripcionID uuid.UUID `json:"inscripcionId" doc:"Fila del padrón que se confirma"`
		}
	}
	type padronSinCuerpoIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
	}
	huma.Register(api, huma.Operation{OperationID: "atleta-padron-confirmar", Method: http.MethodPost, Path: pbase + "/{id}/confirmar",
		Summary: "Confirmar la fila del padrón AEP de un atleta (enlaza la fila y la entrada de OpenLifter)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *padronIn) (*padronOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if in.Body.InscripcionID == uuid.Nil {
				return nil, problem.Unprocessable("INSCRIPCION_OBLIGATORIA", "Elige la fila del padrón que corresponde al atleta.")
			}
			if err := s.confirmarPadronAtleta(ctx, in.CID, in.ID, in.Body.InscripcionID, in.IfMatch, actor(ctx)); err != nil {
				return nil, err
			}
			e, err := s.leerPadronAtleta(ctx, in.CID, in.ID)
			return &padronOut{Body: e}, err
		})

	huma.Register(api, huma.Operation{OperationID: "atleta-padron-descartar", Method: http.MethodPost, Path: pbase + "/{id}/descartar",
		Summary: "Descartar la coincidencia propuesta con el padrón AEP", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *padronSinCuerpoIn) (*padronOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := s.descartarPadronAtleta(ctx, in.CID, in.ID, in.IfMatch, actor(ctx)); err != nil {
				return nil, err
			}
			e, err := s.leerPadronAtleta(ctx, in.CID, in.ID)
			return &padronOut{Body: e}, err
		})

	huma.Register(api, huma.Operation{OperationID: "atleta-padron-reintentar", Method: http.MethodPost, Path: pbase + "/{id}/reintentar",
		Summary: "Volver a emparejar con el padrón AEP el atleta (la IA responde o se agota su tiempo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*padronOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := s.reintentarPadron(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			e, err := s.leerPadronAtleta(ctx, in.CID, in.ID)
			return &padronOut{Body: e}, err
		})

	// ---- the review panel of a request ----

	sbase := base + "/solicitudes"
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-padron-confirmar", Method: http.MethodPost, Path: sbase + "/{id}/padron/confirmar",
		Summary: "Confirmar la fila del padrón AEP de una solicitud (la aprueba si sigue pendiente, como el emparejamiento automático)",
		Tags:    tagAdmin, Security: bearer},
		func(ctx context.Context, in *padronIn) (*empOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if in.Body.InscripcionID == uuid.Nil {
				return nil, problem.Unprocessable("INSCRIPCION_OBLIGATORIA", "Elige la fila del padrón que corresponde a la solicitud.")
			}
			if err := s.confirmarPadron(ctx, in.CID, in.ID, in.Body.InscripcionID, panelRevision{IfMatch: in.IfMatch}, actor(ctx)); err != nil {
				return nil, err
			}
			e, err := s.leerEmparejamiento(ctx, in.CID, in.ID)
			return &empOut{Body: e}, err
		})

	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-padron-descartar", Method: http.MethodPost, Path: sbase + "/{id}/padron/descartar",
		Summary: "Descartar la fila del padrón AEP propuesta a una solicitud", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *padronSinCuerpoIn) (*empOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := s.descartarPadron(ctx, in.CID, in.ID, panelRevision{IfMatch: in.IfMatch}, actor(ctx)); err != nil {
				return nil, err
			}
			e, err := s.leerEmparejamiento(ctx, in.CID, in.ID)
			return &empOut{Body: e}, err
		})

	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-padron-reintentar", Method: http.MethodPost, Path: sbase + "/{id}/padron/reintentar",
		Summary: "Volver a emparejar con la IA la solicitud (responde cuando la IA contesta o se agota su tiempo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*empOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := s.reintentarSolicitud(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			e, err := s.leerEmparejamiento(ctx, in.CID, in.ID)
			return &empOut{Body: e}, err
		})
}
