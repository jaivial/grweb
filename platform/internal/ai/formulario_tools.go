package ai

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jaivial/grweb/platform/pkg/formularios"
)

// Herramientas del asistente de formularios. Cada cambio se aplica a una copia del borrador que solo reemplaza al
// original si el formulario entero valida con formularios.Validar: un cambio rechazado no deja nada a medias y el
// modelo recibe el motivo para corregirse. Los ids de campos y opciones los genera el servidor y nunca cambian al editar.

var (
	schColor   = map[string]any{"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$", "description": "Color #RRGGBB"}
	schBool    = map[string]any{"type": "boolean"}
	schNum     = map[string]any{"type": "number"}
	tiposCampo = slices.Sorted(maps.Keys(formularios.Tipos)) // misma fuente que la validación del paquete
)

// nombreTipo are the Spanish names of the field types, for the change list shown to the user.
var nombreTipo = map[string]string{
	formularios.TipoTitulo: "título", formularios.TipoParrafo: "párrafo", formularios.TipoImagen: "imagen",
	formularios.TipoSeparador: "separador", formularios.TipoTextoCorto: "texto corto", formularios.TipoTextoLargo: "texto largo",
	formularios.TipoEmail: "email", formularios.TipoTelefono: "teléfono", formularios.TipoNumero: "número",
	formularios.TipoFecha: "fecha", formularios.TipoOpcionUnica: "opción única", formularios.TipoDesplegable: "desplegable",
	formularios.TipoCasillas: "casillas", formularios.TipoSeleccionMultiple: "selección múltiple",
	formularios.TipoCasilla: "casilla de aceptación", formularios.TipoSiNo: "sí / no", formularios.TipoDeslizador: "deslizador",
	formularios.TipoEscala: "escala", formularios.TipoValoracion: "valoración", formularios.TipoArchivo: "archivo",
}

// etiquetasProp names the props of the ajustes, tema and email in the change list.
var etiquetasProp = map[string]string{
	"titulo": "título", "descripcion": "descripción", "botonEnviar": "botón de enviar", "mensajeGracias": "mensaje de gracias",
	"permiteEditar": "editar respuestas", "cierreAt": "cierre", "acento": "color de acento", "fondo": "fondo",
	"superficie": "superficie", "texto": "color del texto", "radio": "radio de esquinas", "fuente": "fuente",
	"densidad": "densidad", "asunto": "asunto", "preheader": "preheader", "intro": "texto de introducción",
}

// trabajoFormulario is the working copy of the form the tools edit.
type trabajoFormulario struct {
	b       BorradorFormulario
	cambios []string
}

// ver is the draft as the model reads it (ids included).
func (w *trabajoFormulario) ver() string {
	b, _ := json.Marshal(map[string]any{"nombre": w.b.Nombre, "esquema": w.b.Esquema, "email": w.b.Email,
		"whatsapp": w.b.Whatsapp, "soloWeb": formularios.SoloWeb(w.b.Esquema)})
	return string(b)
}

// mutar applies a change to a copy of the draft. The copy replaces the draft only if it validates, and the change
// text is recorded only then.
func (w *trabajoFormulario) mutar(fn func(b *BorradorFormulario) (resultado, cambio string, err error)) (string, error) {
	c, err := clonar(w.b)
	if err != nil {
		return "", err
	}
	resultado, cambio, err := fn(&c)
	if err != nil {
		return "", err
	}
	formularios.Normalizar(&c.Esquema)
	if err := formularios.Validar(c.Esquema); err != nil {
		return "", err
	}
	w.b = c
	if cambio != "" {
		w.cambios = append(w.cambios, cambio)
	}
	return resultado, nil
}

