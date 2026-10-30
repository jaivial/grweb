package audit

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jaivial/grweb/platform/pkg/events"
)

// notifRule turns an event into a team notification (Figma page 49 · "Shell · notificaciones").
// nivel is one of info · ok · aviso · error (anything else is stored as info).
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
	"cms.club_solicitado": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return "Nuevo club propuesto para el directorio", "«" + str(d["nombre"]) + "» espera revisión antes de aparecer en /clubs.", "/web/patrocinadores", "info", "web.editar", true
	},
	"athletes.importacion_confirmada": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return "Acta de la AEP importada", fmt.Sprintf("%v nuevos · %v con cambios · %v bajas · %v filas con errores omitidas", d["nuevos"], d["cambios"], d["bajas"], d["errores"]), "/atletas", "ok", "atletas.editar", true
	},
	"athletes.cupon_agotado": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return "Cupón agotado", "«" + str(d["codigo"]) + "» ha llegado a su límite de usos.", "/atletas/inscripcion", "aviso", "atletas.editar", true
	},
	"smtp.estado": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		if d["ok"] == true {
			return "El email vuelve a funcionar", "Los mensajes en cola salen ya.", "/emails/salida", "ok", "campanas.enviar", true
		}
		return "El servidor de email no responde", str(d["servidor"]) + ": " + str(d["error"]) + ". Los mensajes esperan en la cola.", "/emails/salida", "error", "campanas.enviar", true
	},
	"horarios.publicados": func(e events.Event, d map[string]any) (string, string, string, string, string, bool) {
		return fmt.Sprintf("Horarios v%v publicados", d["version"]), fmt.Sprintf("%v cambios · %v avisos por email", d["cambios"], d["avisos"]), "/horarios", "ok", "horarios.publicar", true
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
		switch d["pagina"] {
		case "publico":
			return "publicó cambios de /publico"
		case "en":
			return "publicó cambios de la versión en inglés"
		}
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
	case "messaging.plantilla_guardada":
		return "editó la plantilla de email «" + str(d["nombre"]) + "»"
	case "messaging.automatizacion":
		if d["activa"] == true {
			return "activó la automatización «" + str(d["nombre"]) + "»"
		}
		return "desactivó la automatización «" + str(d["nombre"]) + "»"
	case "smtp.estado":
		if d["ok"] == true {
			return "el servidor de email vuelve a funcionar"
		}
		return "el servidor de email ha dejado de responder"
	case "crm.contacto_rectificado":
		return "rectificó los datos de un contacto"
	case "crm.rgpd_acceso":
		return "exportó los datos de un contacto (derecho de acceso)"
	case "crm.rgpd_supresion":
		return "suprimió un contacto (derecho de supresión)"
	case "crm.exportado":
		return fmt.Sprintf("exportó %v contactos a CSV", d["filas"])
	case "crm.segmento_guardado":
		return "guardó el segmento «" + str(d["nombre"]) + "»"
	case "crm.baja_manual":
		return "añadió una baja a mano"
	case "horarios.borrador":
		if a := str(d["accion"]); a != "" {
			return a
		}
		return "editó el borrador de los horarios"
	case "horarios.generados":
		return fmt.Sprintf("generó %v flights para %v atletas", d["flights"], d["atletas"])
	case "horarios.publicados":
		return fmt.Sprintf("publicó la versión v%v de los horarios", d["version"])
	case "horarios.retirados":
		return "retiró los horarios publicados"
	case "horarios.flight":
		switch str(d["estado"]) {
		case "en_curso":
			return "puso el flight " + str(d["codigo"]) + " en la plataforma"
		case "finalizado":
			return "dio por terminado el flight " + str(d["codigo"])
		}
		if r, _ := d["retrasoMin"].(float64); r > 0 {
			return fmt.Sprintf("marcó %v min de retraso en el flight %s", r, str(d["codigo"]))
		}
		return "devolvió el flight " + str(d["codigo"]) + " a programado"
	case "athletes.plaza_ofrecida":
		return "ofreció una plaza libre a un atleta de la reserva (enlace de pago)"
	case "athletes.inscripcion_pagada":
		return "se inscribió y pagó la cuota"
	case "athletes.inscripcion_reserva":
		return "se apuntó a la lista de reserva"
	case "athletes.devolucion_referido":
		return "recibió una devolución por invitar a otro atleta"
	case "athletes.reembolso":
		return "reembolsó un pago de inscripción"
	case "athletes.cupon_guardado":
		return "guardó el cupón «" + str(d["codigo"]) + "»"
	case "athletes.cupon_borrado":
		return "borró un cupón"
	case "athletes.cupon_agotado":
		return "agotó el cupón «" + str(d["codigo"]) + "»"
	case "athletes.referido_ajustado":
		return "cambió los ajustes de un código de referido"
	case "athletes.inscripcion_configurada":
		return "cambió la configuración de la inscripción"
	case "athletes.atleta_creado":
		return "añadió a " + str(d["nombre"]) + " a los atletas"
	case "athletes.atleta_actualizado":
		return "editó los datos de competición de un atleta"
	case "athletes.perfil_actualizado":
		if d["origen"] == "area" {
			return "editó su perfil desde el área del atleta"
		}
		return "editó el perfil público de un atleta"
	case "athletes.foto_subida":
		return "subió su foto desde el área del atleta"
	case "athletes.previa_pesaje":
		return "guardó sus alturas de rack y primeros intentos"
	case "athletes.promocionado":
		return "pasó a un atleta de reserva a confirmado"
	case "athletes.pesaje_registrado":
		return "registró un pesaje"
	case "athletes.pesaje_decidido":
		if d["accion"] == "cambiar_categoria" {
			return "cambió de categoría a un atleta tras el pesaje"
		}
		return "marcó que un atleta no compite tras el pesaje"
	case "athletes.enlace_area_enviado":
		return "envió a un atleta el enlace a su área"
	case "athletes.atleta_borrado":
		return "borró a un atleta y sus datos"
	case "athletes.importacion_confirmada":
		return "importó el acta de la AEP «" + str(d["archivo"]) + "»"
	case "athletes.seguimiento_confirmado":
		return "confirmó un aviso de «Avísame cuando compita»"
	case "cms.club_solicitado":
		return "propuso el club «" + str(d["nombre"]) + "» para el directorio"
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
		"paginas": "una página", "blog": "una entrada del blog", "albumes": "un álbum", "voluntarios": "una solicitud de voluntariado", "clubs": "un club"}[rest[:i]]
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
