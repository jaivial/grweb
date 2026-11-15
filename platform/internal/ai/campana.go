package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// Campaign assistant with tools: the model edits a working copy of the whole campaign draft (data, channels,
// audience, sending pace and every block) through function calls. The result goes back to the editor, which applies
// it as an undoable change; nothing is saved or sent from here.

// Borrador is the editable part of a campaign (same shape as CampanaIn of messaging).
type Borrador struct {
	Nombre      string            `json:"nombre"`
	Asunto      string            `json:"asunto"`
	Preheader   string            `json:"preheader"`
	Canales     []string          `json:"canales"`
	Diseno      []json.RawMessage `json:"diseno"`
	SegmentoID  string            `json:"segmentoId,omitempty"`
	EmailPorMin int               `json:"emailPorMin"`
	WaPorMin    int               `json:"waPorMin"`
	WhatsApp    *WAMsg            `json:"whatsapp,omitempty" doc:"Mensaje de WhatsApp propio; sin él se deriva del diseño"`
}

// WAMsg is the WhatsApp message of a campaign (same shape as WhatsApp of messaging).
type WAMsg struct {
	Texto   string    `json:"texto" maxLength:"4000"`
	Imagen  string    `json:"imagen,omitempty" maxLength:"500"`
	Enlaces []EnlaceW `json:"enlaces" maxItems:"10"`
}

// EnlaceW is a button of the WhatsApp message.
type EnlaceW struct {
	Texto string `json:"texto" maxLength:"60"`
	URL   string `json:"url" maxLength:"500"`
}

// SegmentoRef is a segment the assistant may pick as audience.
type SegmentoRef struct {
	ID     string `json:"id" maxLength:"40"`
	Nombre string `json:"nombre" maxLength:"160"`
}

const sistemaCampana = `Eres el asistente de campañas de una competición de powerlifting (%s, %s, %s), dentro del editor del backoffice.
Editas el BORRADOR de una campaña de email + WhatsApp SOLO con las herramientas. Puedes cambiar cualquier cosa: nombre interno, asunto,
preheader, canales, segmento de destinatarios, ritmo de envío y todos los bloques del diseño. No puedes enviar ni programar: eso lo hace
el equipo con el botón «Enviar». Cuando termines responde con 1-2 frases en español contando qué has cambiado.

Bloques (campo "tipo" y sus campos):
- cabecera: logo de la marca (sin campos).
- portada: imagen ancha. Campos: imagen (URL https), alt.
- titulo: texto.
- texto: texto (admite **negrita** y saltos de línea).
- boton: texto, url.
- imagen: imagen (URL https), alt, url opcional.
- lista: items (array de textos cortos, máximo 12).
- dos_columnas: texto (izquierda), texto2 (derecha).
- cuenta_atras: fecha (AAAA-MM-DDTHH:MM, hora de Madrid), texto opcional encima.
- horario: fecha (AAAA-MM-DD): el horario publicado de ese día.
- separador (sin campos), espacio: alto (8-64).
Todos llevan "canal": "ambos" | "email" | "whatsapp" y opcional "alinear": "izquierda" | "centro".
Variables que se rellenan al enviar (escríbelas tal cual en los textos): {{nombre}} (nombre de pila del destinatario), {{competicion}},
{{fechas}}, {{sede}}, {{web}}.

WhatsApp: la campaña tiene UN mensaje de WhatsApp. Por defecto se deriva del diseño del email (bloques «ambos» y «whatsapp»: la
primera imagen va como foto, los títulos en *negrita* y los botones como botones de enlace). Herramientas:
- ver_whatsapp: el mensaje actual y si es automático o propio.
- whatsapp_desde_email: copia el derivado del email como mensaje propio para retocarlo.
- whatsapp_desde_html: convierte un HTML (un email pegado) en mensaje propio.
- editar_whatsapp: cambia texto, imagen y/o botones del mensaje propio (si no hay, parte del derivado).
- whatsapp_automatico: vuelve a derivarlo del email.
Formato de WhatsApp: *negrita*, _cursiva_, saltos de línea; sin markdown de email (**x**). Máximo 3 botones visibles (los demás van
como línea «texto: enlace»), texto del botón ≤ 25 caracteres. La línea «Responde BAJA…» se añade sola: no la escribas.
Para que se envíe por WhatsApp el canal debe estar activo (elegir_canales).

Eficiencia: si vas a hacer varios cambios, usa tool_chain con todas las llamadas en UNA vez (por ejemplo añadir 4 bloques y ajustar
el asunto). Si un paso necesita el resultado de otro, usa {"$ref":"id_paso.ruta"} (p. ej. {"$ref":"b1.id"} tras anadir_bloque).

Reglas:
- Si hay un bloque seleccionado y la petición es ambigua, cambia solo ese.
- No inventes datos personales ni cifras de la competición que no estén en la campaña o en la petición.
- Enlaces de la web relativos: /entradas, /horarios, /atletas, /participantes, /sorteo, /inscripcion, /en-directo, /resultados, /como-llegar.
- Asunto: máximo 60 caracteres. Textos de WhatsApp breves.
- Español de España, cercano y deportivo. Sin emojis salvo que te los pidan.
- Máximo 40 bloques.`