// ejecutar runs one tool of the form assistant. tool_chain goes through the shared chain with $ref.
func (w *trabajoFormulario) ejecutar(nombre string, raw json.RawMessage) (string, error) {
	in := map[string]any{}
	if len(raw) > 0 && string(raw) != "null" {
		if err := json.Unmarshal(raw, &in); err != nil {
			return "", fmt.Errorf("argumentos ilegibles: %v", err)
		}
	}
	if in == nil {
		in = map[string]any{}
	}
	switch nombre {
	case "ver_formulario":
		return w.ver(), nil
	case "editar_ajustes":
		return w.editarAjustes(in)
	case "editar_tema":
		return w.editarTema(in)
	case "editar_email":
		return w.editarEmail(in)
	case "editar_whatsapp":
		return w.editarWhatsapp(in)
	case "anadir_campo":
		return w.anadirCampo(in)
	case "editar_campo":
		return w.editarCampo(in)
	case "mover_campo":
		return w.moverCampo(in)
	case "duplicar_campo":
		return w.duplicarCampo(in)
	case "borrar_campo":
		return w.borrarCampo(in)
	case "editar_opciones":
		return w.editarOpciones(in)
	case "tool_chain":
		return cadena(raw, w.ejecutar)
	}
	return "", fmt.Errorf("herramienta %s desconocida", nombre)
}

func (w *trabajoFormulario) editarAjustes(in map[string]any) (string, error) {
	cambio := cambioLista("Ajustes: ", in)
	cierre, conCierre := in["cierreAt"]
	delete(in, "cierreAt")
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		aj, err := fusionar(b.Esquema.Ajustes, in)
		if err != nil {
			return "", "", err
		}
		if conCierre {
			t, err := parsearCierre(cierre)
			if err != nil {
				return "", "", err
			}
			aj.CierreAt = t
		}
		b.Esquema.Ajustes = aj
		return "ok", cambio, nil
	})
}

func (w *trabajoFormulario) editarTema(in map[string]any) (string, error) {
	cambio := cambioLista("Tema: ", in)
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		t, err := fusionar(b.Esquema.Ajustes.Tema, in)
		if err != nil {
			return "", "", err
		}
		b.Esquema.Ajustes.Tema = t
		return "ok", cambio, nil
	})
}

func (w *trabajoFormulario) editarEmail(in map[string]any) (string, error) {
	cambio := cambioLista("Email: ", in)
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		e, err := fusionar(b.Email, in)
		if err != nil {
			return "", "", err
		}
		if utf8.RuneCountInString(e.Asunto) > formularios.MaxAsuntoEmail {
			return "", "", fmt.Errorf("el asunto no puede tener más de %d caracteres", formularios.MaxAsuntoEmail)
		}
		if utf8.RuneCountInString(e.Preheader) > formularios.MaxPreheaderEmail {
			return "", "", fmt.Errorf("el preheader no puede tener más de %d caracteres", formularios.MaxPreheaderEmail)
		}
		if utf8.RuneCountInString(e.Intro) > formularios.MaxIntroEmail {
			return "", "", fmt.Errorf("la introducción no puede tener más de %d caracteres", formularios.MaxIntroEmail)
		}
		b.Email = e
		return "ok", cambio, nil
	})
}

func (w *trabajoFormulario) editarWhatsapp(in map[string]any) (string, error) {
	texto, ok := in["texto"].(string)
	if !ok {
		return "", errors.New("texto debe ser el texto del mensaje de WhatsApp")
	}
	if utf8.RuneCountInString(texto) > formularios.MaxTextoWhatsapp {
		return "", fmt.Errorf("el mensaje de WhatsApp no puede tener más de %d caracteres", formularios.MaxTextoWhatsapp)
	}
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		b.Whatsapp.Texto = strings.TrimSpace(texto)
		return "ok", "Mensaje de WhatsApp actualizado", nil
	})
}

func (w *trabajoFormulario) anadirCampo(in map[string]any) (string, error) {
	ref, enviado := in["despuesDe"]
	delete(in, "despuesDe")
	delete(in, "id")
	tipo, _ := in["tipo"].(string)
	if !formularios.Tipos[tipo] {
		return "", fmt.Errorf("tipo «%s» no válido", tipo)
	}
	textos, conOpciones, err := opcionesDeEntrada(in)
	if err != nil {
		return "", err
	}
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		pos, err := posicion(b.Esquema.Campos, ref, enviado)
		if err != nil {
			return "", "", err
		}
		usados := idsEnUso(b.Esquema)
		c, err := fusionar(formularios.Campo{ID: generarID("c", usados)}, in)
		if err != nil {
			return "", "", err
		}
		if conOpciones {
			fijarOpciones(&c, textos, usados)
		}
		b.Esquema.Campos = slices.Insert(b.Esquema.Campos, pos, c)
		return resultadoID(c.ID), "Añadido " + descripcionCampo(c), nil
	})
}

