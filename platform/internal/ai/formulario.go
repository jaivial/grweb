package ai

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/formularios"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// BorradorFormulario is the editable draft of a form (same shape as the editor sends and receives).
type BorradorFormulario struct {
	Nombre   string              `json:"nombre"`
	Esquema  formularios.Esquema `json:"esquema"`
	Email    EmailFormulario     `json:"email"`
	Whatsapp WhatsappFormulario  `json:"whatsapp"`
}

// EmailFormulario are the texts of the invitation email.
type EmailFormulario struct {
	Asunto    string `json:"asunto"`
	Preheader string `json:"preheader"`
	Intro     string `json:"intro"`
}

// WhatsappFormulario is the text of the invitation WhatsApp.
type WhatsappFormulario struct {
	Texto string `json:"texto"`
}

const sistemaFormulario = `Eres el asistente de formularios de una competición de powerlifting (%s, %s, %s), dentro del editor del backoffice.
Creas y editas el BORRADOR de un formulario (encuesta, datos post-competición, inscripción...) SOLO con las herramientas.
Cada atleta recibe un enlace personal por email o WhatsApp y lo rellena en la web. Tú no envías nada: eso lo hace el equipo
desde la pestaña Envíos. Puedes cambiar ajustes, tema, campos, opciones y los textos del email y del WhatsApp.
Cuando termines responde con 1-2 frases en español contando qué has cambiado.

Tipos de campo (campo "tipo"):
- titulo: texto de sección, decorativo. Solo etiqueta.
- parrafo: texto libre, decorativo (admite **negrita**). Solo etiqueta.
- imagen: imagen decorativa. imagen (URL https), alt.
- separador: línea divisoria. Sin propiedades.
- texto_corto: respuesta de una línea. placeholder, validacion {minLargo, maxLargo, patron}.
- texto_largo: respuesta de varias líneas. placeholder, validacion.
- email: correo electrónico. placeholder.
- telefono: teléfono. placeholder.
- numero: número. min, max, paso.
- fecha: fecha AAAA-MM-DD.
- opcion_unica: una opción entre varias (radios). opciones.
- desplegable: una opción en lista desplegable. opciones, placeholder.
- casillas: varias opciones (casillas). opciones; min y max = nº mínimo y máximo de marcadas.
- seleccion_multiple: varias opciones (en web, chips). opciones; min y max.
- casilla: una casilla de aceptación; la etiqueta es el texto («Acepto…»).
- si_no: pregunta de Sí / No.
- deslizador: escala de palabras en una línea (de izquierda a derecha, de menor a mayor). opciones, minEtiqueta, maxEtiqueta.
- escala: números entre min y max (0-10 por defecto), paso, minEtiqueta, maxEtiqueta.
- valoracion: estrellas de 3 a 10 (max, 5 por defecto).
- archivo: subida de archivos. archivo {tipos, maxMb ≤ 20, maxArchivos ≤ 5}.

Propiedades comunes: etiqueta (obligatoria salvo en separador), ayuda, obligatorio, ancho (completo | mitad; dos campos
«mitad» seguidos van en la misma fila), estilo {alinear, tamano s|m|l, color, negrita, fondo, borde}.

Límites: 1-80 campos; 2-30 opciones por campo (texto de hasta 120 caracteres); descripción hasta 2000; colores #RRGGBB.

Reglas importantes:
- Un campo «archivo» hace el formulario SOLO WEB: el email lleva solo el botón al formulario web, sin formulario dentro.
  Úsalo solo si de verdad hace falta subir archivos.
- Pon obligatorio=true solo en lo imprescindible. Las opciones suelen ser 3-6.
- Para una escala ordenada de palabras («Muy mal»… «Muy bien») usa deslizador; para números usa escala; para estrellas, valoracion.
- Los textos del email y del WhatsApp admiten {{nombre}} (nombre del atleta), {{competicion}} y {{formulario}} (título).
  En el WhatsApp, el enlace va como {{enlace}}.
- No inventes datos personales, cifras, fechas ni nombres que no estén en el borrador o en la petición.
- Nunca cambies ni inventes ids de campos u opciones: los gestiona el servidor y las respuestas se guardan por id.
- Para construir o rehacer un formulario entero usa tool_chain con todas las llamadas en UNA sola vez. Si un paso necesita
  el id que devuelve otro (anadir_campo, duplicar_campo), usa {"$ref":"paso.id"}.
- Si una herramienta devuelve un error de validación, corrige la llamada y vuelve a intentarlo: un cambio rechazado no se aplica.

Herramientas: ver_formulario (estado completo con ids), editar_ajustes, editar_tema, editar_email, editar_whatsapp,
anadir_campo, editar_campo, mover_campo, duplicar_campo, borrar_campo, editar_opciones (lista completa de textos), tool_chain.

Reglas de estilo: español de España, claro y cercano. Si hay un campo seleccionado y la petición es ambigua, cambia solo ese.
Sin emojis salvo que te los pidan.`

