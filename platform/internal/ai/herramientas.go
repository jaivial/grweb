package ai

// Herramientas compartidas de los asistentes de IA (campaña y formulario): definición de herramientas, el bucle de
// llamadas a MiniMax, tool_chain con {"$ref":"paso.ruta"}, el cupo de peticiones y el contexto de la competición.
// Cada asistente aporta sus herramientas y su ejecutor; lo demás es común.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// str and entero are the JSON schema types used by the tool inputs.
var (
	str    = map[string]any{"type": "string"}
	entero = map[string]any{"type": "integer"}
)

// herramienta builds one tool definition for the Anthropic-compatible tools API.
func herramienta(nombre, descripcion string, esquema map[string]any) map[string]any {
	return map[string]any{"name": nombre, "description": descripcion, "input_schema": esquema}
}

// herramientaCadena is the tool_chain definition: several tools in one model turn.
func herramientaCadena() map[string]any {
	return herramienta("tool_chain", "Ejecuta hasta 20 herramientas en UNA llamada, en orden, con las mismas reglas que una a una. calls: [{id, name, input}]; id único, name otra herramienta (no tool_chain). "+
		"En input cualquier valor puede ser {\"$ref\":\"id_anterior.ruta\"} (la ruta empieza en el resultado JSON de ese paso y admite índices). Devuelve el resultado de cada paso; "+
		"si alguno falla, NO repitas los que tengan ok=true.",
		obj(map[string]any{"calls": map[string]any{"type": "array", "minItems": 1, "maxItems": maxCadena,
			"items": obj(map[string]any{"id": str, "name": str, "input": map[string]any{"type": "object"}}, "id", "name", "input")}}, "calls"))
}

// errSinTerminar means the model kept calling tools past the turn limit.
var errSinTerminar = errors.New("la IA no ha terminado en el número de vueltas permitido")

// bucle runs the tool loop: the model answers or calls tools, the tools run through ejecutar and their results go back
// until the model answers without tools. It returns the final text, errSinTerminar after 10 turns, or a MiniMax error.
func (s *Svc) bucle(ctx context.Context, system string, tools []map[string]any, msgs []map[string]any, ejecutar func(string, json.RawMessage) (string, error)) (string, error) {
	for vuelta := 0; ; vuelta++ {
		if vuelta == 10 {
			return "", errSinTerminar
		}
		ps, err := s.turno(ctx, system, msgs, tools)
		if err != nil {
			return "", err
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
				r, err := ejecutar(b.Name, b.Input)
				res := map[string]any{"type": "tool_result", "tool_use_id": b.ID, "content": r}
				if err != nil {
					res["content"], res["is_error"] = "Error: "+err.Error(), true
				}
				resultados = append(resultados, res)
			}
		}
		if len(resultados) == 0 {
			return strings.TrimSpace(texto.String()), nil
		}
		msgs = append(msgs, map[string]any{"role": "user", "content": resultados})
	}
}

// historialMensajes turns the chat history of the editor into model messages: it must start with the user and
// alternate, and a trailing user message is dropped (the caller appends the current instruction).
func historialMensajes(historial []mensaje) []map[string]any {
	msgs := []map[string]any{}
	for _, h := range historial {
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
	return msgs
}

// limitarIA applies the quota shared by the assistants: per user per hour and per competition per day.
func (s *Svc) limitarIA(ctx context.Context, usuario, cid uuid.UUID) error {
	if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "ia", usuario.String()), 30, time.Hour); !r.Allowed {
		return problem.TooMany("Has hecho muchas peticiones a la IA en la última hora. Espera un poco.")
	}
	if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "ia-comp", cid.String()), 300, 24*time.Hour); !r.Allowed {
		return problem.TooMany("La competición ha llegado al límite diario de la IA.")
	}
	return nil
}

// contexto returns the name, dates and venue of the competition that the assistants put in their system prompt.
func (s *Svc) contexto(ctx context.Context, cid uuid.UUID) (nombre, fechas, sede string) {
	nombre, fechas, sede = "GR Strength Cup", "fecha por confirmar", ""
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		nombre, sede = c.Nombre, c.Sede.Ciudad
		if c.FechaInicio != "" {
			fechas = c.FechaInicio + " a " + c.FechaFin
		}
	}
	return nombre, fechas, sede
}

func obj(props map[string]any, req ...string) map[string]any {
	o := map[string]any{"type": "object", "properties": props}
	if len(req) > 0 {
		o["required"] = req
	}
	return o
}

// maxCadena is the number of calls of one tool_chain.
const maxCadena = 20

var reIDPaso = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// cadena runs an ordered batch of tools on the same working copy (one model turn instead of one per change). A step
// may feed any JSON value of a previous result into its input with {"$ref":"paso.ruta.al.valor"}.
func cadena(raw json.RawMessage, ejecutar func(string, json.RawMessage) (string, error)) (string, error) {
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
			r, err = ejecutar(c.Name, entrada)
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

func (s *Svc) turno(ctx context.Context, system string, msgs []map[string]any, tools []map[string]any) (paso, error) {
	var p paso
	body, _ := json.Marshal(map[string]any{"model": s.modelo, "max_tokens": 8000, "system": system, "messages": msgs, "tools": tools})
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