func (w *trabajoFormulario) editarCampo(in map[string]any) (string, error) {
	id, _ := in["id"].(string)
	if _, ok := in["despuesDe"]; ok {
		return "", errors.New("para cambiar de sitio un campo usa mover_campo")
	}
	delete(in, "id")
	textos, conOpciones, err := opcionesDeEntrada(in)
	if err != nil {
		return "", err
	}
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		i := indiceCampo(b.Esquema.Campos, id)
		if i < 0 {
			return "", "", fmt.Errorf("no hay ningún campo con id «%s»", id)
		}
		c, err := fusionar(b.Esquema.Campos[i], in)
		if err != nil {
			return "", "", err
		}
		if conOpciones {
			fijarOpciones(&c, textos, idsEnUso(b.Esquema))
		}
		b.Esquema.Campos[i] = c
		return "ok", "Editado " + descripcionCampo(c), nil
	})
}

func (w *trabajoFormulario) moverCampo(in map[string]any) (string, error) {
	id, _ := in["id"].(string)
	ref, enviado := in["despuesDe"]
	if s, _ := ref.(string); enviado && s != "" && s == id {
		return "", errors.New("un campo no puede ir después de sí mismo")
	}
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		i := indiceCampo(b.Esquema.Campos, id)
		if i < 0 {
			return "", "", fmt.Errorf("no hay ningún campo con id «%s»", id)
		}
		c := b.Esquema.Campos[i]
		resto := slices.Delete(slices.Clone(b.Esquema.Campos), i, i+1)
		pos, err := posicion(resto, ref, enviado)
		if err != nil {
			return "", "", err
		}
		b.Esquema.Campos = slices.Insert(resto, pos, c)
		return "ok", "Movido " + descripcionCampo(c), nil
	})
}

func (w *trabajoFormulario) duplicarCampo(in map[string]any) (string, error) {
	id, _ := in["id"].(string)
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		i := indiceCampo(b.Esquema.Campos, id)
		if i < 0 {
			return "", "", fmt.Errorf("no hay ningún campo con id «%s»", id)
		}
		usados := idsEnUso(b.Esquema)
		c, err := fusionar(b.Esquema.Campos[i], nil) // copia independiente del original
		if err != nil {
			return "", "", err
		}
		c.ID = generarID("c", usados)
		for k := range c.Opciones {
			c.Opciones[k].ID = generarID("o", usados)
		}
		b.Esquema.Campos = slices.Insert(b.Esquema.Campos, i+1, c)
		return resultadoID(c.ID), "Duplicado " + descripcionCampo(c), nil
	})
}

func (w *trabajoFormulario) borrarCampo(in map[string]any) (string, error) {
	id, _ := in["id"].(string)
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		i := indiceCampo(b.Esquema.Campos, id)
		if i < 0 {
			return "", "", fmt.Errorf("no hay ningún campo con id «%s»", id)
		}
		c := b.Esquema.Campos[i]
		b.Esquema.Campos = slices.Delete(b.Esquema.Campos, i, i+1)
		return "ok", "Borrado " + descripcionCampo(c), nil
	})
}

func (w *trabajoFormulario) editarOpciones(in map[string]any) (string, error) {
	id, _ := in["id"].(string)
	textos, conOpciones, err := opcionesDeEntrada(in)
	if err != nil {
		return "", err
	}
	if !conOpciones {
		return "", errors.New("falta «opciones»: la lista completa de textos de opción")
	}
	return w.mutar(func(b *BorradorFormulario) (string, string, error) {
		i := indiceCampo(b.Esquema.Campos, id)
		if i < 0 {
			return "", "", fmt.Errorf("no hay ningún campo con id «%s»", id)
		}
		c := b.Esquema.Campos[i]
		fijarOpciones(&c, textos, idsEnUso(b.Esquema))
		b.Esquema.Campos[i] = c
		return "ok", "Opciones de " + descripcionCampo(c), nil
	})
}

