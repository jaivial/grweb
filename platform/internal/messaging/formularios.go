package messaging

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Formularios (athletes, FORMULARIOS.md §4 y §6): la plantilla de la invitación y dos endpoints internos que usa
// athletes. La vista previa del email sale de este mismo renderer, y el estado de entrega de sus eventos se lee por
// el evento (events.Event.ID), que es el evento_id del mensaje.

const (
	// formularioInvitacion es la clave de la plantilla de la invitación a un formulario.
	formularioInvitacion = "formulario_invitacion"
	// formularioHTML es la variable con el formulario ya compilado (solo llega en eventos de athletes).
	formularioHTML = "formulario_html"
)

func (s *Svc) registerFormularios() {
	api := s.a.API

	type previaIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Vars map[string]string `json:"vars" doc:"Variables de la invitación, las que compila athletes"`
		}
	}
	type previaOut struct {
		Body struct {
			HTML   string `json:"html"`
			Asunto string `json:"asunto"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-formulario-previsualizar", Method: http.MethodPost,
		Path: "/internal/competiciones/{cid}/plantillas/" + formularioInvitacion + "/previsualizar", Summary: "Email de la invitación a un formulario con el renderer real (solo athletes)",
		Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *previaIn) (*previaOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			e, err := s.plantilla(ctx, in.CID, formularioInvitacion)
			if err != nil {
				return nil, err
			}
			r, err := renderizarDe(e.Plantilla, e.Contenido, in.Body.Vars, s.marca(ctx, in.CID))
			if err != nil {
				return nil, problem.Unprocessable("VARIABLE_INEXISTENTE", err.Error())
			}
			out := &previaOut{}
			out.Body.HTML, out.Body.Asunto = r.HTML, r.Asunto
			return out, nil
		})

	type estadosIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Eventos []uuid.UUID `json:"eventos" maxItems:"10000" doc:"Ids de evento (events.Event.ID) cuyo estado se pide"`
		}
	}
	type estadosOut struct {
		Body map[string]string
	}
	huma.Register(api, huma.Operation{OperationID: "internal-mensajes-estados", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/mensajes/estados",
		Summary: "Estado de entrega de eventos (evento → estado; solo athletes)", Tags: []string{"Interno"}, Hidden: true, MaxBodyBytes: 600 << 10},
		func(ctx context.Context, in *estadosIn) (*estadosOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			out := &estadosOut{Body: map[string]string{}}
			if len(in.Body.Eventos) == 0 {
				return out, nil
			}
			rows, err := s.a.DB.Query(ctx, `SELECT evento_id, estado FROM mensajes WHERE competition_id = $1 AND evento_id = ANY($2)`, in.CID, in.Body.Eventos)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			for rows.Next() {
				var id uuid.UUID
				var estado string
				if err := rows.Scan(&id, &estado); err != nil {
					return nil, err
				}
				out.Body[id.String()] = estado
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			return out, nil
		})
}
