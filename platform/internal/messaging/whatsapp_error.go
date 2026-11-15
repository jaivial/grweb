package messaging

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Los errores de evo-weai: el proveedor contesta en inglés y con el nombre técnico de la instancia («The
// "grcup-grcup" instance is not connected»). Eso nunca llega a la persona: aquí se traduce a un mensaje en español
// con el nombre legible de la competición y el detalle técnico se queda en el log.

// reDigitos finds the phone numbers inside a message of the provider (they are masked before the log).
var reDigitos = regexp.MustCompile(`\d{8,}`)

// waSinDatos masks the long digit runs of a message (a phone number): the log never carries personal data.
func waSinDatos(s string) string {
	return reDigitos.ReplaceAllString(s, "***")
}

// waTecnico is the detail of a failure for the log: the status of evo-weai and its message (without personal data).
func waTecnico(err error) string {
	var ew *errWA
	if errors.As(err, &ew) {
		return "evo-weai " + strconv.Itoa(ew.codigo) + ": " + ew.texto
	}
	return err.Error()
}

// waLog leaves the technical detail of a failure in the log.
func (s *Svc) waLog(ctx context.Context, cid uuid.UUID, operacion string, err error) {
	s.a.Log.Warn("whatsapp: "+operacion, "competicion", cid.String(), "detalle", waSinDatos(waTecnico(err)))
}

// waFallo classifies a failure of evo-weai: the stable code, the message for the person (in Spanish, with the
// legible name of the competition) and the HTTP status of the answer.
func (s *Svc) waFallo(ctx context.Context, cid uuid.UUID, err error) (string, string, int) {
	return waFalloLegible(s.nombreLegible(ctx, cid), err)
}

// waFalloLegible classifies a failure of evo-weai with the legible name of the competition.
func waFalloLegible(legible string, err error) (string, string, int) {
	var ew *errWA
	if !errors.As(err, &ew) {
		return "WHATSAPP_ERROR", "No se ha podido completar la operación de WhatsApp.", http.StatusBadGateway
	}
	low := strings.ToLower(ew.texto)
	switch {
	case strings.Contains(low, "not configured"):
		return "WHATSAPP_SIN_CONFIGURAR", "El servicio de WhatsApp no está configurado. Revísalo en Sistema › Integraciones.", http.StatusConflict
	case ew.codigo == http.StatusUnauthorized, ew.codigo == http.StatusForbidden:
		return "WHATSAPP_CLAVE_INVALIDA", "La clave de la integración de WhatsApp no es válida. Revísala en Sistema › Integraciones.", http.StatusBadGateway
	case ew.codigo == http.StatusNotFound, strings.Contains(low, "does not exist"), strings.Contains(low, "not found"):
		return "WHATSAPP_SIN_CONEXION", "La sesión de WhatsApp de " + legible + " no existe. Vuelve a crear la instancia en Sistema › WhatsApp.", http.StatusConflict
	case strings.Contains(low, "not connected"):
		return "WHATSAPP_SIN_CONEXION", "El número de " + legible + " no está conectado. Vincúlalo en Sistema › WhatsApp.", http.StatusConflict
	case ew.permanente, strings.Contains(low, "not on whatsapp"), strings.Contains(low, "invalid recipient"), strings.Contains(low, "invalid number"):
		return "WHATSAPP_NUMERO_INVALIDO", "Ese teléfono no está en WhatsApp o el número no es válido. Revísalo en Sistema › WhatsApp.", http.StatusUnprocessableEntity
	case ew.servidor, ew.codigo >= 500:
		return "WHATSAPP_NO_RESPONDE", "El servicio de WhatsApp no responde ahora mismo. Inténtalo de nuevo en unos segundos.", http.StatusBadGateway
	}
	return "WHATSAPP_ERROR", "No se ha podido completar la operación de WhatsApp. Inténtalo de nuevo en unos segundos.", http.StatusBadGateway
}

// waProblema is the failure of evo-weai as a problem+json for the API (the technical detail goes to the log).
func (s *Svc) waProblema(ctx context.Context, cid uuid.UUID, err error) *problem.Error {
	cod, msg, status := s.waFallo(ctx, cid, err)
	return problem.New(status, cod, msg)
}

// waMensaje is the failure of evo-weai as a sentence for the person (the detail of the outbox, the list of the
// campaign or the errors of the test message).
func (s *Svc) waMensaje(ctx context.Context, cid uuid.UUID, err error) string {
	_, msg, _ := s.waFallo(ctx, cid, err)
	return msg
}

// waIgnorable is a failure that does not stop the operation: the instance was already gone or was never connected.
func waIgnorable(err error) bool {
	var ew *errWA
	if !errors.As(err, &ew) {
		return false
	}
	if ew.codigo == http.StatusNotFound {
		return true
	}
	return ew.codigo == http.StatusBadRequest && strings.Contains(strings.ToLower(ew.texto), "not connected")
}