// fusionar overlays the props the model sent on the current JSON of v: keys not sent keep their value, nested objects
// merge key by key, null clears. It returns the new value; a value of the wrong type is an error for the model.
func fusionar[T any](v T, props map[string]any) (T, error) {
	var zero T
	base, err := json.Marshal(v)
	if err != nil {
		return zero, err
	}
	var m map[string]any
	if err := json.Unmarshal(base, &m); err != nil {
		return zero, err
	}
	for k, nuevo := range props {
		if sub, ok := nuevo.(map[string]any); ok {
			if actual, ok := m[k].(map[string]any); ok {
				maps.Copy(actual, sub)
				continue
			}
		}
		m[k] = nuevo
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return zero, err
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		return zero, fmt.Errorf("propiedades no válidas: %v", err)
	}
	return out, nil
}

// clonar is a deep copy of the draft (JSON round trip, the same shape the editor uses).
func clonar(b BorradorFormulario) (BorradorFormulario, error) {
	raw, err := json.Marshal(b)
	if err != nil {
		return BorradorFormulario{}, err
	}
	var c BorradorFormulario
	err = json.Unmarshal(raw, &c)
	return c, err
}

// opcionesDeEntrada takes the "opciones" out of the input: the full list of option texts. conOpciones tells whether
// the input carried the key at all.
func opcionesDeEntrada(in map[string]any) (textos []string, conOpciones bool, err error) {
	v, ok := in["opciones"]
	if !ok {
		return nil, false, nil
	}
	delete(in, "opciones")
	if v == nil {
		return []string{}, true, nil
	}
	arr, ok := v.([]any)
	if !ok {
		return nil, true, errors.New("opciones debe ser una lista de textos")
	}
	textos = make([]string, 0, len(arr))
	for _, x := range arr {
		s, ok := x.(string)
		if !ok {
			return nil, true, errors.New("cada opción debe ser un texto")
		}
		textos = append(textos, s)
	}
	return textos, true, nil
}

// fijarOpciones sets the options of a field from their texts. An option whose text is still there keeps its id; new
// texts get new ids. usados holds every id in the form, so new ids never collide.
func fijarOpciones(c *formularios.Campo, textos []string, usados map[string]bool) {
	viejas := c.Opciones
	marcadas := make([]bool, len(viejas))
	nuevas := make([]formularios.Opcion, 0, len(textos))
	for _, t := range textos {
		t = strings.TrimSpace(t)
		id := ""
		for i, o := range viejas {
			if !marcadas[i] && strings.TrimSpace(o.Texto) == t {
				marcadas[i], id = true, o.ID
				break
			}
		}
		if id == "" {
			id = generarID("o", usados)
		}
		nuevas = append(nuevas, formularios.Opcion{ID: id, Texto: t})
	}
	c.Opciones = nuevas
}

// posicion says where a field goes: at the end when the reference was not sent, at the start for "", and after the
// field with that id otherwise.
func posicion(campos []formularios.Campo, ref any, enviado bool) (int, error) {
	if !enviado {
		return len(campos), nil
	}
	if ref == nil {
		return 0, nil
	}
	s, ok := ref.(string)
	if !ok {
		return 0, errors.New("despuesDe debe ser el id de un campo, o vacío para ponerlo al principio")
	}
	if s == "" {
		return 0, nil
	}
	i := indiceCampo(campos, s)
	if i < 0 {
		return 0, fmt.Errorf("no hay ningún campo con id «%s»", s)
	}
	return i + 1, nil
}

// parsearCierre reads the closing date of the form: null or "" means no closing date.
func parsearCierre(v any) (*time.Time, error) {
	if v == nil {
		return nil, nil
	}
	s, ok := v.(string)
	if !ok {
		return nil, errors.New("cierreAt debe ser una fecha ISO 8601 o cadena vacía")
	}
	if strings.TrimSpace(s) == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, errors.New("cierreAt debe tener formato AAAA-MM-DDTHH:MM:SSZ (ISO 8601)")
	}
	return &t, nil
}

func indiceCampo(campos []formularios.Campo, id string) int {
	return slices.IndexFunc(campos, func(c formularios.Campo) bool { return c.ID == id })
}