func obj(props map[string]any, req ...string) map[string]any {
	o := map[string]any{"type": "object", "properties": props}
	if len(req) > 0 {
		o["required"] = req
	}
	return o
}

var (
	str      = map[string]any{"type": "string"}
	entero   = map[string]any{"type": "integer"}
	camposBl = map[string]any{
		"texto": str, "texto2": str, "url": str, "imagen": str, "alt": str, "fecha": str, "alto": entero,
		"items":   map[string]any{"type": "array", "items": str},
		"canal":   map[string]any{"type": "string", "enum": []string{"ambos", "email", "whatsapp"}},
		"alinear": map[string]any{"type": "string", "enum": []string{"izquierda", "centro"}},
	}
	tiposLista = []string{"cabecera", "portada", "titulo", "texto", "boton", "imagen", "lista", "dos_columnas", "cuenta_atras", "horario", "separador", "espacio"}
)

func herramientas() []map[string]any {
	conTipo := map[string]any{"tipo": map[string]any{"type": "string", "enum": tiposLista}, "despuesDe": map[string]any{"type": "string", "description": "id del bloque tras el que se inserta; vacío = al principio, omitido = al final"}}
	for k, v := range camposBl {
		conTipo[k] = v
	}
	conID := map[string]any{"id": str}
	for k, v := range camposBl {
		conID[k] = v
	}
	t := func(n, d string, s map[string]any) map[string]any {
		return map[string]any{"name": n, "description": d, "input_schema": s}
	}
	return []map[string]any{
		t("ver_campana", "Devuelve el borrador actual completo (datos, canales, segmento, ritmo, bloques con sus id y el WhatsApp propio; whatsapp null = derivado del email).", obj(map[string]any{})),
		t("editar_datos", "Cambia el nombre interno, el asunto del email y/o el preheader.", obj(map[string]any{"nombre": str, "asunto": str, "preheader": str})),
		t("elegir_canales", "Fija los canales de la campaña.", obj(map[string]any{"canales": map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": []string{"email", "whatsapp"}}}}, "canales")),
		t("listar_segmentos", "Lista los segmentos de contactos disponibles como destinatarios.", obj(map[string]any{})),
		t("elegir_segmento", "Fija el segmento de destinatarios; segmentoId vacío = todos los contactos con consentimiento.", obj(map[string]any{"segmentoId": str}, "segmentoId")),
		t("ritmo_envio", "Mensajes por minuto: email 1-600, WhatsApp 1-60 (con número propio mejor ≤ 6).", obj(map[string]any{"emailPorMin": entero, "waPorMin": entero})),
		t("anadir_bloque", "Añade un bloque nuevo con sus campos.", obj(conTipo, "tipo")),
		t("editar_bloque", "Cambia campos de un bloque existente (solo los que pases).", obj(conID, "id")),
		t("borrar_bloque", "Quita un bloque.", obj(map[string]any{"id": str}, "id")),
		t("mover_bloque", "Mueve un bloque a la posición indicada (0 = primero).", obj(map[string]any{"id": str, "posicion": entero}, "id", "posicion")),
		t("reemplazar_diseno", "Sustituye todos los bloques (para rediseños completos). Cada bloque lleva tipo y sus campos; conserva los id de los que mantengas.", obj(map[string]any{"diseno": map[string]any{"type": "array", "items": map[string]any{"type": "object"}}}, "diseno")),
		t("ver_whatsapp", "Devuelve el mensaje de WhatsApp actual (texto, imagen, botones) y su modo: automatico (derivado del email) o propio.", obj(map[string]any{})),
		t("whatsapp_desde_email", "Copia el WhatsApp derivado del diseño del email como mensaje propio, para retocarlo después.", obj(map[string]any{})),
		t("whatsapp_desde_html", "Convierte un HTML (un email o fragmento pegado por el usuario) en el mensaje propio de WhatsApp.", obj(map[string]any{"html": str}, "html")),
		t("editar_whatsapp", "Cambia el mensaje propio de WhatsApp (solo los campos que pases; sin mensaje propio parte del derivado). botones sustituye la lista entera.", obj(map[string]any{
			"texto": map[string]any{"type": "string", "description": "Formato WhatsApp: *negrita*, _cursiva_"}, "imagen": map[string]any{"type": "string", "description": "URL https de la foto; vacío = sin foto"},
			"botones": map[string]any{"type": "array", "maxItems": 10, "items": obj(map[string]any{"texto": str, "url": str}, "texto", "url")},
		})),
		t("whatsapp_automatico", "Quita el mensaje propio: el WhatsApp vuelve a derivarse del diseño del email.", obj(map[string]any{})),
		t("tool_chain", "Ejecuta hasta 20 herramientas en UNA llamada, en orden, con las mismas reglas que una a una. calls: [{id, name, input}]; id único, name otra herramienta (no tool_chain). "+
			"En input cualquier valor puede ser {\"$ref\":\"id_anterior.ruta\"} (la ruta empieza en el resultado JSON de ese paso y admite índices). Devuelve el resultado de cada paso; "+
			"si alguno falla, NO repitas los que tengan ok=true.", obj(map[string]any{"calls": map[string]any{"type": "array", "minItems": 1, "maxItems": maxCadena,
			"items": obj(map[string]any{"id": str, "name": str, "input": map[string]any{"type": "object"}}, "id", "name", "input")}}, "calls")),
	}
}

// maxCadena is the number of calls of one tool_chain.
const maxCadena = 20

// trabajo is the working copy the tools edit.
type trabajo struct {
	b       Borrador
	bloques []map[string]any
	segs    []SegmentoRef
	cambios []string
	sig     int
	// whatsapp asks messaging for the WhatsApp of the current design ({diseno}) or of an HTML ({html}).
	whatsapp func(body map[string]any) (WAMsg, error)
}

func (w *trabajo) nuevoID() string {
	for {
		w.sig++
		id := fmt.Sprintf("ia%d", w.sig)
		if w.idx(id) < 0 {
			return id
		}
	}
}

func (w *trabajo) idx(id string) int {
	return slices.IndexFunc(w.bloques, func(b map[string]any) bool { return b["id"] == id })
}

// limpiar keeps only the known fields of a block and checks its type.
func limpiar(in map[string]any) (map[string]any, error) {
	tipo, _ := in["tipo"].(string)
	if !tipos[tipo] {
		return nil, fmt.Errorf("tipo de bloque «%s» no válido", tipo)
	}
	out := map[string]any{"tipo": tipo}
	for k := range camposBl {
		if v, ok := in[k]; ok && v != nil {
			out[k] = v
		}
	}
	if id, ok := in["id"].(string); ok && id != "" {
		out["id"] = id
	}
	if _, ok := out["canal"]; !ok {
		out["canal"] = "ambos"
	}
	return out, nil
}

func (w *trabajo) ejecutar(nombre string, raw json.RawMessage) (string, error) {
	var in map[string]any
	_ = json.Unmarshal(raw, &in)
	s := func(k string) (string, bool) { v, ok := in[k].(string); return strings.TrimSpace(v), ok }
	switch nombre {
	case "ver_campana":
		b, _ := json.Marshal(map[string]any{"nombre": w.b.Nombre, "asunto": w.b.Asunto, "preheader": w.b.Preheader, "canales": w.b.Canales, "segmentoId": w.b.SegmentoID, "emailPorMin": w.b.EmailPorMin, "waPorMin": w.b.WaPorMin, "diseno": w.bloques, "whatsapp": w.b.WhatsApp})
		return string(b), nil
	case "editar_datos":
		if v, ok := s("nombre"); ok && v != "" {
			w.b.Nombre = trunc(v, 160)
			w.cambios = append(w.cambios, "nombre")
		}
		if v, ok := s("asunto"); ok {
			w.b.Asunto = trunc(v, 160)
			w.cambios = append(w.cambios, "asunto")
		}
		if v, ok := s("preheader"); ok {
			w.b.Preheader = trunc(v, 200)
			w.cambios = append(w.cambios, "preheader")
		}
		return "ok", nil
	case "elegir_canales":
		var c []string
		for _, x := range []string{"email", "whatsapp"} {
			if arr, _ := in["canales"].([]any); slices.Contains(arr, any(x)) {
				c = append(c, x)
			}
		}
		if len(c) == 0 {
			return "", fmt.Errorf("hace falta al menos un canal")
		}
		w.b.Canales = c
		w.cambios = append(w.cambios, "canales")
		return "ok", nil
	case "listar_segmentos":
		b, _ := json.Marshal(w.segs)
		return string(b), nil
	case "elegir_segmento":
		id, _ := s("segmentoId")
		if id != "" && !slices.ContainsFunc(w.segs, func(x SegmentoRef) bool { return x.ID == id }) {
			return "", fmt.Errorf("segmento %s no existe; usa listar_segmentos", id)
		}
		w.b.SegmentoID = id
		w.cambios = append(w.cambios, "destinatarios")
		return "ok", nil
	case "ritmo_envio":
		if v, ok := in["emailPorMin"].(float64); ok {
			w.b.EmailPorMin = min(600, max(1, int(v)))
		}
		if v, ok := in["waPorMin"].(float64); ok {
			w.b.WaPorMin = min(60, max(1, int(v)))
		}
		w.cambios = append(w.cambios, "ritmo")
		return "ok", nil
	case "anadir_bloque":
		if len(w.bloques) >= 40 {
			return "", fmt.Errorf("máximo 40 bloques")
		}
		b, err := limpiar(in)
		if err != nil {
			return "", err
		}
		b["id"] = w.nuevoID()
		pos := len(w.bloques)
		if d, ok := in["despuesDe"].(string); ok {
			pos = 0
			if d != "" {
				if i := w.idx(d); i >= 0 {
					pos = i + 1
				} else {
					return "", fmt.Errorf("no hay bloque %s", d)
				}
			}
		}
		w.bloques = slices.Insert(w.bloques, pos, b)
		w.cambios = append(w.cambios, "diseño")
		return "añadido con id " + b["id"].(string), nil
	case "editar_bloque":
		id, _ := s("id")
		i := w.idx(id)
		if i < 0 {
			return "", fmt.Errorf("no hay bloque %s", id)
		}
		for k := range camposBl {
			if v, ok := in[k]; ok {
				w.bloques[i][k] = v
			}
		}
		w.cambios = append(w.cambios, "diseño")
		return "ok", nil
	case "borrar_bloque":
		id, _ := s("id")
		i := w.idx(id)
		if i < 0 {
			return "", fmt.Errorf("no hay bloque %s", id)
		}
		w.bloques = slices.Delete(w.bloques, i, i+1)
		w.cambios = append(w.cambios, "diseño")
		return "ok", nil
	case "mover_bloque":
		id, _ := s("id")
		i := w.idx(id)
		p, _ := in["posicion"].(float64)
		if i < 0 {
			return "", fmt.Errorf("no hay bloque %s", id)
		}
		b := w.bloques[i]
		w.bloques = slices.Delete(w.bloques, i, i+1)
		w.bloques = slices.Insert(w.bloques, min(len(w.bloques), max(0, int(p))), b)
		w.cambios = append(w.cambios, "diseño")
		return "ok", nil
	case "reemplazar_diseno":
		arr, _ := in["diseno"].([]any)
		if len(arr) == 0 || len(arr) > 40 {
			return "", fmt.Errorf("el diseño debe tener entre 1 y 40 bloques")
		}
		nb := make([]map[string]any, 0, len(arr))
		for k, x := range arr {
			m, _ := x.(map[string]any)
			b, err := limpiar(m)
			if err != nil {
				return "", fmt.Errorf("bloque %d: %w", k+1, err)
			}
			nb = append(nb, b)
		}
		w.bloques = nb
		visto := map[string]bool{}
		for _, b := range w.bloques {
			if id, _ := b["id"].(string); id == "" || visto[id] {
				b["id"] = w.nuevoID()
			}
			visto[b["id"].(string)] = true
		}
		w.cambios = append(w.cambios, "diseño")
		return "ok", nil
	case "ver_whatsapp":
		m, modo := w.b.WhatsApp, "propio"
		if m == nil {
			auto, err := w.derivado()
			if err != nil {
				return "", err
			}
			m, modo = &auto, "automatico"
		}
		b, _ := json.Marshal(map[string]any{"modo": modo, "canalActivo": slices.Contains(w.b.Canales, "whatsapp"), "texto": m.Texto, "imagen": m.Imagen, "botones": m.Enlaces})
		return string(b), nil
	case "whatsapp_desde_email":
		auto, err := w.derivado()
		if err != nil {
			return "", err
		}
		w.b.WhatsApp = &auto
		w.cambios = append(w.cambios, "whatsapp")
		return w.ejecutar("ver_whatsapp", nil)
	case "whatsapp_desde_html":
		h, _ := in["html"].(string)
		if strings.TrimSpace(h) == "" {
			return "", fmt.Errorf("falta el html")
		}
		m, err := w.whatsapp(map[string]any{"html": trunc(h, 500000)})
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(m.Texto) == "" && m.Imagen == "" {
			return "", fmt.Errorf("ese HTML no tiene texto que pasar a WhatsApp")
		}
		w.b.WhatsApp = &m
		w.cambios = append(w.cambios, "whatsapp")
		return w.ejecutar("ver_whatsapp", nil)
	case "editar_whatsapp":
		if w.b.WhatsApp == nil {
			auto, err := w.derivado()
			if err != nil {
				return "", err
			}
			w.b.WhatsApp = &auto
		}
		m := *w.b.WhatsApp
		if v, ok := in["texto"].(string); ok {
			m.Texto = trunc(strings.TrimSpace(v), 4000)
		}
		if v, ok := in["imagen"].(string); ok {
			v = strings.TrimSpace(v)
			if v != "" && !strings.HasPrefix(v, "https://") && !strings.HasPrefix(v, "/") {
				return "", fmt.Errorf("la imagen debe empezar por https://")
			}
			m.Imagen = v
		}
		if arr, ok := in["botones"].([]any); ok {
			if len(arr) > 10 {
				return "", fmt.Errorf("máximo 10 botones")
			}
			m.Enlaces = []EnlaceW{}
			for k, x := range arr {
				o, _ := x.(map[string]any)
				t, _ := o["texto"].(string)
				u, _ := o["url"].(string)
				t, u = strings.TrimSpace(t), strings.TrimSpace(u)
				if t == "" || (!strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "/")) {
					return "", fmt.Errorf("botón %d: falta el texto o el enlace (https:// o /)", k+1)
				}
				m.Enlaces = append(m.Enlaces, EnlaceW{Texto: trunc(t, 25), URL: u})
			}
		}
		if m.Texto == "" {
			return "", fmt.Errorf("el texto del WhatsApp no puede quedar vacío")
		}
		w.b.WhatsApp = &m
		w.cambios = append(w.cambios, "whatsapp")
		return "ok", nil
	case "whatsapp_automatico":
		w.b.WhatsApp = nil
		w.cambios = append(w.cambios, "whatsapp")
		return "ok: el WhatsApp se deriva del email", nil
	case "tool_chain":
		return w.cadena(raw)
	}
	return "", fmt.Errorf("herramienta %s desconocida", nombre)
}

// derivado is the WhatsApp that messaging derives from the current blocks.
func (w *trabajo) derivado() (WAMsg, error) {
	if w.whatsapp == nil {
		return WAMsg{}, fmt.Errorf("WhatsApp no disponible")
	}
	return w.whatsapp(map[string]any{"nombre": w.b.Nombre, "diseno": w.bloques})
}

var reIDPaso = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// cadena runs an ordered batch of tools on the same working copy (one model turn instead of one per change). A step
// may feed any JSON value of a previous result into its input with {"$ref":"paso.ruta.al.valor"}.
func (w *trabajo) cadena(raw json.RawMessage) (string, error) {
	var in struct {
		Calls json.RawMessage `json:"calls"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return "", fmt.Errorf("argumentos de tool_chain ilegibles: %v; envía menos llamadas", err)
	}
	cs := in.Calls
	if t := strings.TrimSpace(string(cs)); strings.HasPrefix(t, `"`) { // models sometimes stringify the array
		var s string
		if json.Unmarshal(cs, &s) == nil {
			cs = json.RawMessage(s)
		}
	}
	var calls []struct {
		ID    string          `json:"id"`
		Name  string          `json:"name"`
		Input json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(cs, &calls); err != nil || len(calls) == 0 {
		return "", fmt.Errorf("calls debe ser un array de {id, name, input}")
	}
	if len(calls) > maxCadena {
		return "", fmt.Errorf("demasiadas llamadas: máximo %d", maxCadena)
	}
	type resultadoPaso struct {
		ID     string          `json:"id"`
		Name   string          `json:"name"`
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result,omitempty"`
		Error  string          `json:"error,omitempty"`
	}
	salidas := map[string]any{}
	pasos := make([]resultadoPaso, 0, len(calls))
	ok := 0
	for _, c := range calls {
		c.ID, c.Name = strings.TrimSpace(c.ID), strings.TrimSpace(c.Name)
		p := resultadoPaso{ID: c.ID, Name: c.Name}
		var err error
		var entrada json.RawMessage
		switch {
		case !reIDPaso.MatchString(c.ID):
			err = fmt.Errorf("id inválido: usa 1-40 letras, números, _ o -")
		case salidas[c.ID] != nil:
			err = fmt.Errorf("id duplicado")
		case c.Name == "" || c.Name == "tool_chain":
			err = fmt.Errorf("name debe ser otra herramienta (no tool_chain)")
		default:
			if t := strings.TrimSpace(string(c.Input)); strings.HasPrefix(t, `"`) {
				var s string
				if json.Unmarshal(c.Input, &s) == nil && json.Valid([]byte(s)) {
					c.Input = json.RawMessage(s)
				}
			}
			entrada, err = resolverRefs(c.Input, salidas)
		}
		var r string
		if err == nil {
			r, err = w.ejecutar(c.Name, entrada)
		}
		var valor any
		if err != nil {
			p.Error = err.Error()
			valor = map[string]any{"error": err.Error()}
		} else {
			p.OK = true
			ok++
			if json.Unmarshal([]byte(r), &valor) != nil {
				// plain answers («ok», «añadido con id ia3») become an object; the new block id is reachable as .id
				o := map[string]any{"texto": r}
				if id, encontrado := strings.CutPrefix(r, "añadido con id "); encontrado {
					o["id"] = id
				}
				valor = o
			}
		}
		if c.ID != "" && salidas[c.ID] == nil {
			salidas[c.ID] = valor
		}
		p.Result, _ = json.Marshal(valor)
		pasos = append(pasos, p)
	}
	b, _ := json.Marshal(map[string]any{"tool": "tool_chain", "count": len(pasos), "succeeded": ok, "results": pasos})
	return string(b), nil
}

// resolverRefs replaces every exact {"$ref":"paso.ruta"} object of an input (recursively) with that value.
func resolverRefs(raw json.RawMessage, salidas map[string]any) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage(`{}`), nil
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, fmt.Errorf("input JSON inválido")
	}
	var res func(any) (any, error)
	res = func(v any) (any, error) {
		switch x := v.(type) {
		case map[string]any:
			if ref, ok := x["$ref"].(string); ok && len(x) == 1 {
				return buscarRef(ref, salidas)
			}
			out := make(map[string]any, len(x))
			for k, it := range x {
				r, err := res(it)
				if err != nil {
					return nil, err
				}
				out[k] = r
			}
			return out, nil
		case []any:
			out := make([]any, len(x))
			for i, it := range x {
				r, err := res(it)
				if err != nil {
					return nil, err
				}
				out[i] = r
			}
			return out, nil
		}
		return v, nil
	}
	r, err := res(v)
	if err != nil {
		return nil, err
	}
	b, err := json.Marshal(r)
	return b, err
}

func buscarRef(ref string, salidas map[string]any) (any, error) {
	partes := strings.Split(strings.Trim(strings.TrimSpace(ref), "."), ".")
	v, ok := salidas[partes[0]]
	if !ok {
		return nil, fmt.Errorf("$ref apunta a un paso anterior desconocido: %s", partes[0])
	}
	for _, p := range partes[1:] {
		switch x := v.(type) {
		case map[string]any:
			v, ok = x[p]
		case []any:
			i, err := strconv.Atoi(p)
			if err != nil || i < 0 || i >= len(x) {
				return nil, fmt.Errorf("$ref con índice inválido: %s", p)
			}
			v, ok = x[i], true
		default:
			ok = false
		}
		if !ok {
			return nil, fmt.Errorf("$ref no existe: %s", ref)
		}
	}
	return v, nil
}

func trunc(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// paso is one model turn of the tool loop.
type paso struct {
	Content    []json.RawMessage `json:"content"`
	StopReason string            `json:"stop_reason"`
}

func (s *Svc) turno(ctx context.Context, system string, msgs []map[string]any) (paso, error) {
	var p paso
	body, _ := json.Marshal(map[string]any{"model": s.modelo, "max_tokens": 8000, "system": system, "messages": msgs, "tools": herramientas()})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return p, err
	}
	req.Header.Set("x-api-key", s.key)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Content-Type", "application/json")
	res, err := s.http.Do(req)
	if err != nil {
		return p, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode >= 300 {
		return p, fmt.Errorf("MiniMax %d: %s", res.StatusCode, trunc(string(raw), 300))
	}
	return p, json.Unmarshal(raw, &p)
}

func (s *Svc) registerCampana() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Instruccion string        `json:"instruccion" minLength:"3" maxLength:"1000"`
			Campana     Borrador      `json:"campana"`
			Seleccion   string        `json:"seleccion,omitempty" maxLength:"40"`
			Historial   []mensaje     `json:"historial,omitempty" maxItems:"8"`
			Segmentos   []SegmentoRef `json:"segmentos,omitempty" maxItems:"200"`
		}
	}
	type out struct {
		Body struct {
			Respuesta string   `json:"respuesta"`
			Campana   Borrador `json:"campana"`
			Cambios   []string `json:"cambios" doc:"Partes cambiadas: nombre, asunto, preheader, canales, destinatarios, ritmo, diseño, whatsapp"`
			Modelo    string   `json:"modelo"`
			Ms        int64    `json:"ms"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "ia-campana", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/ia/campana", Summary: "Editar la campaña con IA y herramientas (devuelve el borrador; no se guarda)", Tags: []string{"IA"}, Security: bearer, MaxBodyBytes: 512 << 10},
		func(ctx context.Context, in *in) (*out, error) {
			p, err := auth.Require(ctx, in.CID.String(), "campanas.enviar")
			if err != nil {
				return nil, err
			}
			if s.key == "" {
				return nil, problem.New(http.StatusServiceUnavailable, "IA_NO_CONFIGURADA", "El asistente de IA no está configurado en este entorno.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "ia", p.UserID.String()), 30, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has hecho muchas peticiones a la IA en la última hora. Espera un poco.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "ia-comp", in.CID.String()), 300, 24*time.Hour); !r.Allowed {
				return nil, problem.TooMany("La competición ha llegado al límite diario de la IA.")
			}
			nombre, fechas, sede := "GR Strength Cup", "fecha por confirmar", ""
			if c, err := s.comps.ByID(ctx, in.CID); err == nil {
				nombre, sede = c.Nombre, c.Sede.Ciudad
				if c.FechaInicio != "" {
					fechas = c.FechaInicio + " a " + c.FechaFin
				}
			}
			w := &trabajo{b: in.Body.Campana, segs: in.Body.Segmentos}
			w.whatsapp = func(body map[string]any) (WAMsg, error) {
				var m WAMsg
				if err := s.messaging.Do(ctx, http.MethodPost, "/internal/competiciones/"+in.CID.String()+"/campanas/whatsapp", body, &m); err != nil {
					s.a.Log.Warn("whatsapp de messaging", "err", err)
					return m, fmt.Errorf("no se pudo calcular el WhatsApp ahora; inténtalo de nuevo")
				}
				if m.Enlaces == nil {
					m.Enlaces = []EnlaceW{}
				}
				return m, nil
			}
			for _, r := range in.Body.Campana.Diseno {
				var m map[string]any
				if json.Unmarshal(r, &m) == nil {
					w.bloques = append(w.bloques, m)
				}
			}
			msgs := []map[string]any{}
			for _, h := range in.Body.Historial {
				rol := "user"
				if h.Rol == "asistente" {
					rol = "assistant"
				}
				if len(msgs) == 0 && rol != "user" || len(msgs) > 0 && msgs[len(msgs)-1]["role"] == rol {
					continue // must start with the user and alternate
				}
				msgs = append(msgs, map[string]any{"role": rol, "content": h.Texto})
			}
			if len(msgs) > 0 && msgs[len(msgs)-1]["role"] == "user" {
				msgs = msgs[:len(msgs)-1]
			}
			estado, _ := w.ejecutar("ver_campana", nil)
			sel := ""
			if in.Body.Seleccion != "" {
				sel = "\nBloque seleccionado: " + in.Body.Seleccion
			}
			msgs = append(msgs, map[string]any{"role": "user", "content": "Borrador actual:\n" + estado + sel + "\n\nPetición: " + in.Body.Instruccion})
			system := fmt.Sprintf(sistemaCampana, nombre, fechas, sede)
			t0 := time.Now()
			respuesta := ""
			for vuelta := 0; ; vuelta++ {
				if vuelta == 10 {
					return nil, problem.New(http.StatusBadGateway, "IA_SIN_TERMINAR", "La IA no ha terminado la tarea. Pídelo en pasos más pequeños.")
				}
				ps, err := s.turno(ctx, system, msgs)
				if err != nil {
					s.a.Log.Warn("minimax", "err", err)
					return nil, problem.New(http.StatusBadGateway, "IA_NO_RESPONDE", "La IA no ha respondido. Inténtalo de nuevo en unos segundos.")
				}
				msgs = append(msgs, map[string]any{"role": "assistant", "content": ps.Content})
				var resultados []map[string]any
				var texto strings.Builder
				for _, c := range ps.Content {
					var b struct {
						Type  string          `json:"type"`
						Text  string          `json:"text"`
						ID    string          `json:"id"`
						Name  string          `json:"name"`
						Input json.RawMessage `json:"input"`
					}
					if json.Unmarshal(c, &b) != nil {
						continue
					}
					switch b.Type {
					case "text":
						texto.WriteString(b.Text)
					case "tool_use":
						r, err := w.ejecutar(b.Name, b.Input)
						res := map[string]any{"type": "tool_result", "tool_use_id": b.ID, "content": r}
						if err != nil {
							res["content"], res["is_error"] = "Error: "+err.Error(), true
						}
						resultados = append(resultados, res)
					}
				}
				if len(resultados) == 0 {
					respuesta = strings.TrimSpace(texto.String())
					break
				}
				msgs = append(msgs, map[string]any{"role": "user", "content": resultados})
			}
			o := &out{}
			o.Body.Respuesta, o.Body.Modelo, o.Body.Ms = respuesta, s.modelo, time.Since(t0).Milliseconds()
			if o.Body.Respuesta == "" {
				o.Body.Respuesta = "Hecho."
			}
			o.Body.Campana = w.b
			o.Body.Campana.Diseno = make([]json.RawMessage, 0, len(w.bloques))
			for _, b := range w.bloques {
				r, _ := json.Marshal(b)
				o.Body.Campana.Diseno = append(o.Body.Campana.Diseno, r)
			}
			o.Body.Cambios = []string{}
			for _, c := range w.cambios {
				if !slices.Contains(o.Body.Cambios, c) {
					o.Body.Cambios = append(o.Body.Cambios, c)
				}
			}
			instr := trunc(in.Body.Instruccion, 200)
			if err := events.Publish(ctx, s.a.Redis, s.a.Stream(), events.New(ctx, "ia.diseno", map[string]any{"instruccion": instr, "modelo": s.modelo, "ms": o.Body.Ms, "campana": w.b.Nombre},
				events.Competition(in.CID.String()), events.ForPermission("campanas.enviar"))); err != nil {
				s.a.Log.Warn("evento ia.diseno", "err", err)
			}
			return o, nil
		})
}
