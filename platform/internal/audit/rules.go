package audit

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jaivial/grweb/platform/pkg/events"
)

// notifRule turns an event into a team notification (Figma page 49 · "Shell · notificaciones").
type notifRule func(e events.Event, d map[string]any) (titulo, cuerpo, enlace, nivel, permiso string, ok bool)

var estados = map[string]string{"borrador": "Borrador", "proximamente": "Próximamente", "inscripciones": "Inscripciones abiertas", "completas": "Completas", "hoy": "Hoy", "finalizado": "Finalizado", "archivada": "Archivada"}

var notifRules = map[string]notifRule{
	"evento.estado": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return "La competición pasa a «" + estados[str(d["estado"])] + "»", "Antes: " + estados[str(d["anterior"])], "/evento", "info", "", true
	},
	"competition.estado_programado": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return "Cambio de estado programado", "Pasará a «" + estados[str(d["estado"])] + "»", "/evento", "info", "evento.editar", true
	},
	"competition.integracion_probada": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		if str(d["estado"]) != "error" {
			return "", "", "", "", "", false
		}
		return "La integración «" + str(d["tipo"]) + "» falla", str(d["error"]), "/sistema/integraciones", "error", "integraciones.config", true
	},
	"identity.miembro_anadido": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return str(d["nombre"]) + " se ha unido al equipo", "", "/equipo", "ok", "equipo.gestionar", true
	},
	"cms.voluntario_solicitado": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		cuerpo := "Revisa la disponibilidad y asígnale un puesto."
		if d["esMenor"] == true {
			cuerpo = "Es menor de edad: necesitarás la autorización de su tutor."
		}
		return "Nueva solicitud de voluntariado", cuerpo, "/web/voluntarios", "info", "web.editar", true
	},
	"identity.invitacion_creada": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return "Invitación enviada", str(d["email"]), "/equipo", "info", "equipo.gestionar", true
	},
}

// kpiRules map an event to counter deltas of the dashboard. Only events that happen exactly once per fact may
// feed a counter (entrada.creada, compra confirmada…): they arrive with the services of roadmap steps 07–13.
var kpiRules = map[string]func(d map[string]any) map[string]int64{}

// resumen is the human sentence of the activity feed ("Sara añadió a Pablo al equipo").
func resumen(e events.Event) string {
	var d map[string]any
	_ = json.Unmarshal(e.Data, &d)
	switch e.Type {
	case "competition.creada":
		return "creó la competición «" + str(d["nombre"]) + "»"
	case "competition.actualizada":
		return "editó los datos del evento"
	case "competition.inscripcion_actualizada":
		return "actualizó la inscripción de la AEP"
	case "competition.como_llegar_actualizado":
		return "actualizó «Cómo llegar»"
	case "competition.modulos_actualizados":
		if d["activo"] == true {
			return "activó el módulo «" + str(d["modulo"]) + "»"
		}
		return "desactivó el módulo «" + str(d["modulo"]) + "»"
	case "competition.checklist_actualizado":
		if d["hecho"] == true {
			return "completó «" + str(d["paso"]) + "» en la puesta en marcha"
		}
		return "reabrió «" + str(d["paso"]) + "» en la puesta en marcha"
	case "competition.integracion_actualizada":
		return "configuró la integración «" + str(d["tipo"]) + "»"
	case "competition.integracion_probada":
		return "probó la integración «" + str(d["tipo"]) + "»: " + str(d["estado"])
	case "competition.estado_programado":
		return "programó el estado «" + estados[str(d["estado"])] + "»"
	case "competition.archivada":
		return "archivó la competición"
	case "evento.estado":
		return "cambió el estado a «" + estados[str(d["estado"])] + "»"
	case "identity.miembro_anadido":
		if str(d["via"]) == "invitacion" {
			return "aceptó la invitación al equipo"
		}
		return "añadió a " + str(d["nombre"]) + " al equipo"
	case "identity.miembro_actualizado":
		return "cambió el rol o el estado de un miembro"
	case "identity.miembro_eliminado":
		return "quitó a un miembro del equipo"
	case "identity.rol_actualizado":
		return "editó los permisos del rol «" + str(d["slug"]) + "»"
	case "identity.invitacion_creada":
		return "invitó a una persona al equipo"
	case "identity.sesion_revocada":
		return "cerró una sesión de un miembro"
	case "web.publicada":
		return "publicó cambios de la web"
	case "legal.publicado":
		return "publicó la versión " + str(d["version"]) + " de «" + str(d["tipo"]) + "»"
	case "cms.legal_borrador":
		return "guardó un borrador de «" + str(d["tipo"]) + "»"
	case "cms.seccion_actualizada":
		return "editó una sección de la home"
	case "cms.secciones_reordenadas":
		return "reordenó las secciones de la home"
	case "cms.voluntario_solicitado":
		return "envió una solicitud de voluntariado"
	case "cms.medio_subido":
		return "subió una imagen"
	case "cms.medio_actualizado":
		return "editó una imagen"
	case "cms.medio_eliminado":
		return "borró una imagen"
	}
	if col, accion, ok := cmsCollection(e.Type); ok {
		return accion + " " + col
	}
	return e.Type
}

// cmsCollection turns "cms.<coleccion>_<accion>" into a Spanish verb and object.
func cmsCollection(t string) (string, string, bool) {
	rest, ok := strings.CutPrefix(t, "cms.")
	if !ok {
		return "", "", false
	}
	i := strings.LastIndex(rest, "_")
	if i < 0 {
		return "", "", false
	}
	col := map[string]string{"faq": "una pregunta frecuente", "patrocinadores": "un patrocinador", "seo": "el SEO de una ruta", "redirecciones": "una redirección",
		"paginas": "una página", "blog": "una entrada del blog", "albumes": "un álbum", "voluntarios": "una solicitud de voluntariado"}[rest[:i]]
	accion := map[string]string{"creado": "creó", "actualizado": "editó", "eliminado": "borró", "reordenado": "reordenó"}[rest[i+1:]]
	if col == "" || accion == "" {
		return "", "", false
	}
	if accion == "reordenó" {
		col = "la lista (" + rest[:i] + ")"
	}
	return col, accion, true
}

func str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}
