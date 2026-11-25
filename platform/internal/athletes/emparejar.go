package athletes

// BIZ-211 · Emparejamiento automático de las solicitudes de atleta con el padrón AEP.
//
// When a request is sent (privacy and terms accepted: the form does not create a request without them) it is
// compared in the background with the AEP roll of its competition:
//
//  1. code prefilter: same sex, birth year ±1, similar name (no accents, first name and surnames compared apart),
//     at most 5 candidates. One candidate with the very same first name, surnames and year needs no model;
//  2. otherwise MiniMax (ai service) gets the request and the candidates, public data only (never email, phone or
//     image), and answers which candidate it is, with a confidence;
//  3. the code compares sex, weight class, division and AEP level of the chosen row with the request;
//  4. decision: auto (confidence ≥ 0.9 and no discrepancy: approved, linked with the roll row and the OpenLifter
//     entry, athlete notified), sugerido (a candidate with discrepancies or a lower confidence: review), manual
//     (no candidate, low confidence or an error of the model).
//
// Every decision is written to emparejamientos_log (input, answer of the model, who applied it).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

const (
	empAuto        = 0.90 // automatic approval
	empSugerido    = 0.60 // shown as a proposal
	empMinNombre   = 0.50 // prefilter
	empCandidatos  = 5
	porEmparejador = "Emparejamiento automático"
)

// personaIA is the public data of a request or a roll row: the only fields that ever reach the model. It has no
// email, phone, photo or birth date field on purpose.
type personaIA struct {
	ID        string `json:"id,omitempty"`
	Nombre    string `json:"nombre"`
	Apellidos string `json:"apellidos"`
	Sexo      string `json:"sexo"`
	Anio      int    `json:"anio,omitempty"`
	Club      string `json:"club,omitempty"`
	Division  string `json:"division,omitempty"`
	Categoria string `json:"categoria,omitempty"`
	Nivel     string `json:"nivel,omitempty"`
}

type respuestaIA struct {
	CandidatoID   *string         `json:"candidato_id"`
	Confianza     float64         `json:"confianza"`
	Coincide      map[string]bool `json:"coincide"`
	Discrepancias []string        `json:"discrepancias"`
	NivelAEP      []string        `json:"nivel_aep"`
}

// Discrepancia is a field where the request and the roll row differ (checked in code).
type Discrepancia struct {
	Campo     string `json:"campo" enum:"sexo,anio,categoria,division,nivel"`
	Solicitud string `json:"solicitud"`
	Padron    string `json:"padron"`
}

// DetalleEmparejamiento is what the review shows.
type DetalleEmparejamiento struct {
	Coincide      map[string]bool `json:"coincide"`
	Discrepancias []Discrepancia  `json:"discrepancias"`
	NivelAEP      []string        `json:"nivelAep"`
	NotasIA       []string        `json:"notasIa" doc:"Diferencias que ha visto la IA (orientativas)"`
	Motivo        string          `json:"motivo"`
}

type candidato struct {
	personaIA
	uuid     uuid.UUID
	lifterID *int
	atletaID *uuid.UUID
	score    float64
	exacto   bool
}

// ---- name similarity (code prefilter) ----

func tokensNombre(s string) []string {
	var out []string
	for _, w := range strings.Fields(normNombre(s)) {
		switch w {
		case "de", "del", "la", "las", "los", "y", "i", "e":
			continue
		case "ma", "mª":
			w = "maria"
		case "fco":
			w = "francisco"
		}
		out = append(out, w)
	}
	return out
}

func distancia(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur := make([]int, len(rb)+1)
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			c := 1
			if ra[i-1] == rb[j-1] {
				c = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+c)
		}
		prev = cur
	}
	return prev[len(rb)]
}

func palabraParecida(a, b string) bool {
	if a == b {
		return true
	}
	if len([]rune(a)) >= 5 && len([]rune(b)) >= 5 && distancia(a, b) <= 1 {
		return true
	}
	// initials («M.» for «Maria»)
	return len(a) == 1 && strings.HasPrefix(b, a) || len(b) == 1 && strings.HasPrefix(a, b)
}

// parecido is the share of the words of a found in b (0–1).
func parecido(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	n := 0
	for _, x := range a {
		for _, y := range b {
			if palabraParecida(x, y) {
				n++
				break
			}
		}
	}
	return float64(n) / float64(len(a))
}

