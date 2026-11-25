package ai

// BIZ-211 · Emparejamiento de solicitudes de atleta con el padrón AEP: athletes sends one request and at most five
// candidates of the AEP roll (public data of the published list only: name, surnames, sex, birth year, club,
// division, weight class and AEP level; never email, phone or image) and MiniMax answers which candidate is the same
// person, in a fixed JSON. The decision itself (auto / suggested / manual) and the checks of sex, class, division
// and level are made by athletes in code.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// PersonaPadron is the public data of a request or of a roll row (the only data the model ever sees).
type PersonaPadron struct {
	ID        string `json:"id,omitempty" maxLength:"64"`
	Nombre    string `json:"nombre" maxLength:"120"`
	Apellidos string `json:"apellidos" maxLength:"160"`
	Sexo      string `json:"sexo" maxLength:"1"`
	Anio      int    `json:"anio,omitempty" doc:"Año de nacimiento"`
	Club      string `json:"club,omitempty" maxLength:"160"`
	Division  string `json:"division,omitempty" maxLength:"20"`
	Categoria string `json:"categoria,omitempty" maxLength:"10"`
	Nivel     string `json:"nivel,omitempty" maxLength:"10" doc:"aep2, aep3 o vacío"`
}

// RespuestaEmparejar is the fixed answer of the model.
type RespuestaEmparejar struct {
	CandidatoID   *string         `json:"candidato_id"`
	Confianza     float64         `json:"confianza"`
	Coincide      map[string]bool `json:"coincide"`
	Discrepancias []string        `json:"discrepancias"`
	NivelAEP      []string        `json:"nivel_aep"`
}

const sistemaEmparejar = `Eres el asistente de inscripciones de una competición de powerlifting. Comparas UNA solicitud de alta de atleta con hasta 5 filas del padrón oficial de la AEP y dices si alguna es la misma persona.

Reglas:
- Los nombres pueden venir sin tildes, con mayúsculas distintas, con un apellido de menos, con abreviaturas (Mª, Fco.) o con nombre y apellidos intercambiados.
- El año de nacimiento puede diferir en 1 por errores de la lista; más diferencia casi descarta.
- El club ayuda pero no es decisivo.
- Si ninguna fila es claramente la misma persona, candidato_id es null.
- confianza va de 0 a 1: 0.95 o más solo si el nombre y los apellidos son los mismos (salvo tildes o un apellido de menos) y el año coincide.

Responde SOLO con un objeto JSON, sin texto alrededor, con exactamente estas claves:
{"candidato_id": "<id de la fila o null>", "confianza": <número 0-1>, "coincide": {"nombre": <bool>, "apellidos": <bool>, "anio": <bool>, "club": <bool>}, "discrepancias": ["<diferencia breve en español>", ...], "nivel_aep": ["aep2" y/o "aep3": niveles del padrón en los que aparece la persona]}`

// textoModelo sends one message without tools and returns the text of the answer.
func (s *Svc) textoModelo(ctx context.Context, system, user string, maxTokens int) (string, error) {
	body, _ := json.Marshal(map[string]any{"model": s.modelo, "max_tokens": maxTokens, "temperature": 0, "system": system,
		"messages": []map[string]any{{"role": "user", "content": user}}})
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
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("MiniMax %d: %s", res.StatusCode, trunc(string(raw), 300))
	}
	var p struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return "", err
	}
	var b strings.Builder
	for _, c := range p.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return b.String(), nil
}

// leerRespuesta takes the JSON object out of the answer and checks it against the candidates.
func leerRespuesta(txt string, ids map[string]bool) (RespuestaEmparejar, error) {
	var r RespuestaEmparejar
	i, j := strings.Index(txt, "{"), strings.LastIndex(txt, "}")
	if i < 0 || j < i {
		return r, fmt.Errorf("la respuesta no es JSON")
	}
	if err := json.Unmarshal([]byte(txt[i:j+1]), &r); err != nil {
		return r, fmt.Errorf("JSON no válido: %w", err)
	}
	if r.CandidatoID != nil && (*r.CandidatoID == "" || strings.EqualFold(*r.CandidatoID, "null")) {
		r.CandidatoID = nil
	}
	if r.CandidatoID != nil && !ids[*r.CandidatoID] {
		return r, fmt.Errorf("candidato_id desconocido")
	}
	if r.Confianza < 0 || r.Confianza > 1 {
		return r, fmt.Errorf("confianza fuera de rango")
	}
	if r.Coincide == nil {
		r.Coincide = map[string]bool{}
	}
	if r.Discrepancias == nil {
		r.Discrepancias = []string{}
	}
	niveles := []string{}
	for _, n := range r.NivelAEP {
		if n = strings.ToLower(strings.TrimSpace(n)); n == "aep2" || n == "aep3" {
			niveles = append(niveles, n)
		}
	}
	r.NivelAEP = niveles
	return r, nil
}

func (s *Svc) registerPadron() {
	type in struct {
		Body struct {
			Solicitud  PersonaPadron   `json:"solicitud"`
			Candidatos []PersonaPadron `json:"candidatos" minItems:"1" maxItems:"5"`
		}
	}
	type out struct {
		Body struct {
			Respuesta RespuestaEmparejar `json:"respuesta"`
			Modelo    string             `json:"modelo"`
			Crudo     string             `json:"crudo" doc:"Texto del modelo (para el registro)"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-ia-emparejar-padron", Method: http.MethodPost, Path: "/internal/ia/emparejar-padron",
		Summary: "¿Qué fila del padrón AEP es la persona de una solicitud? (solo athletes)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, i *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			if s.key == "" {
				return nil, problem.New(http.StatusServiceUnavailable, "IA_NO_CONFIGURADA", "La IA no está configurada (MINIMAX_API_KEY).")
			}
			ids := map[string]bool{}
			for _, c := range i.Body.Candidatos {
				ids[c.ID] = true
			}
			entrada, _ := json.Marshal(map[string]any{"solicitud": i.Body.Solicitud, "candidatos": i.Body.Candidatos})
			txt, err := s.textoModelo(ctx, sistemaEmparejar, string(entrada), 4000)
			if err != nil {
				s.a.Log.Warn("ia.emparejar_padron_fallo", "err", err)
				return nil, problem.New(http.StatusBadGateway, "IA_NO_DISPONIBLE", "La IA no ha respondido.")
			}
			r, err := leerRespuesta(txt, ids)
			if err != nil {
				s.a.Log.Warn("ia.emparejar_padron_invalida", "err", err)
				return nil, problem.New(http.StatusBadGateway, "IA_RESPUESTA_INVALIDA", "La IA ha respondido con un formato no válido: "+err.Error()+".")
			}
			o := &out{}
			o.Body.Respuesta, o.Body.Modelo, o.Body.Crudo = r, s.modelo, trunc(txt, 4000)
			s.a.Log.Info("ia.emparejar_padron", "candidatos", len(i.Body.Candidatos), "elegido", r.CandidatoID != nil, "confianza", r.Confianza)
			return o, nil
		})
}
