// Package ai is the assistant of the campaign editor (Figma 61 · «Campaña · Diseño con IA»): it rewrites the block
// design from an instruction of the team, with MiniMax (Anthropic-compatible API). It only ever sees the design and
// the instruction: never contacts or any personal data.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

var bearer = []map[string][]string{{"bearer": {}}}

// Svc holds the service dependencies.
type Svc struct {
	a      *app.App
	comps  *compref.Resolver
	key    string
	base   string
	modelo string
	http   *http.Client
}

// Service returns the ai service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "ai", Title: "GR Cup · ai", NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "ai", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	s.key = config.Str("MINIMAX_API_KEY", "")
	s.base = strings.TrimRight(config.Str("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic"), "/")
	s.modelo = config.Str("MINIMAX_MODEL", "MiniMax-M3.1-Flash")
	s.http = &http.Client{Timeout: 90 * time.Second}
	s.register()
	return nil
}

// Modelo is a model offered in the editor.
type Modelo struct {
	ID          string `json:"id"`
	Nombre      string `json:"nombre"`
	Recomendado bool   `json:"recomendado"`
}

const sistema = `Eres el asistente de diseño de campañas de una competición de powerlifting (%s, %s, %s).
Editas un diseño de email + WhatsApp formado por bloques. Respondes SOLO con un objeto JSON, sin texto alrededor ni bloques de código:
{"respuesta": "1-2 frases en español contando qué has cambiado", "diseno": [ ...todos los bloques del diseño final... ]}

Bloques (campo "tipo" y sus campos):
- cabecera: logo de la marca (sin campos).
- portada: imagen ancha. Campos: imagen (URL https), alt.
- titulo: texto.
- texto: texto (admite **negrita**, saltos de línea y {{nombre}} para el nombre del destinatario).
- boton: texto, url.
- imagen: imagen (URL https), alt, url opcional.
- lista: items (array de textos cortos, máximo 12).
- dos_columnas: texto (izquierda), texto2 (derecha).
- cuenta_atras: fecha (AAAA-MM-DDTHH:MM, hora de Madrid), texto opcional encima.
- horario: fecha (AAAA-MM-DD): lista los flights publicados de ese día.
- separador (sin campos), espacio: alto (8-64).
Todos los bloques llevan "id" y "canal": "ambos" | "email" | "whatsapp". Opcional "alinear": "izquierda" | "centro".

Reglas:
- Conserva el "id" de los bloques que mantienes; los nuevos llevan ids nuevos (ia1, ia2…).
- Si hay un bloque seleccionado, cambia solo ese salvo que la petición pida otra cosa.
- No inventes datos personales ni cifras de la competición que no estén en el diseño o en la petición.
- Enlaces de la web relativos: /entradas, /horarios, /atletas, /participantes, /sorteo, /inscripcion, /en-directo, /resultados, /como-llegar.
- Para WhatsApp los textos deben ser breves; las tablas largas (horario) mejor solo email si la petición lo sugiere.
- Español de España, cercano y deportivo. Sin emojis salvo que te los pidan.
- Máximo 40 bloques.`

var tipos = map[string]bool{"cabecera": true, "portada": true, "titulo": true, "texto": true, "boton": true, "imagen": true, "lista": true, "dos_columnas": true,
	"cuenta_atras": true, "horario": true, "separador": true, "espacio": true}

type mensaje struct {
	Rol   string `json:"rol" enum:"usuario,asistente"`
	Texto string `json:"texto" maxLength:"2000"`
}

// llamar sends one conversation to MiniMax and returns the text of the answer.
func (s *Svc) llamar(ctx context.Context, system string, msgs []map[string]any) (string, error) {
	body, _ := json.Marshal(map[string]any{"model": s.modelo, "max_tokens": 6000, "system": system, "messages": msgs})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", s.key)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Content-Type", "application/json")
	res, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode >= 300 {
		m := string(raw)
		if len(m) > 300 {
			m = m[:300]
		}
		return "", fmt.Errorf("MiniMax %d: %s", res.StatusCode, m)
	}
	var r struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return "", err
	}
	var b strings.Builder
	for _, c := range r.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return b.String(), nil
}

// extraer finds the JSON object of the answer (tolerates code fences or a preamble) and checks the blocks.
func extraer(t string) (string, json.RawMessage, error) {
	i, j := strings.Index(t, "{"), strings.LastIndex(t, "}")
	if i < 0 || j <= i {
		return "", nil, fmt.Errorf("la respuesta no trae JSON")
	}
	var r struct {
		Respuesta string            `json:"respuesta"`
		Diseno    []json.RawMessage `json:"diseno"`
	}
	if err := json.Unmarshal([]byte(t[i:j+1]), &r); err != nil {
		return "", nil, fmt.Errorf("JSON no válido: %w", err)
	}
	if len(r.Diseno) == 0 || len(r.Diseno) > 40 {
		return "", nil, fmt.Errorf("el diseño tiene %d bloques", len(r.Diseno))
	}
	for k, b := range r.Diseno {
		var x struct {
			Tipo string `json:"tipo"`
		}
		if json.Unmarshal(b, &x) != nil || !tipos[x.Tipo] {
			return "", nil, fmt.Errorf("bloque %d con tipo «%s»", k+1, x.Tipo)
		}
	}
	d, _ := json.Marshal(r.Diseno)
	return strings.TrimSpace(r.Respuesta), d, nil
}