// puntuar compares the first name and the surnames apart (also crossed: «Brayan Alfredo / Cruz Alay» swapped).
func puntuar(nom, ape, rNom, rApe string) float64 {
	tn, ta, rn, ra := tokensNombre(nom), tokensNombre(ape), tokensNombre(rNom), tokensNombre(rApe)
	directo := 0.4*parecido(tn, rn) + 0.6*max(parecido(ta, ra), parecido(ra, ta))
	cruzado := 0.4*parecido(tn, ra) + 0.6*max(parecido(ta, rn), parecido(rn, ta))
	if parecido(ta, ra) == 0 && parecido(ra, ta) == 0 && cruzado < 0.9 {
		directo *= 0.5 // no surname in common: never a strong candidate
	}
	return max(directo, cruzado)
}

// mismoTexto: identical but for case and spaces (accents count: «Lucia» is not «Lucía», the model decides).
func mismoTexto(a, b string) bool {
	return strings.EqualFold(strings.Join(strings.Fields(a), " "), strings.Join(strings.Fields(b), " "))
}

// ---- the decision ----

type solEmp struct {
	solicitud
	categoria string
	anio      int
}

func (s *Svc) cargarSolEmp(ctx context.Context, cid, id uuid.UUID) (solEmp, error) {
	sol, err := getSolicitud(ctx, s.a.DB, cid, id)
	if err != nil {
		return solEmp{}, err
	}
	o := solEmp{solicitud: sol}
	if err := s.a.DB.QueryRow(ctx, `SELECT categoria FROM solicitudes_atleta WHERE id = $1`, id).Scan(&o.categoria); err != nil {
		return o, err
	}
	if sol.FechaNacimiento != nil {
		o.anio = sol.FechaNacimiento.Year()
	}
	return o, nil
}

