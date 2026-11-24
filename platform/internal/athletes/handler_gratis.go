package athletes

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// SolicitudHandler is the public form «¿Necesitas handler? Podemos hacértelo, y gratis.» (BIZ-161).
type SolicitudHandler struct {
	Nombre     string `json:"nombre" minLength:"1" maxLength:"60"`
	Apellidos  string `json:"apellidos" minLength:"1" maxLength:"80"`
	Telefono   string `json:"telefono" minLength:"6" maxLength:"20"`
	Email      string `json:"email" minLength:"3" maxLength:"254"`
	Edad       int    `json:"edad" minimum:"10" maximum:"99"`
	Prueba     string `json:"prueba" enum:"aep2,aep3"`
	Categoria  string `json:"categoria" minLength:"1" maxLength:"60"`
	Entrenador string `json:"entrenador" maxLength:"80" doc:"Vacío si no tiene"`
	Idea       string `json:"idea" minLength:"1" maxLength:"1000"`
	Web        string `json:"web,omitempty" maxLength:"200" doc:"Honeypot: debe ir vacío"`
}

// registerHandlerGratis queues the email and the WhatsApp of the «handler-solicitud» template.
func (s *Svc) registerHandlerGratis() {
	type in struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body SolicitudHandler
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "handler-gratis", Method: http.MethodPost, Path: "/api/competiciones/{slug}/alta-atleta/handler",
		Summary: "Pedir un handler gratis (avisa por email y WhatsApp)", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, i *in) (*struct{}, error) {
			d := i.Body
			if strings.TrimSpace(d.Web) != "" {
				return nil, nil // bot: fake success
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "handler", httpx.ClientIPFrom(ctx)), 5, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Se han enviado muchas solicitudes desde esta conexión. Espera un rato antes de intentarlo otra vez.")
			}
			d.Email = strings.ToLower(strings.TrimSpace(d.Email))
			if !emailValido(d.Email) {
				return nil, problem.Unprocessable("VALIDACION", "Revisa el correo: no parece válido.")
			}
			c, err := s.comps.Public(ctx, i.Slug)
			if err != nil {
				return nil, err
			}
			entrenador := strings.TrimSpace(sinControl(d.Entrenador))
			if entrenador == "" {
				entrenador = "No"
			}
			// The template (BIZ-162) has no own fields for the category and the idea: they go in «origen».
			v := map[string]string{
				"nombre": sinControl(d.Nombre), "apellidos": sinControl(d.Apellidos), "email": d.Email, "telefono": telTexto(sinControl(d.Telefono)),
				"edad": strconv.Itoa(d.Edad) + " años", "prueba": pruebaTexto(d.Prueba), "entrenador": entrenador,
				"origen": "Formulario «¿Necesitas handler?» · Categoría: " + sinControl(d.Categoria) + " · Idea: " + sinControl(d.Idea),
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := email(ctx, tx, c.ID, handlerEmail, "handler-solicitud", v); err != nil {
					return err
				}
				return whatsapp(ctx, tx, c.ID, handlerWhatsApp, false, "handler-solicitud", v, "")
			})
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("solicitud de handler recibida", "competicion", c.ID.String(), "request_id", httpx.RequestIDFrom(ctx))
			return nil, nil
		})
}
