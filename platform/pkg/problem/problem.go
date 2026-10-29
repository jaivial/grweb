// Package problem implements RFC 9457 problem details with a stable machine-readable `code`,
// shared by every service (huma handlers and plain net/http handlers alike).
package problem

import (
	"encoding/json"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

// Error is the error body of every API response (application/problem+json).
type Error struct {
	Type   string              `json:"type,omitempty" doc:"URI que identifica el tipo de problema"`
	Title  string              `json:"title" doc:"Resumen legible del estado HTTP"`
	Status int                 `json:"status" doc:"Código de estado HTTP"`
	Code   string              `json:"code" doc:"Código estable para clientes (p. ej. CONFLICTO_EDICION)"`
	Detail string              `json:"detail,omitempty" doc:"Explicación en español para el usuario"`
	Errors []*huma.ErrorDetail `json:"errors,omitempty" doc:"Errores por campo"`
}

func (e *Error) Error() string  { return e.Detail }
func (e *Error) GetStatus() int { return e.Status }

// ContentType makes huma serve the error as application/problem+json.
func (e *Error) ContentType(ct string) string {
	if ct == "application/json" {
		return "application/problem+json"
	}
	return ct
}

var defaultCodes = map[int]string{
	http.StatusBadRequest:          "PETICION_INVALIDA",
	http.StatusUnauthorized:        "NO_AUTENTICADO",
	http.StatusForbidden:           "SIN_PERMISO",
	http.StatusNotFound:            "NO_ENCONTRADO",
	http.StatusMethodNotAllowed:    "METODO_NO_PERMITIDO",
	http.StatusConflict:            "CONFLICTO",
	http.StatusPreconditionFailed:  "CONFLICTO_EDICION",
	http.StatusUnprocessableEntity: "VALIDACION",
	http.StatusTooManyRequests:     "DEMASIADAS_PETICIONES",
	http.StatusInternalServerError: "ERROR_INTERNO",
	http.StatusBadGateway:          "SERVICIO_NO_DISPONIBLE",
	http.StatusServiceUnavailable:  "SERVICIO_NO_DISPONIBLE",
}

// CodeFor returns the default code for an HTTP status.
func CodeFor(status int) string {
	if c, ok := defaultCodes[status]; ok {
		return c
	}
	if status >= 500 {
		return "ERROR_INTERNO"
	}
	return "PETICION_INVALIDA"
}

// Install replaces huma's default error constructor so validation and framework errors share the model.
func Install() {
	huma.NewError = func(status int, msg string, errs ...error) huma.StatusError {
		details := make([]*huma.ErrorDetail, 0, len(errs))
		for _, err := range errs {
			if err == nil {
				continue
			}
			if d, ok := err.(huma.ErrorDetailer); ok {
				details = append(details, d.ErrorDetail())
				continue
			}
			details = append(details, &huma.ErrorDetail{Message: err.Error()})
		}
		return &Error{Title: http.StatusText(status), Status: status, Code: CodeFor(status), Detail: msg, Errors: details}
	}
}

// New builds a problem with an explicit code.
func New(status int, code, detail string) *Error {
	if code == "" {
		code = CodeFor(status)
	}
	return &Error{Title: http.StatusText(status), Status: status, Code: code, Detail: detail}
}

// Shorthands used across services.
func BadRequest(code, detail string) *Error { return New(http.StatusBadRequest, code, detail) }
func Unauthorized(code, detail string) *Error {
	return New(http.StatusUnauthorized, code, detail)
}
func Forbidden(detail string) *Error      { return New(http.StatusForbidden, "SIN_PERMISO", detail) }
func NotFound(detail string) *Error       { return New(http.StatusNotFound, "NO_ENCONTRADO", detail) }
func Conflict(code, detail string) *Error { return New(http.StatusConflict, code, detail) }
func Unprocessable(code, detail string) *Error {
	return New(http.StatusUnprocessableEntity, code, detail)
}
func TooMany(detail string) *Error {
	return New(http.StatusTooManyRequests, "DEMASIADAS_PETICIONES", detail)
}
func Internal() *Error {
	return New(http.StatusInternalServerError, "ERROR_INTERNO", "Error interno. Inténtalo de nuevo.")
}

// Write serialises a problem from plain net/http handlers (gateway, health, proxies).
func Write(w http.ResponseWriter, p *Error) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}