func (s *Svc) candidatosPadron(ctx context.Context, sol solEmp) ([]candidato, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT id, nombre, apellidos, sexo, anio, club, division, categoria, nivel, openlifter_lifter_id, atleta_id
		FROM inscripciones_aep WHERE competition_id = $1 AND sexo = $2 AND ($3 = '' OR nivel = $3) AND ($4 = 0 OR abs(anio - $4) <= 1)
			AND estado_enlace <> 'rechazado' AND (atleta_id IS NULL OR atleta_id = $5)`,
		sol.CompetitionID, sol.Sexo, sol.Prueba, sol.anio, sol.MatchAtletaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []candidato
	for rows.Next() {
		var c candidato
		if err := rows.Scan(&c.uuid, &c.Nombre, &c.Apellidos, &c.Sexo, &c.Anio, &c.Club, &c.Division, &c.Categoria, &c.Nivel, &c.lifterID, &c.atletaID); err != nil {
			return nil, err
		}
		c.ID = c.uuid.String()
		c.score = puntuar(sol.Nombre, sol.Apellidos, c.Nombre, c.Apellidos)
		c.exacto = mismoTexto(sol.Nombre, c.Nombre) && mismoTexto(sol.Apellidos, c.Apellidos) && sol.anio == c.Anio
		if c.score >= empMinNombre || c.exacto {
			out = append(out, c)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].score > out[j].score })
	if len(out) > empCandidatos {
		out = out[:empCandidatos]
	}
	return out, nil
}

// comparar checks, in code, the facts of the chosen roll row against the request.
func compararPadron(sol solEmp, c candidato, anioComp int) []Discrepancia {
	d := []Discrepancia{}
	if sol.Sexo != c.Sexo {
		d = append(d, Discrepancia{"sexo", sol.Sexo, c.Sexo})
	}
	if sol.anio != 0 && sol.anio != c.Anio {
		d = append(d, Discrepancia{"anio", fmt.Sprint(sol.anio), fmt.Sprint(c.Anio)})
	}
	if sol.categoria != "" && NormCategoria(sol.categoria) != c.Categoria {
		d = append(d, Discrepancia{"categoria", sol.categoria, c.Categoria})
	}
	if sol.FechaNacimiento != nil {
		div := DivisionPorEdad(*sol.FechaNacimiento, anioComp)
		// the AEP lists put the masters in SNR (open): only a youth division has to be the same
		if div != c.Division && !(c.Division == "open" && strings.HasPrefix(div, "master")) {
			d = append(d, Discrepancia{"division", DivisionNombre(div), DivisionNombre(c.Division)})
		}
	}
	if sol.Prueba != "" && sol.Prueba != c.Nivel {
		d = append(d, Discrepancia{"nivel", pruebaTexto(sol.Prueba), pruebaTexto(c.Nivel)})
	}
	return d
}

// emparejar compares one request with the roll and applies the decision. It never fails the caller: problems end in
// «manual» (logged).
func (s *Svc) emparejar(ctx context.Context, cid, id uuid.UUID) (string, error) {
	// One matching of a request at a time (the background one of the form and a batch of the backoffice).
	clave := s.a.Keys.Of("athletes", "emparejando", id.String())
	if ok, err := s.a.Redis.SetNX(ctx, clave, 1, 3*time.Minute).Result(); err != nil || !ok {
		return "", err
	}
	defer s.a.Redis.Del(context.WithoutCancel(ctx), clave)
	sol, err := s.cargarSolEmp(ctx, cid, id)
	if err != nil {
		return "", err
	}
	if sol.Estado != "pendiente" && sol.Estado != "revision" {
		return "", nil
	}
	cons := sol.consentMap()
	if !cons["privacidad"].Aceptado || !cons["terminos"].Aceptado {
		s.a.Log.Info("emparejamiento.sin_consentimiento", "solicitud", id.String())
		return "", nil
	}
	anioComp := s.compYear(ctx, cid)
	persona := personaIA{Nombre: sol.Nombre, Apellidos: sol.Apellidos, Sexo: sol.Sexo, Anio: sol.anio, Club: sol.Club, Categoria: sol.categoria, Nivel: sol.Prueba}
	if sol.FechaNacimiento != nil {
		persona.Division = DivisionPorEdad(*sol.FechaNacimiento, anioComp)
	}
	cands, err := s.candidatosPadron(ctx, sol)
	if err != nil {
		return "", err
	}
	entrada := map[string]any{"solicitud": persona, "candidatos": personas(cands)}
	det := DetalleEmparejamiento{Coincide: map[string]bool{}, Discrepancias: []Discrepancia{}, NivelAEP: []string{}, NotasIA: []string{}}
	var elegido *candidato
	var confianza float64
	origen, modelo := "", ""
	respuesta := map[string]any{}
	exactos := 0
	for i := range cands {
		if cands[i].exacto {
			exactos++
			elegido = &cands[i]
		}
	}
	switch {
	case len(cands) == 0:
		origen, det.Motivo = "sin_candidatos", "No hay nadie parecido en el padrón AEP (mismo sexo, año ±1 y nombre parecido)."
	case exactos == 1:
		origen, confianza = "exacto", 1
		det.Coincide = map[string]bool{"nombre": true, "apellidos": true, "anio": true, "club": normNombre(sol.Club) == normNombre(elegido.Club)}
		det.Motivo = "Nombre, apellidos y año idénticos a una sola fila del padrón (sin IA)."
		respuesta = map[string]any{"exacto": true, "candidato_id": elegido.ID}
	default:
		elegido = nil
		var r struct {
			Respuesta respuestaIA `json:"respuesta"`
			Modelo    string      `json:"modelo"`
			Crudo     string      `json:"crudo"`
		}
		body := map[string]any{"solicitud": persona, "candidatos": personas(cands)}
		if err := s.ai.Do(ctx, http.MethodPost, "/internal/ia/emparejar-padron", body, &r); err != nil {
			s.a.Log.Warn("emparejamiento.error_ia", "solicitud", id.String(), "err", err)
			origen, det.Motivo = "error_ia", "La IA no ha podido responder: revísala a mano."
			respuesta = map[string]any{"error": mensajeErr(err)}
			break
		}
		origen, modelo, confianza = "ia", r.Modelo, r.Respuesta.Confianza
		respuesta = map[string]any{"respuesta": r.Respuesta, "crudo": r.Crudo}
		det.Coincide, det.NotasIA, det.NivelAEP = r.Respuesta.Coincide, r.Respuesta.Discrepancias, r.Respuesta.NivelAEP
		if r.Respuesta.CandidatoID != nil {
			for i := range cands {
				if cands[i].ID == *r.Respuesta.CandidatoID {
					elegido = &cands[i]
				}
			}
		}
		if elegido == nil {
			det.Motivo = "La IA no reconoce a la persona en el padrón."
		}
	}
	decision := "manual"
	if elegido != nil {
		det.Discrepancias = compararPadron(sol, *elegido, anioComp)
		switch {
		case confianza >= empAuto && len(det.Discrepancias) == 0:
			decision = "auto"
		case confianza >= empSugerido:
			decision = "sugerido"
			if det.Motivo == "" {
				det.Motivo = "Propuesta de la IA: revisa las diferencias."
			}
		default:
			elegido = nil
			det.Motivo = fmt.Sprintf("Confianza baja (%.0f %%).", confianza*100)
		}
	}
	if elegido != nil && len(det.NivelAEP) == 0 {
		det.NivelAEP = []string{elegido.Nivel}
	}
	// An automatic approval that cannot be done (minor without authorisation, event full, a name match with another
	// athlete) stays as a proposal.
	if decision == "auto" {
		if motivo := s.puedeAutoAprobar(sol, elegido); motivo != "" {
			decision, det.Motivo = "sugerido", motivo
		}
	}
	if decision == "auto" {
		if err := s.aplicarAuto(ctx, cid, sol, elegido); err != nil {
			if pe := (*problem.Error)(nil); errors.As(err, &pe) && pe.Code == "YA_REVISADA" {
				return "", nil // a person reviewed it meanwhile
			}
			s.a.Log.Warn("emparejamiento.auto_fallido", "solicitud", id.String(), "err", err)
			decision, det.Motivo = "sugerido", "No se ha podido aprobar sola: "+mensajeErr(err)
		}
	}
	if err := s.guardarDecision(ctx, cid, sol, elegido, decision, origen, confianza, det, entrada, respuesta, modelo, porEmparejador); err != nil {
		return "", err
	}
	s.a.Log.Info("emparejamiento.decision", "solicitud", id.String(), "decision", decision, "origen", origen, "candidatos", len(cands),
		"confianza", confianza, "discrepancias", len(det.Discrepancias))
	return decision, nil
}

func personas(cs []candidato) []personaIA {
	out := make([]personaIA, len(cs))
	for i, c := range cs {
		out[i] = c.personaIA
	}
	return out
}

func mensajeErr(err error) string {
	var p *problem.Error
	if errors.As(err, &p) && p.Detail != "" {
		return p.Detail
	}
	return "servicio no disponible."
}

func (s *Svc) puedeAutoAprobar(sol solEmp, c *candidato) string {
	if sol.EsMenor && sol.AutorizacionClave == "" {
		return "Coincide con el padrón, pero es menor: falta la autorización firmada para aprobarla."
	}
	if sol.MatchTipo == "nombre" && (c.atletaID == nil || sol.MatchAtletaID == nil || *c.atletaID != *sol.MatchAtletaID) {
		return "Coincide con el padrón, pero hay un atleta con un nombre parecido: elige si es el mismo."
	}
	return ""
}

func (s *Svc) guardarDecision(ctx context.Context, cid uuid.UUID, sol solEmp, c *candidato, decision, origen string, confianza float64, det DetalleEmparejamiento,
	entrada, respuesta map[string]any, modelo, por string) error {
	var insc *uuid.UUID
	var conf *float64
	if c != nil {
		insc = &c.uuid
	}
	if origen == "exacto" || origen == "ia" {
		conf = &confianza
	}
	detJSON, _ := json.Marshal(det)
	entJSON, _ := json.Marshal(entrada)
	resJSON, _ := json.Marshal(respuesta)
	disJSON, _ := json.Marshal(det.Discrepancias)
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET padron_estado = $3, padron_inscripcion_id = $4, padron_confianza = $5, padron_detalle = $6, updated_at = now()
			WHERE competition_id = $1 AND id = $2`, cid, sol.ID, decision, insc, conf, detJSON); err != nil {
			return err
		}
		if c != nil && decision == "sugerido" {
			if _, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET estado_enlace = 'sugerido', updated_at = now() WHERE id = $1 AND estado_enlace = 'pendiente'`, c.uuid); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO emparejamientos_log (id, competition_id, solicitud_id, inscripcion_id, decision, origen, confianza, entrada, respuesta, discrepancias, modelo, aplicado_por)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, newID(), cid, sol.ID, insc, decision, origen, conf, entJSON, resJSON, disJSON, modelo, por); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_emparejada", map[string]any{"id": sol.ID, "decision": decision},
			events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
}

// aplicarAuto approves the request (the athlete is created or linked and notified), links the roll row and the
// OpenLifter entry of the level.
func (s *Svc) aplicarAuto(ctx context.Context, cid uuid.UUID, sol solEmp, c *candidato) error {
	out, err := s.apruebaSolicitud(ctx, cid, sol.ID, "", c.atletaID, true, cambiosAprobar{}, true, true, porEmparejador)
	if err != nil {
		return err
	}
	return s.enlazarPadron(ctx, cid, c.uuid, out.Body.AtletaID, "auto", porEmparejador)
}

// enlazarPadron links a roll row with an athlete: the athlete takes the class and level of the AEP list, and the
// OpenLifter entry of the row is linked with the athlete on the level's desk.
func (s *Svc) enlazarPadron(ctx context.Context, cid, insc, atleta uuid.UUID, estado, por string) error {
	var nivel, categoria string
	var lifter *int
	err := s.change(ctx, cid, "", nil, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `UPDATE inscripciones_aep SET atleta_id = $3, estado_enlace = $4, updated_at = now() WHERE competition_id = $1 AND id = $2
			RETURNING nivel, categoria, openlifter_lifter_id`, cid, insc, atleta, estado).Scan(&nivel, &categoria, &lifter); err != nil {
			return err
		}
		// the same athlete is one row per level
		if _, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET atleta_id = NULL, estado_enlace = 'pendiente', updated_at = now()
			WHERE competition_id = $1 AND nivel = $2 AND atleta_id = $3 AND id <> $4`, cid, nivel, atleta, insc); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE atletas SET categoria = $3, prueba = $4, version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`,
			cid, atleta, categoria, nivel); err != nil {
			return err
		}
		return histPor(ctx, tx, atleta, por, "Enlazado con el padrón AEP", fmt.Sprintf("%s · %s kg", pruebaTexto(nivel), categoria))
	})
	if err != nil {
		return err
	}
	if lifter != nil {
		var r struct {
			Mesa string `json:"mesa"`
		}
		if err := s.openlifter.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/openlifter/padron/vinculo",
			map[string]any{"nivel": nivel, "entryId": *lifter, "atletaId": atleta, "por": por}, &r); err != nil {
			s.a.Log.Warn("emparejamiento.openlifter_fallo", "nivel", nivel, "err", err)
		} else {
			s.a.Log.Info("emparejamiento.openlifter_enlazado", "nivel", nivel, "mesa", r.Mesa)
		}
	}
	return nil
}

// emparejarFondo runs the matching of a new request in the background (the form answers at once).
func (s *Svc) emparejarFondo(cid, id uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	go func() {
		defer cancel()
		defer func() {
			if r := recover(); r != nil {
				s.a.Log.Error("emparejamiento.panico", "solicitud", id.String(), "err", fmt.Sprint(r))
			}
		}()
		if _, err := s.emparejar(ctx, cid, id); err != nil {
			s.a.Log.Warn("emparejamiento.fallo", "solicitud", id.String(), "err", err)
		}
	}()
}

// ---- endpoints ----

// LogEmparejamiento is one decision of the log.
type LogEmparejamiento struct {
	ID            uuid.UUID       `json:"id"`
	InscripcionID *uuid.UUID      `json:"inscripcionId,omitempty"`
	Decision      string          `json:"decision"`
	Origen        string          `json:"origen"`
	Confianza     *float64        `json:"confianza,omitempty"`
	Entrada       json.RawMessage `json:"entrada"`
	Respuesta     json.RawMessage `json:"respuesta"`
	Discrepancias json.RawMessage `json:"discrepancias"`
	Modelo        string          `json:"modelo"`
	AplicadoPor   string          `json:"aplicadoPor"`
	CreatedAt     time.Time       `json:"createdAt"`
}

// Emparejamiento is the matching of a request (review panel).
type Emparejamiento struct {
	Estado      string                `json:"estado" enum:",auto,sugerido,manual"`
	Confianza   *float64              `json:"confianza,omitempty"`
	Inscripcion *LifterPadron         `json:"inscripcion,omitempty"`
	Detalle     DetalleEmparejamiento `json:"detalle"`
	Log         []LogEmparejamiento   `json:"log"`
}

func (s *Svc) leerEmparejamiento(ctx context.Context, cid, id uuid.UUID) (Emparejamiento, error) {
	var e Emparejamiento
	var insc *uuid.UUID
	var det []byte
	var conf *float32
	if err := s.a.DB.QueryRow(ctx, `SELECT padron_estado, padron_confianza, padron_inscripcion_id, padron_detalle FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2`,
		cid, id).Scan(&e.Estado, &conf, &insc, &det); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return e, problem.NotFound("Esa solicitud no existe.")
		}
		return e, err
	}
	if conf != nil {
		v := float64(*conf)
		e.Confianza = &v
	}
	_ = json.Unmarshal(det, &e.Detalle)
	if e.Detalle.Discrepancias == nil {
		e.Detalle.Discrepancias = []Discrepancia{}
	}
	if insc != nil {
		var l LifterPadron
		var nivel string
		if err := s.a.DB.QueryRow(ctx, `SELECT id, nombre, apellidos, sexo, anio, club, division, equipamiento, categoria, total_anterior::float8, openlifter_lifter_id, atleta_id, estado_enlace, nivel
			FROM inscripciones_aep WHERE id = $1`, *insc).Scan(&l.ID, &l.Nombre, &l.Apellidos, &l.Sexo, &l.Anio, &l.Club, &l.Division, &l.Equipamiento, &l.Categoria,
			&l.TotalAnterior, &l.LifterID, &l.AtletaID, &l.EstadoEnlace, &nivel); err == nil {
			l.Nivel = nivel
			e.Inscripcion = &l
		}
	}
	rows, err := s.a.DB.Query(ctx, `SELECT id, inscripcion_id, decision, origen, confianza::float8, entrada, respuesta, discrepancias, modelo, aplicado_por, created_at
		FROM emparejamientos_log WHERE solicitud_id = $1 ORDER BY created_at DESC LIMIT 20`, id)
	if err != nil {
		return e, err
	}
	defer rows.Close()
	e.Log = []LogEmparejamiento{}
	for rows.Next() {
		var l LogEmparejamiento
		if err := rows.Scan(&l.ID, &l.InscripcionID, &l.Decision, &l.Origen, &l.Confianza, &l.Entrada, &l.Respuesta, &l.Discrepancias, &l.Modelo, &l.AplicadoPor, &l.CreatedAt); err != nil {
			return e, err
		}
		e.Log = append(e.Log, l)
	}
	return e, rows.Err()
}

func (s *Svc) registerEmparejamiento() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/atletas/solicitudes"

	type empOut struct{ Body Emparejamiento }
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-emparejamiento", Method: http.MethodGet, Path: base + "/{id}/emparejamiento",
		Summary: "Emparejamiento de una solicitud con el padrón AEP (decisión, fila propuesta y registro)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*empOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			e, err := s.leerEmparejamiento(ctx, in.CID, in.ID)
			return &empOut{Body: e}, err
		})

	type reIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			IDs []uuid.UUID `json:"ids,omitempty" maxItems:"500" doc:"Solicitudes a emparejar; vacío: todas las pendientes que no son automáticas"`
		}
	}
	type reOut struct {
		Body struct {
			Solicitudes int `json:"solicitudes" doc:"Solicitudes que se van a emparejar en segundo plano"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-emparejar", Method: http.MethodPost, Path: base + "/emparejar",
		Summary: "Volver a emparejar con el padrón AEP las solicitudes pendientes (en segundo plano)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *reIn) (*reOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			filtro := in.Body.IDs
			if filtro == nil {
				filtro = []uuid.UUID{}
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id FROM solicitudes_atleta WHERE competition_id = $1 AND estado IN ('pendiente', 'revision')
				AND (cardinality($2::uuid[]) = 0 OR id = ANY($2)) ORDER BY created_at`, in.CID, filtro)
			if err != nil {
				return nil, err
			}
			ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			if err != nil {
				return nil, err
			}
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
				defer cancel()
				for _, id := range ids {
					if _, err := s.emparejar(ctx, in.CID, id); err != nil {
						s.a.Log.Warn("emparejamiento.fallo", "solicitud", id.String(), "err", err)
					}
				}
				s.a.Log.Info("emparejamiento.lote", "solicitudes", len(ids))
			}()
			o := &reOut{}
			o.Body.Solicitudes = len(ids)
			return o, nil
		})
}