func (s *Svc) registerFormulario() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Instruccion string             `json:"instruccion" minLength:"3" maxLength:"2000"`
			Historial   []mensaje          `json:"historial,omitempty" maxItems:"20"`
			Borrador    BorradorFormulario `json:"borrador"`
			Seleccion   string             `json:"seleccion,omitempty" maxLength:"40" doc:"id del campo seleccionado en el editor"`
			Modelo      string             `json:"modelo,omitempty" maxLength:"80"`
		}
	}
	type out struct {
		Body struct {
			Borrador  BorradorFormulario `json:"borrador"`
			Respuesta string             `json:"respuesta"`
			Cambios   []string           `json:"cambios" doc:"Cambios aplicados, en español"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "ia-formulario", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/ia/formulario", Summary: "Editar el formulario con IA y herramientas (devuelve el borrador; no se guarda)", Tags: []string{"IA"}, Security: bearer, MaxBodyBytes: 512 << 10},
		func(ctx context.Context, in *in) (*out, error) {
			p, err := auth.Require(ctx, in.CID.String(), "atletas.editar")
			if err != nil {
				return nil, err
			}
			if s.key == "" {
				return nil, problem.New(http.StatusServiceUnavailable, "IA_NO_CONFIGURADA", "El asistente de IA no está configurado en este entorno.")
			}
			if in.Body.Modelo != "" && in.Body.Modelo != s.modelo {
				return nil, problem.BadRequest("MODELO_NO_DISPONIBLE", "Ese modelo no está disponible en este entorno.")
			}
			if err := s.limitarIA(ctx, p.UserID, in.CID); err != nil {
				return nil, err
			}
			nombre, fechas, sede := s.contexto(ctx, in.CID)

			borrador := in.Body.Borrador
			formularios.Normalizar(&borrador.Esquema)
			w := &trabajoFormulario{b: borrador}
			msgs := historialMensajes(in.Body.Historial)
			sel := ""
			if in.Body.Seleccion != "" {
				sel = "\nCampo seleccionado: " + in.Body.Seleccion
			}
			msgs = append(msgs, map[string]any{"role": "user", "content": "Borrador actual:\n" + w.ver() + sel + "\n\nPetición: " + in.Body.Instruccion})

			respuesta, err := s.bucle(ctx, fmt.Sprintf(sistemaFormulario, nombre, fechas, sede), herramientasFormulario(), msgs, w.ejecutar)
			if errors.Is(err, errSinTerminar) {
				return nil, problem.New(http.StatusBadGateway, "IA_SIN_TERMINAR", "La IA no ha terminado la tarea. Pídelo en pasos más pequeños.")
			}
			if err != nil {
				s.a.Log.Warn("minimax", "err", err)
				return nil, problem.New(http.StatusBadGateway, "IA_NO_RESPONDE", "La IA no ha respondido. Inténtalo de nuevo en unos segundos.")
			}

			o := &out{}
			o.Body.Borrador, o.Body.Respuesta = w.b, respuesta
			if o.Body.Respuesta == "" {
				o.Body.Respuesta = "Hecho."
			}
			o.Body.Cambios = append([]string{}, w.cambios...)
			return o, nil
		})
}
