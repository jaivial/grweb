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
//  4. decision: auto (confidence ≥ 0.8 and no discrepancy: approved, linked with the roll row and the OpenLifter
//     entry, athlete notified), parcial (a candidate with discrepancies, a lower confidence or a failed model: the
//     team confirms or discards it — a candidate is never thrown away), manual (nothing similar in the roll).
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
	empAuto        = 0.80 // the model is sure and nothing differs: the request is approved
	empParcial     = 0.50 // below this confidence the answer is only a hint, but the candidate is still shown
	empFuerte      = 0.90 // name score of a prefilter candidate good enough to propose without the model
	empMinNombre   = 0.50 // prefilter
	empCandidatos  = 5
	porEmparejador = "Emparejamiento automático"
	// motivoSinIA is the reason of a match left half done: the team sees it and decides.
	motivoSinIA = "Revisa la fila propuesta del padrón y confírmala o elige otra."
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
// «parcial» or «manual» (logged). reintentar also works on a request already reviewed (it only looks for the row).
func (s *Svc) emparejar(ctx context.Context, cid, id uuid.UUID, reintentar bool) (string, error) {
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
	abierta := sol.Estado == "pendiente" || sol.Estado == "revision"
	if !abierta && !reintentar {
		return "", nil
	}
	// Only an alta is matched against the roll: the other types are already linked to their athlete.
	if sol.Tipo != "alta" {
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
			// The model failing never throws the candidate away: the code has already narrowed the roll to people
			// with the same sex, a birth year ±1 and a similar name, and the best of them is shown with its reason.
			s.a.Log.Warn("emparejamiento.error_ia", "solicitud", id.String(), "err", err)
			origen, det.Motivo = "error_ia", motivoIA(err)
			respuesta = map[string]any{"error": mensajeErr(err)}
			if c := candidatoFuerte(sol, cands); c != nil {
				elegido, confianza = c, c.score
				det.Motivo += " Se propone la fila con el mismo nombre, sexo, año y nivel: " + motivoSinIA
			}
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
		// Without the model nothing is approved alone, however good the name looks: the team confirms it.
		if confianza >= empAuto && len(det.Discrepancias) == 0 && origen != "error_ia" {
			decision = "auto"
		} else {
			// Any other candidate is «parcial»: a proposal the team confirms or discards, never a discarded row.
			decision = "parcial"
			if origen != "error_ia" {
				// A failed model keeps its own reason («tardó demasiado» / «no ha podido responder»).
				det.Motivo = motivoParcial(det, confianza)
			}
		}
	}
	if elegido != nil && len(det.NivelAEP) == 0 {
		det.NivelAEP = []string{elegido.Nivel}
	}
	// An automatic approval that cannot be done (minor without authorisation, event full, a name match with another
	// athlete) stays as a proposal.
	if decision == "auto" {
		if motivo := s.puedeAutoAprobar(sol, elegido); motivo != "" {
			decision, det.Motivo = "parcial", motivo
		}
	}
	var atleta = sol.MatchAtletaID
	switch {
	case decision != "auto":
	case abierta:
		id, err := s.aplicarAuto(ctx, cid, sol, elegido, "auto", porEmparejador, "")
		if err != nil {
			if pe := (*problem.Error)(nil); errors.As(err, &pe) && pe.Code == "YA_REVISADA" {
				return "", nil // a person reviewed it meanwhile
			}
			s.a.Log.Warn("emparejamiento.auto_fallido", "solicitud", id.String(), "err", err)
			decision, det.Motivo = "parcial", "No se ha podido aprobar sola: "+mensajeErr(err)
		} else {
			atleta = &id
		}
	case sol.MatchAtletaID != nil:
		// A request already reviewed cannot be approved again: the row is linked with the athlete it produced.
		if err := s.enlazarPadron(ctx, cid, elegido.uuid, *sol.MatchAtletaID, "auto", porEmparejador); err != nil {
			s.a.Log.Warn("emparejamiento.enlace_fallido", "solicitud", id.String(), "err", err)
			decision, det.Motivo = "parcial", "No se ha podido enlazar la fila: "+mensajeErr(err)
		}
	default:
		decision, det.Motivo = "parcial", "La solicitud ya está revisada y no tiene atleta enlazado: elige la fila a mano."
	}
	var conf *float64
	if elegido != nil {
		conf = &confianza
	}
	if err := s.guardarDecision(ctx, cid, decisionEmparejamiento{Solicitud: sol, AtletaID: atleta, Candidato: elegido, Decision: decision,
		Origen: origen, Confianza: conf, Detalle: det, Entrada: entrada, Respuesta: respuesta, Modelo: modelo, Por: porEmparejador}); err != nil {
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

// motivoIA says why the model did not answer: a timeout of the model service (30 s) is not the same as an outage.
func motivoIA(err error) string {
	var p *problem.Error
	if errors.As(err, &p) && p.Code == "IA_TIEMPO" || errors.Is(err, context.DeadlineExceeded) {
		return "La IA tardó demasiado (30 s) en responder."
	}
	return "La IA no ha podido responder."
}

// candidatoFuerte is the candidate the code trusts without asking the model: a name score of 0.9 or more and the same
// birth year, sex and AEP level (the prefilter already fixed the sex and ±1 year).
func candidatoFuerte(sol solEmp, cands []candidato) *candidato {
	for i := range cands {
		c := &cands[i]
		if c.score >= empFuerte && (sol.anio == 0 || c.Anio == sol.anio) && c.Sexo == sol.Sexo && (sol.Prueba == "" || sol.Prueba == c.Nivel) {
			return c
		}
	}
	return nil
}

// motivoParcial explains in one line why a candidate is only a proposal.
func motivoParcial(det DetalleEmparejamiento, confianza float64) string {
	m := fmt.Sprintf("Coincidencia parcial (%.0f %% de confianza): confírmala o elige otra fila.", confianza*100)
	if confianza < empParcial {
		m = fmt.Sprintf("Confianza baja de la IA (%.0f %%): revisa la fila propuesta.", confianza*100)
	}
	if len(det.Discrepancias) > 0 {
		m += " Diferencias: " + diferenciasTexto(det.Discrepancias) + "."
	}
	return m
}

// diferenciasTexto writes the discrepancies of a request against the roll row in one line («año 1996 vs 1995, …»).
func diferenciasTexto(d []Discrepancia) string {
	out := make([]string, len(d))
	for i, x := range d {
		out[i] = strings.NewReplacer("anio", "año", "categoria", "categoría", "division", "división").Replace(x.Campo) + " " + x.Solicitud + " vs " + x.Padron
	}
	return strings.Join(out, ", ")
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

// decisionEmparejamiento is one decision of the matching, ready to be stored and logged (the automatic one, the team's
// confirmation and its discard all go through here).
type decisionEmparejamiento struct {
	Solicitud solEmp
	// AtletaID is the athlete the decision finally points at (nil while the request is not approved).
	AtletaID  *uuid.UUID
	Candidato *candidato
	Decision  string
	// Origen: exacto · ia · sin_candidatos · error_ia · staff.
	Origen    string
	Confianza *float64
	Detalle   DetalleEmparejamiento
	Entrada   map[string]any
	Respuesta map[string]any
	Modelo    string
	Por       string
}

func (s *Svc) guardarDecision(ctx context.Context, cid uuid.UUID, d decisionEmparejamiento) error {
	var insc *uuid.UUID
	if d.Candidato != nil {
		insc = &d.Candidato.uuid
	}
	detJSON, _ := json.Marshal(d.Detalle)
	entJSON, _ := json.Marshal(d.Entrada)
	resJSON, _ := json.Marshal(d.Respuesta)
	disJSON, _ := json.Marshal(d.Detalle.Discrepancias)
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET padron_estado = $3, padron_origen = $4, padron_inscripcion_id = $5, padron_confianza = $6,
			padron_detalle = $7, updated_at = now() WHERE competition_id = $1 AND id = $2`,
			cid, d.Solicitud.ID, d.Decision, d.Origen, insc, d.Confianza, detJSON); err != nil {
			return err
		}
		// The state of the row follows the decision: «sugerido» while the team has not answered, «manual» once they
		// confirm it and «pendiente» when they discard it. A row already linked to an athlete keeps its link.
		if insc != nil && d.Decision != "auto" {
			if _, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET estado_enlace = $2, updated_at = now() WHERE id = $1
				AND (atleta_id IS NULL OR $2 = 'manual')`, insc, estadoEnlace(d.Decision)); err != nil {
				return err
			}
		}
		atleta := d.AtletaID
		if atleta == nil && d.Solicitud.MatchAtletaID != nil && d.Decision != "manual" {
			atleta = d.Solicitud.MatchAtletaID
		}
		if err := logEmparejamiento(ctx, tx, cid, &d.Solicitud.ID, atleta, insc, d.Decision, d.Origen, d.Confianza, entJSON, resJSON,
			disJSON, d.Modelo, d.Por); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_emparejada", map[string]any{"id": d.Solicitud.ID, "decision": d.Decision},
			events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
}

// estadoEnlace maps a decision of the matching to the state of the roll row (inscripciones_aep.estado_enlace).
func estadoEnlace(decision string) string {
	switch decision {
	case "auto":
		return "auto"
	case "parcial":
		return "sugerido"
	case "confirmada":
		return "manual"
	}
	return "pendiente"
}

// logEmparejamiento writes one row of emparejamientos_log: what the model saw, what it answered and who applied it.
func logEmparejamiento(ctx context.Context, tx pgx.Tx, cid uuid.UUID, solicitudID, atletaID, inscripcionID *uuid.UUID, decision, origen string,
	conf *float64, entrada, respuesta, discrepancias []byte, modelo, por string) error {
	_, err := tx.Exec(ctx, `INSERT INTO emparejamientos_log (id, competition_id, solicitud_id, atleta_id, inscripcion_id, decision, origen, confianza,
		entrada, respuesta, discrepancias, modelo, aplicado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		newID(), cid, solicitudID, atletaID, inscripcionID, decision, origen, conf, entrada, respuesta, discrepancias, modelo, por)
	return err
}

// aplicarAuto approves the request (the athlete is created or linked and notified), links the roll row and the
// OpenLifter entry of the level. It answers the athlete the request ended up linked to.
func (s *Svc) aplicarAuto(ctx context.Context, cid uuid.UUID, sol solEmp, c *candidato, estado, por, ifm string) (uuid.UUID, error) {
	out, err := s.apruebaSolicitud(ctx, cid, sol.ID, ifm, c.atletaID, true, cambiosAprobar{}, true, true, por)
	if err != nil {
		return uuid.Nil, err
	}
	return out.Body.AtletaID, s.enlazarPadron(ctx, cid, c.uuid, out.Body.AtletaID, estado, por)
}

// enlazarPadron links a roll row with an athlete: the athlete takes the class and level of the AEP list, and the
// OpenLifter entry of the row is linked with the athlete on the level's desk.
func (s *Svc) enlazarPadron(ctx context.Context, cid, insc, atleta uuid.UUID, estado, por string) error {
	var nivel string
	var lifter *int
	if err := s.change(ctx, cid, "", nil, func(tx pgx.Tx) error {
		var err error
		nivel, lifter, err = enlazarPadronTx(ctx, tx, cid, insc, atleta, estado, por)
		return err
	}); err != nil {
		return err
	}
	s.vinculoOpenLifter(ctx, cid, nivel, lifter, atleta, por)
	return nil
}

// enlazarPadronTx is the database half of a link (inside the caller's transaction) and answers the level and the
// OpenLifter entry of the row, so the desk can be told after the commit.
func enlazarPadronTx(ctx context.Context, tx pgx.Tx, cid, insc, atleta uuid.UUID, estado, por string) (string, *int, error) {
	var nivel, categoria string
	var lifter *int
	if err := tx.QueryRow(ctx, `UPDATE inscripciones_aep SET atleta_id = $3, estado_enlace = $4, updated_at = now() WHERE competition_id = $1 AND id = $2
		RETURNING nivel, categoria, openlifter_lifter_id`, cid, insc, atleta, estado).Scan(&nivel, &categoria, &lifter); err != nil {
		return "", nil, err
	}
	// the same athlete is one row per level
	if _, err := tx.Exec(ctx, `UPDATE inscripciones_aep SET atleta_id = NULL, estado_enlace = 'pendiente', updated_at = now()
		WHERE competition_id = $1 AND nivel = $2 AND atleta_id = $3 AND id <> $4`, cid, nivel, atleta, insc); err != nil {
		return "", nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE atletas SET categoria = $3, prueba = $4, version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`,
		cid, atleta, categoria, nivel); err != nil {
		return "", nil, err
	}
	return nivel, lifter, histPor(ctx, tx, atleta, por, "Enlazado con el padrón AEP", fmt.Sprintf("%s · %s kg", pruebaTexto(nivel), categoria))
}

// vinculoOpenLifter tells the level's desk which entry belongs to the athlete (a failure is only logged: the link in
// the roll is already saved and the next import retries it).
func (s *Svc) vinculoOpenLifter(ctx context.Context, cid uuid.UUID, nivel string, lifter *int, atleta uuid.UUID, por string) {
	if lifter == nil {
		return
	}
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
		if _, err := s.emparejar(ctx, cid, id, false); err != nil {
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
	Estado string `json:"estado" enum:"sin,auto,parcial,manual,confirmada,descartada" doc:"auto · parcial · confirmada · descartada · manual · sin"`
	// Origen is where the last decision came from: exacto · ia · error_ia · sin_candidatos · staff.
	Origen      string                `json:"origen"`
	Confianza   *float64              `json:"confianza,omitempty"`
	Inscripcion *LifterPadron         `json:"inscripcion,omitempty" doc:"Fila del padrón propuesta o enlazada"`
	Detalle     DetalleEmparejamiento `json:"detalle"`
	Log         []LogEmparejamiento   `json:"log"`
}

// filaPadron reads one row of the roll as the panel shows it.
func (s *Svc) filaPadron(ctx context.Context, insc uuid.UUID) (*LifterPadron, error) {
	var l LifterPadron
	var nivel string
	if err := s.a.DB.QueryRow(ctx, `SELECT id, nombre, apellidos, sexo, anio, club, division, equipamiento, categoria, total_anterior::float8,
		openlifter_lifter_id, atleta_id, estado_enlace, nivel FROM inscripciones_aep WHERE id = $1`, insc).
		Scan(&l.ID, &l.Nombre, &l.Apellidos, &l.Sexo, &l.Anio, &l.Club, &l.Division, &l.Equipamiento, &l.Categoria,
			&l.TotalAnterior, &l.LifterID, &l.AtletaID, &l.EstadoEnlace, &nivel); err != nil {
		return nil, err
	}
	l.Nivel = nivel
	return &l, nil
}

// logEmparejamientos reads the history of a request and/or an athlete (newest first).
func (s *Svc) logEmparejamientos(ctx context.Context, where string, args ...any) ([]LogEmparejamiento, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT id, inscripcion_id, decision, origen, confianza::float8, entrada, respuesta, discrepancias, modelo,
		aplicado_por, created_at FROM emparejamientos_log WHERE `+where+` ORDER BY created_at DESC LIMIT 20`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LogEmparejamiento{}
	for rows.Next() {
		var l LogEmparejamiento
		if err := rows.Scan(&l.ID, &l.InscripcionID, &l.Decision, &l.Origen, &l.Confianza, &l.Entrada, &l.Respuesta, &l.Discrepancias,
			&l.Modelo, &l.AplicadoPor, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// leerEmparejamiento reads the last decision of a request, the row it points at and its history.
func (s *Svc) leerEmparejamiento(ctx context.Context, cid, id uuid.UUID) (Emparejamiento, error) {
	var e Emparejamiento
	var insc *uuid.UUID
	var det []byte
	var conf *float32
	if err := s.a.DB.QueryRow(ctx, `SELECT padron_estado, padron_origen, padron_confianza, padron_inscripcion_id, padron_detalle
		FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2`, cid, id).Scan(&e.Estado, &e.Origen, &conf, &insc, &det); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return e, problem.NotFound("Esa solicitud no existe.")
		}
		return e, err
	}
	return s.leerDetalle(ctx, e, conf, insc, det, `solicitud_id = $1`, id)
}

// leerDetalle completes a decision already read from a row: its detail, the roll row it points at and the history.
func (s *Svc) leerDetalle(ctx context.Context, e Emparejamiento, conf *float32, insc *uuid.UUID, det []byte, logWhere string, logArgs ...any) (Emparejamiento, error) {
	if e.Estado == "" {
		e.Estado = "sin"
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
		if l, err := s.filaPadron(ctx, *insc); err == nil {
			e.Inscripcion = l
		}
	}
	log, err := s.logEmparejamientos(ctx, logWhere, logArgs...)
	if err != nil {
		return e, err
	}
	e.Log = log
	return e, nil
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
		Summary: "Volver a emparejar con el padrón AEP las solicitudes (las pendientes, o las que se indican aunque estén revisadas)", Tags: tagAdmin,
		Security: bearer, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *reIn) (*reOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			filtro := in.Body.IDs
			if filtro == nil {
				filtro = []uuid.UUID{}
			}
			// Naming the requests is «reintentar»: a reviewed one is looked at again (its athlete is relinked, never
			// re-approved). Without ids only the queue is retried.
			estados := `estado IN ('pendiente', 'revision')`
			if len(filtro) > 0 {
				estados = `true`
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id FROM solicitudes_atleta WHERE competition_id = $1 AND `+estados+`
				AND (cardinality($2::uuid[]) = 0 OR id = ANY($2)) ORDER BY created_at`, in.CID, filtro)
			if err != nil {
				return nil, err
			}
			ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			if err != nil {
				return nil, err
			}
			reintentar := len(filtro) > 0
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
				defer cancel()
				defer func() {
					if r := recover(); r != nil {
						s.a.Log.Error("emparejamiento.panico", "lote", len(ids), "err", fmt.Sprint(r))
					}
				}()
				for _, id := range ids {
					if _, err := s.emparejar(ctx, in.CID, id, reintentar); err != nil {
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