// idsEnUso collects every field and option id of the form.
func idsEnUso(e formularios.Esquema) map[string]bool {
	usados := map[string]bool{}
	for _, c := range e.Campos {
		usados[c.ID] = true
		for _, o := range c.Opciones {
			usados[o.ID] = true
		}
	}
	return usados
}

// generarID makes a new id with the prefix that no element of the form uses yet, and marks it as used.
func generarID(prefijo string, usados map[string]bool) string {
	for {
		id := formularios.NuevoID(prefijo)
		if !usados[id] {
			usados[id] = true
			return id
		}
	}
}

// resultadoID is the answer of the tools that create a field: an object, so tool_chain can use {"$ref":"paso.id"}.
func resultadoID(id string) string {
	b, _ := json.Marshal(map[string]any{"ok": true, "id": id})
	return string(b)
}

// descripcionCampo names a field for the change list: «etiqueta» (tipo), or just (tipo) when it has no label.
func descripcionCampo(c formularios.Campo) string {
	tipo := nombreTipo[c.Tipo]
	if tipo == "" {
		tipo = c.Tipo
	}
	if t := strings.TrimSpace(c.Etiqueta); t != "" {
		return fmt.Sprintf("«%s» (%s)", t, tipo)
	}
	return "(" + tipo + ")"
}

// cambioLista names the props a change touched, in Spanish, for the change list ("" when there are none).
func cambioLista(prefijo string, in map[string]any) string {
	if len(in) == 0 {
		return ""
	}
	nombres := []string{}
	for _, k := range slices.Sorted(maps.Keys(in)) {
		if e, ok := etiquetasProp[k]; ok {
			nombres = append(nombres, e)
		} else {
			nombres = append(nombres, k)
		}
	}
	return prefijo + strings.Join(nombres, ", ")
}

func enumSchema(vals ...string) map[string]any {
	return map[string]any{"type": "string", "enum": vals}
}

// unir merges property maps into a new one.
func unir(ms ...map[string]any) map[string]any {
	out := map[string]any{}
	for _, m := range ms {
		maps.Copy(out, m)
	}
	return out
}

