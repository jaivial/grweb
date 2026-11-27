package athletes

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/formularios"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// La invitación a un formulario (FORMULARIOS.md §4 y §6): lo que messaging pone en el email y en el WhatsApp, el
// enlace personal, y el puente con messaging (vista previa del email con su renderer real y estado de los eventos).
// La vista previa del backoffice y el envío comparten estas funciones: el texto y el enlace salen siempre de aquí.

const (
	// plantillaInvitacion es la clave de la plantilla de messaging (internal/messaging/catalogo.go).
	plantillaInvitacion = "formulario_invitacion"
	// waInvitacionPorDefecto es el WhatsApp cuando el formulario no tiene texto propio.
	waInvitacionPorDefecto = "Hola {{nombre}}, tienes un formulario de {{competicion}}: «{{formulario}}». Rellénalo aquí: {{enlace}}"
	// maxEstadosPorPeticion: messaging acepta hasta 10000 ids por petición de estados.
	maxEstadosPorPeticion = 10000
)

// enlacesFormulario devuelve el enlace de la web y la acción del email de un destinatario. El token lo firma la
// clave del servicio (pkg/formularios.Token): no se guarda y no se puede adivinar.
func (s *Svc) enlacesFormulario(did uuid.UUID) (enlace, accion string) {
	tok := formularios.Token(s.autKey, did)
	return s.webURL + "/formularios/" + tok, s.webURL + "/api/formularios/" + tok + "/email"
}

// formularioEmail compila el formulario incrustado del email. Vacío si el formulario solo se rellena en la web.
func formularioEmail(f Formulario, accion, enlace string) string {
	if f.SoloWeb {
		return ""
	}
	return formularios.CompilarEmailHTML(f.Esquema, accion, enlace)
}

// varsInvitacion compila las variables de la plantilla de messaging (asunto, preheader, intro, título, botón y pie) con
// {{nombre}}, {{competicion}}, {{formulario}} y {{enlace}} ya sustituidos, y el texto del WhatsApp. El llamador añade
// formulario_html si lo hay.
func varsInvitacion(f Formulario, competicion, nombre, enlace string) (map[string]string, string) {
	titulo := f.Esquema.Ajustes.Titulo
	sust := strings.NewReplacer("{{nombre}}", nombre, "{{competicion}}", competicion, "{{formulario}}", titulo, "{{enlace}}", enlace).Replace
	asunto := sust(f.Email.Asunto)
	if strings.TrimSpace(asunto) == "" {
		asunto = titulo
	}
	texto := f.WhatsApp.Texto
	if strings.TrimSpace(texto) == "" {
		texto = waInvitacionPorDefecto
	}
	vars := map[string]string{
		"nombre": nombre, "competicion": competicion, "formulario": titulo, "enlace": enlace,
		"asunto": asunto, "preheader": sust(f.Email.Preheader), "intro": sust(f.Email.Intro),
	}
	return vars, sust(texto)
}

// noMensajeria registra el fallo de messaging y lo devuelve como un 503 con un mensaje que el backoffice puede mostrar.
func (s *Svc) noMensajeria(err error) error {
	s.a.Log.Error("formularios: messaging no responde", "err", err)
	return problem.New(http.StatusServiceUnavailable, "MENSAJERIA_NO_DISPONIBLE", "El servicio de mensajes no responde. Inténtalo de nuevo en un momento.")
}

// pideEstados pide a messaging el estado de cada evento (en lotes). Un evento que messaging no conoce todavía no
// aparece en el resultado. El error de messaging sale tal cual: quien llama decide si degrada (estadoEnvios).
func (s *Svc) pideEstados(ctx context.Context, cid uuid.UUID, eventos []uuid.UUID) (map[uuid.UUID]string, error) {
	out := make(map[uuid.UUID]string, len(eventos))
	for lo := 0; lo < len(eventos); lo += maxEstadosPorPeticion {
		hi := min(lo+maxEstadosPorPeticion, len(eventos))
		var res map[string]string
		if err := s.messaging.Do(ctx, http.MethodPost, "/internal/competiciones/"+cid.String()+"/mensajes/estados",
			map[string]any{"eventos": eventos[lo:hi]}, &res); err != nil {
			return nil, err
		}
		for k, v := range res {
			if id, err := uuid.Parse(k); err == nil {
				out[id] = v
			}
		}
	}
	return out, nil
}

// registerFormulariosPrevia registra la vista previa del email y del WhatsApp de un borrador (sin guardar nada).
func (s *Svc) registerFormulariosPrevia() {
	type previsualizarIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Esquema  formularios.Esquema `json:"esquema"`
			Email    FormularioEmail     `json:"email"`
			WhatsApp FormularioWhatsApp  `json:"whatsapp"`
		}
	}
	type previsualizarOut struct {
		Body struct {
			EmailHTML     string `json:"emailHtml"`
			Asunto        string `json:"asunto"`
			SoloWeb       bool   `json:"soloWeb"`
			WhatsAppTexto string `json:"whatsappTexto"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "formularios-previsualizar", Method: http.MethodPost,
		Path: "/api/admin/competiciones/{cid}/formularios/previsualizar", Summary: "Vista previa del email y del WhatsApp de un borrador (sin guardar)",
		Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *previsualizarIn) (*previsualizarOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := validaTextos(in.Body.Email, in.Body.WhatsApp); err != nil {
				return nil, err
			}
			esq := in.Body.Esquema
			formularios.Normalizar(&esq)
			if err := formularios.Validar(esq); err != nil {
				return nil, problem.Unprocessable("ESQUEMA_NO_VALIDO", err.Error())
			}
			c, err := s.comps.ByID(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			f := Formulario{Esquema: esq, Email: in.Body.Email, WhatsApp: in.Body.WhatsApp, SoloWeb: formularios.SoloWeb(esq)}
			// Lo que vería el atleta, con un enlace ficticio (el token de nadie, que no abre nada) y un formulario cuya
			// acción no envía (#): la vista previa nunca responde a un formulario real.
			enlace, _ := s.enlacesFormulario(uuid.Nil)
			vars, texto := varsInvitacion(f, c.Nombre, "Laura", enlace)
			vars["formulario_html"] = formularioEmail(f, "#", enlace)
			var r struct {
				HTML   string `json:"html"`
				Asunto string `json:"asunto"`
			}
			if err := s.messaging.Do(ctx, http.MethodPost, "/internal/competiciones/"+in.CID.String()+"/plantillas/"+plantillaInvitacion+"/previsualizar",
				map[string]any{"vars": vars}, &r); err != nil {
				return nil, s.noMensajeria(err)
			}
			out := &previsualizarOut{}
			out.Body.EmailHTML, out.Body.Asunto, out.Body.SoloWeb, out.Body.WhatsAppTexto = r.HTML, r.Asunto, f.SoloWeb, texto
			return out, nil
		})
}
