package cms

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// ordenRoles is the order of the roles in the backoffice; objetivoPorDefecto, the people each role needs until the organiser
// sets its own numbers (Figma 68: 6 judges, 10 loaders, 2 at the scoring table, 2 for photo and video, 4 for accreditation).
var ordenRoles = []string{"jueces", "cargadores", "mesa", "foto", "acreditaciones"}
var objetivoPorDefecto = map[string]int{"jueces": 6, "cargadores": 10, "mesa": 2, "foto": 2, "acreditaciones": 4}

// Puesto is a volunteer role with its target number of people.
type Puesto struct {
	Rol      string `json:"rol"`
	Nombre   string `json:"nombre"`
	Objetivo int    `json:"objetivo" minimum:"0" maximum:"200"`
}

func (s *Svc) puestos(ctx context.Context, cid uuid.UUID) ([]Puesto, error) {
	obj := map[string]int{}
	rows, err := s.a.DB.Query(ctx, `SELECT rol, objetivo FROM voluntario_puestos WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var r string
		var n int
		if err := rows.Scan(&r, &n); err != nil {
			return nil, err
		}
		obj[r] = n
	}
	out := make([]Puesto, 0, len(ordenRoles))
	for _, r := range ordenRoles {
		n, ok := obj[r]
		if !ok {
			n = objetivoPorDefecto[r]
		}
		out = append(out, Puesto{Rol: r, Nombre: rolesVoluntario[r], Objetivo: n})
	}
	return out, rows.Err()
}

// registerVoluntariosAdmin: Backoffice › Voluntarios (Figma page 68). Accept a request with a role, shift and person in
// charge (welcome email), turn it down with a reason (optional email), mark it «en revisión», and the target per role.
// The list, notes, the guardian's authorisation and deletion go through the generic «voluntarios» collection.
func (s *Svc) registerVoluntariosAdmin() {
	api := s.a.API
	tags := []string{"Web y contenidos"}
	base := "/api/admin/competiciones/{cid}/voluntarios"
	type vol struct {
		nombre, email, estado, autorizacion string
		menor                               bool
	}
	leer := func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID) (vol, error) {
		var v vol
		err := tx.QueryRow(ctx, `SELECT nombre, email::text, estado, autorizacion_url, es_menor FROM voluntarios WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id).
			Scan(&v.nombre, &v.email, &v.estado, &v.autorizacion, &v.menor)
		if err == pgx.ErrNoRows {
			return v, problem.NotFound("Esa solicitud no existe.")
		}
		return v, err
	}
	nombreCorto := func(n string) string {
		if f := strings.Fields(n); len(f) > 0 {
			return f[0]
		}
		return n
	}

	type aceptarIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Puesto      string `json:"puesto" enum:"jueces,cargadores,mesa,foto,acreditaciones"`
			Turno       string `json:"turno" minLength:"2" maxLength:"80"`
			Responsable string `json:"responsable,omitempty" maxLength:"80"`
			Notas       string `json:"notas,omitempty" maxLength:"1000"`
			Avisar      bool   `json:"avisar" doc:"Email de bienvenida con el puesto, el turno y quién le coordina"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "voluntarios-aceptar", Method: http.MethodPost, Path: base + "/{id}/aceptar", Summary: "Aceptar a un voluntario y asignarle puesto y turno", Tags: tags, Security: bearer},
		func(ctx context.Context, in *aceptarIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "web.editar")
			if err != nil {
				return nil, err
			}
			b := in.Body
			trimAll(&b.Turno, &b.Responsable, &b.Notas)
			var v vol
			err = s.change(ctx, in.CID, "cms.voluntario_aceptado", map[string]any{"id": in.ID, "puesto": rolesVoluntario[b.Puesto], "turno": b.Turno, "avisar": b.Avisar}, func(tx pgx.Tx) error {
				if v, err = leer(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				// a minor joins the team only with the signed authorisation of their guardian
				if v.menor && v.autorizacion == "" {
					return problem.Unprocessable("AUTORIZACION_OBLIGATORIA", "Es menor de edad: sube primero la autorización firmada de su tutor.")
				}
				if _, err := tx.Exec(ctx, `UPDATE voluntarios SET estado = 'confirmado', puesto = $3, turno = $4, responsable = $5, notas = CASE WHEN $6 <> '' THEN $6 ELSE notas END,
					motivo_rechazo = '', revisado_at = now(), revisado_por = $7, updated_at = now() WHERE competition_id = $1 AND id = $2`,
					in.CID, in.ID, b.Puesto, b.Turno, b.Responsable, b.Notas, pr.Name); err != nil {
					return err
				}
				if !b.Avisar {
					return nil
				}
				resp := b.Responsable
				if resp == "" {
					resp = "la organización"
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "cms.email_solicitado", map[string]any{"para": v.email, "plantilla": "voluntario-aceptado",
					"vars": map[string]string{"nombre": nombreCorto(v.nombre), "puesto": rolesVoluntario[b.Puesto], "turno": b.Turno, "responsable": resp}},
					events.Competition(in.CID.String()), events.Audience(events.Internal)))
			})
			return nil, err
		})

	type rechazarIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Motivo string `json:"motivo" minLength:"3" maxLength:"400"`
			Avisar bool   `json:"avisar"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "voluntarios-rechazar", Method: http.MethodPost, Path: base + "/{id}/rechazar", Summary: "Rechazar una solicitud de voluntariado con un motivo", Tags: tags, Security: bearer},
		func(ctx context.Context, in *rechazarIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "web.editar")
			if err != nil {
				return nil, err
			}
			motivo := strings.TrimSpace(in.Body.Motivo)
			if len([]rune(motivo)) < 3 {
				return nil, problem.Unprocessable("MOTIVO_OBLIGATORIO", "Escribe el motivo.")
			}
			var v vol
			err = s.change(ctx, in.CID, "cms.voluntario_rechazado", map[string]any{"id": in.ID, "avisar": in.Body.Avisar}, func(tx pgx.Tx) error {
				if v, err = leer(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE voluntarios SET estado = 'descartado', motivo_rechazo = $3, revisado_at = now(), revisado_por = $4, updated_at = now()
					WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, motivo, pr.Name); err != nil {
					return err
				}
				if !in.Body.Avisar {
					return nil
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "cms.email_solicitado", map[string]any{"para": v.email, "plantilla": "voluntario-rechazado",
					"vars": map[string]string{"nombre": nombreCorto(v.nombre), "motivo": motivo}}, events.Competition(in.CID.String()), events.Audience(events.Internal)))
			})
			return nil, err
		})

	type estadoIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Estado string `json:"estado" enum:"pendiente,revision" doc:"Volver a la cola o marcar «en revisión» (también para sacar a alguien del equipo)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "voluntarios-estado", Method: http.MethodPost, Path: base + "/{id}/estado", Summary: "Marcar una solicitud como nueva o en revisión", Tags: tags, Security: bearer},
		func(ctx context.Context, in *estadoIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "cms.voluntario_estado", map[string]any{"id": in.ID, "estado": in.Body.Estado}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE voluntarios SET estado = $3, updated_at = now() WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, in.Body.Estado)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("Esa solicitud no existe.")
				}
				return err
			})
		})

	type puestosOut struct{ Body []Puesto }
	huma.Register(api, huma.Operation{OperationID: "voluntarios-puestos", Method: http.MethodGet, Path: base + "/puestos", Summary: "Puestos de voluntariado y personas que necesita cada uno", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidPath) (*puestosOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			p, err := s.puestos(ctx, in.CID)
			return &puestosOut{Body: p}, err
		})
	type objetivoIn struct {
		CID  uuid.UUID `path:"cid"`
		Rol  string    `path:"rol" enum:"jueces,cargadores,mesa,foto,acreditaciones"`
		Body struct {
			Objetivo int `json:"objetivo" minimum:"0" maximum:"200"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "voluntarios-objetivo", Method: http.MethodPut, Path: base + "/puestos/{rol}", Summary: "Cambiar cuántas personas necesita un puesto", Tags: tags, Security: bearer},
		func(ctx context.Context, in *objetivoIn) (*puestosOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "web.editar"); err != nil {
				return nil, err
			}
			err := s.change(ctx, in.CID, "cms.voluntario_puesto", map[string]any{"rol": rolesVoluntario[in.Rol], "objetivo": in.Body.Objetivo}, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `INSERT INTO voluntario_puestos (competition_id, rol, objetivo) VALUES ($1,$2,$3) ON CONFLICT (competition_id, rol) DO UPDATE SET objetivo = $3`, in.CID, in.Rol, in.Body.Objetivo)
				return err
			})
			if err != nil {
				return nil, err
			}
			p, err := s.puestos(ctx, in.CID)
			return &puestosOut{Body: p}, err
		})
}