// propsCampo are the properties a field accepts; editar_campo takes any subset of them.
func propsCampo() map[string]any {
	return map[string]any{
		"etiqueta":    map[string]any{"type": "string", "maxLength": 300, "description": "Pregunta o texto del campo (obligatoria salvo en separador)"},
		"ayuda":       map[string]any{"type": "string", "maxLength": 500, "description": "Texto de ayuda bajo la etiqueta"},
		"obligatorio": schBool,
		"placeholder": map[string]any{"type": "string", "maxLength": 200},
		"ancho":       enumSchema("completo", "mitad"),
		"opciones": map[string]any{"type": "array", "maxItems": 30, "items": map[string]any{"type": "string", "maxLength": 120},
			"description": "Lista COMPLETA de textos de opción (solo tipos con opciones). Se conservan los ids de las opciones cuyo texto no cambia."},
		"min":         schNum,
		"max":         schNum,
		"paso":        schNum,
		"minEtiqueta": map[string]any{"type": "string", "maxLength": 100},
		"maxEtiqueta": map[string]any{"type": "string", "maxLength": 100},
		"validacion": obj(map[string]any{
			"minLargo": entero,
			"maxLargo": entero,
			"patron":   map[string]any{"type": "string", "maxLength": 200, "description": "Expresión regular (solo texto corto, texto largo, email, teléfono y fecha)"},
		}),
		"archivo": obj(map[string]any{
			"tipos":       map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Tipos MIME, p. ej. image/* o application/pdf"},
			"maxMb":       map[string]any{"type": "integer", "minimum": 1, "maximum": 20},
			"maxArchivos": map[string]any{"type": "integer", "minimum": 1, "maximum": 5},
		}),
		"estilo": obj(map[string]any{
			"alinear": enumSchema("izquierda", "centro", "derecha"),
			"tamano":  enumSchema("s", "m", "l"),
			"color":   schColor,
			"negrita": schBool,
			"fondo":   schColor,
			"borde":   schBool,
		}),
		"imagen": map[string]any{"type": "string", "description": "URL https de la imagen (solo tipo imagen)"},
		"alt":    map[string]any{"type": "string", "maxLength": 300},
	}
}

// herramientasFormulario are the tools of the form assistant.
func herramientasFormulario() []map[string]any {
	campoID := map[string]any{"type": "string", "description": "id del campo (c_...)"}
	despues := map[string]any{"type": "string", "description": "id del campo tras el que va; \"\" = al principio"}
	return []map[string]any{
		herramienta("ver_formulario", "Devuelve el borrador completo con los ids de campos y opciones, el tema, el email, el WhatsApp y si es solo web.", obj(map[string]any{})),
		herramienta("editar_ajustes", "Cambia los textos generales del formulario. Solo los campos que pases.", obj(map[string]any{
			"titulo":         map[string]any{"type": "string", "maxLength": 300},
			"descripcion":    map[string]any{"type": "string", "maxLength": 2000, "description": "Introducción; admite **negrita** y saltos de línea"},
			"botonEnviar":    map[string]any{"type": "string"},
			"mensajeGracias": map[string]any{"type": "string"},
			"permiteEditar":  map[string]any{"type": "boolean", "description": "Si el atleta puede cambiar su respuesta después de enviarla"},
			"cierreAt":       map[string]any{"type": "string", "description": "Cierre ISO 8601 (AAAA-MM-DDTHH:MM:SSZ); cadena vacía = sin cierre"},
		})),
		herramienta("editar_tema", "Cambia la apariencia del formulario (web y email). Solo los campos que pases.", obj(map[string]any{
			"acento":     schColor,
			"fondo":      schColor,
			"superficie": schColor,
			"texto":      schColor,
			"radio":      map[string]any{"type": "integer", "minimum": 0, "maximum": 24, "description": "Redondeo de las esquinas en px"},
			"fuente":     enumSchema("sistema", "serif", "mono"),
			"densidad":   enumSchema("compacta", "normal", "amplia"),
		})),
		herramienta("anadir_campo", "Añade un campo y devuelve su id nuevo. despuesDe: id del campo tras el que va; \"\" = al principio; omitido = al final.",
			obj(unir(propsCampo(), map[string]any{"tipo": enumSchema(tiposCampo...), "despuesDe": despues}), "tipo")),
		herramienta("editar_campo", "Cambia propiedades de un campo existente. Solo las que pases; opciones = lista completa de textos. No cambia el id.",
			obj(unir(propsCampo(), map[string]any{"id": campoID, "tipo": enumSchema(tiposCampo...)}), "id")),
		herramienta("mover_campo", "Mueve un campo tras otro (despuesDe) o al principio (\"\").",
			obj(map[string]any{"id": campoID, "despuesDe": despues}, "id", "despuesDe")),
		herramienta("duplicar_campo", "Copia un campo justo debajo, con id nuevo (y ids nuevos para sus opciones). Devuelve el id de la copia.",
			obj(map[string]any{"id": campoID}, "id")),
		herramienta("borrar_campo", "Quita un campo del formulario.", obj(map[string]any{"id": campoID}, "id")),
		herramienta("editar_opciones", "Fija la lista completa de opciones de un campo con opciones. Las opciones cuyo texto no cambia conservan su id.",
			obj(map[string]any{"id": campoID, "opciones": propsCampo()["opciones"]}, "id", "opciones")),
		herramienta("editar_email", "Cambia el asunto, el preheader y la introducción del email de invitación. Variables: {{nombre}}, {{competicion}}, {{formulario}}.",
			obj(map[string]any{
				"asunto":    map[string]any{"type": "string", "maxLength": formularios.MaxAsuntoEmail},
				"preheader": map[string]any{"type": "string", "maxLength": formularios.MaxPreheaderEmail},
				"intro":     map[string]any{"type": "string", "maxLength": formularios.MaxIntroEmail},
			})),
		herramienta("editar_whatsapp", "Cambia el texto del mensaje de WhatsApp (con el enlace {{enlace}}). Variables: {{nombre}}, {{competicion}}, {{formulario}}. Texto vacío = texto por defecto.",
			obj(map[string]any{"texto": map[string]any{"type": "string", "maxLength": formularios.MaxTextoWhatsapp}}, "texto")),
		herramientaCadena(),
	}
}