func (s *Svc) register() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/ia"
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "ia-modelos", Method: http.MethodGet, Path: base + "/modelos", Summary: "Modelos disponibles", Tags: []string{"IA"}, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body []Modelo }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "campanas.enviar"); err != nil {
				return nil, err
			}
			out := []Modelo{}
			if s.key != "" {
				out = append(out, Modelo{ID: s.modelo, Nombre: s.modelo + " · recomendado", Recomendado: true})
			}
			return &struct{ Body []Modelo }{out}, nil
		})

	type disIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Instruccion string          `json:"instruccion" minLength:"3" maxLength:"1000"`
			Diseno      json.RawMessage `json:"diseno" doc:"Bloques actuales"`
			Seleccion   string          `json:"seleccion,omitempty" maxLength:"40" doc:"id del bloque seleccionado"`
			Historial   []mensaje       `json:"historial,omitempty" maxItems:"8"`
			Campana     string          `json:"campana,omitempty" maxLength:"160"`
		}
	}
	type disOut struct {
		Body struct {
			Respuesta string          `json:"respuesta"`
			Diseno    json.RawMessage `json:"diseno"`
			Modelo    string          `json:"modelo"`
			Ms        int64           `json:"ms"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "ia-diseno", Method: http.MethodPost, Path: base + "/diseno", Summary: "Editar el diseño con IA (devuelve el diseño completo; no se guarda)", Tags: []string{"IA"}, Security: bearer, MaxBodyBytes: 512 << 10},
		func(ctx context.Context, in *disIn) (*disOut, error) {
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
			msgs := []map[string]any{}
			for _, h := range in.Body.Historial {
				rol := "user"
				if h.Rol == "asistente" {
					rol = "assistant"
				}
				msgs = append(msgs, map[string]any{"role": rol, "content": h.Texto})
			}
			// conversations must start with the user and alternate
			for len(msgs) > 0 && msgs[0]["role"] != "user" {
				msgs = msgs[1:]
			}
			if len(msgs) > 0 && msgs[len(msgs)-1]["role"] == "user" {
				msgs = msgs[:len(msgs)-1]
			}
			sel := ""
			if in.Body.Seleccion != "" {
				sel = "\nBloque seleccionado: " + in.Body.Seleccion
			}
			msgs = append(msgs, map[string]any{"role": "user", "content": "Campaña: " + in.Body.Campana + sel + "\nDiseño actual (JSON):\n" + string(in.Body.Diseno) + "\n\nPetición: " + in.Body.Instruccion})
			system := fmt.Sprintf(sistema, nombre, fechas, sede)
			t0 := time.Now()
			o := &disOut{}
			o.Body.Modelo = s.modelo
			var resp string
			var dis json.RawMessage
			for intento := 0; intento < 2; intento++ {
				txt, err := s.llamar(ctx, system, msgs)
				if err != nil {
					s.a.Log.Warn("minimax", "err", err)
					return nil, problem.New(http.StatusBadGateway, "IA_NO_RESPONDE", "La IA no ha respondido. Inténtalo de nuevo en unos segundos.")
				}
				resp, dis, err = extraer(txt)
				if err == nil {
					break
				}
				s.a.Log.Warn("respuesta de la IA no válida", "err", err)
				msgs = append(msgs, map[string]any{"role": "assistant", "content": txt}, map[string]any{"role": "user", "content": "Tu respuesta no era válida (" + err.Error() + "). Devuelve SOLO el objeto JSON con \"respuesta\" y \"diseno\" completo."})
			}
			if dis == nil {
				return nil, problem.New(http.StatusBadGateway, "IA_RESPUESTA_NO_VALIDA", "La IA devolvió un diseño que no se puede usar. Reformula la petición.")
			}
			o.Body.Respuesta, o.Body.Diseno, o.Body.Ms = resp, dis, time.Since(t0).Milliseconds()
			instr := in.Body.Instruccion
			if len([]rune(instr)) > 200 {
				instr = string([]rune(instr)[:200]) + "…"
			}
			if err := events.Publish(ctx, s.a.Redis, s.a.Stream(), events.New(ctx, "ia.diseno", map[string]any{"instruccion": instr, "modelo": s.modelo, "ms": o.Body.Ms, "campana": in.Body.Campana},
				events.Competition(in.CID.String()), events.ForPermission("campanas.enviar"))); err != nil {
				s.a.Log.Warn("evento ia.diseno", "err", err)
			}
			return o, nil
		})
}
