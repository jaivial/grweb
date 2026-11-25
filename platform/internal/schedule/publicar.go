package schedule

import (
	"context"
	"fmt"
	"net/http"
	"slices"
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

// SnapAtleta is an athlete in a published version. Name, club and profile slug are kept only for athletes whose
// profile is public (minors without the guardian's authorisation appear just as a count).
type SnapAtleta struct {
	ID             uuid.UUID `json:"id"`
	Publico        bool      `json:"publico"`
	Slug           string    `json:"slug,omitempty"`
	Nombre         string    `json:"nombre,omitempty"`
	Club           string    `json:"club,omitempty"`
	DivisionNombre string    `json:"divisionNombre,omitempty"`
	Sexo           string    `json:"sexo"`
	Categoria      string    `json:"categoria"`
	Lote           int       `json:"lote"`
}

// SnapSesion is a sesion in a published version.
type SnapSesion struct {
	ID           uuid.UUID    `json:"id"`
	Prueba       string       `json:"prueba,omitempty"`
	Titulo       string       `json:"titulo"`
	Sexo         string       `json:"sexo"`
	SexoFijo     bool         `json:"sexoFijo,omitempty" doc:"BIZ-202: sexo y categorías fijados en el backoffice"`
	Categorias   []string     `json:"categorias,omitempty"`
	Inicio       time.Time    `json:"inicio"`
	Fin          time.Time    `json:"fin"`
	DuracionMin  int          `json:"duracionMin"`
	PesajeInicio time.Time    `json:"pesajeInicio"`
	PesajeFin    time.Time    `json:"pesajeFin"`
	Atletas      []SnapAtleta `json:"atletas"`
}

// SnapDia is a day of a published version.
type SnapDia struct {
	Fecha    string       `json:"fecha"`
	Puertas  string       `json:"puertas,omitempty"`
	Notas    []string     `json:"notas"`
	Agenda   []AgendaItem `json:"agenda"`
	Sesiones []SnapSesion `json:"sesiones"`
}

// Snapshot is a published version of the schedule (immutable).
type Snapshot struct {
	Numero      int       `json:"numero"`
	PublicadoAt time.Time `json:"publicadoAt"`
	ZonaHoraria string    `json:"zonaHoraria"`
	Dias        []SnapDia `json:"dias"`
}

func (sn Snapshot) sesion(id uuid.UUID) *SnapSesion {
	for i := range sn.Dias {
		for j := range sn.Dias[i].Sesiones {
			if sn.Dias[i].Sesiones[j].ID == id {
				return &sn.Dias[i].Sesiones[j]
			}
		}
	}
	return nil
}

type version struct {
	VersionInfo
	Snapshot Snapshot
}

func (s *Svc) versionPublicada(ctx context.Context, q querier, cid uuid.UUID) (*version, error) {
	var v version
	err := q.QueryRow(ctx, `SELECT numero, prueba, numero_prueba, estado, publicado_at, publicado_por, cambios, avisos, seguidores, snapshot FROM versiones WHERE competition_id = $1 AND estado = 'publicada'`, cid).
		Scan(&v.Numero, &v.Prueba, &v.NumeroPrueba, &v.Estado, &v.At, &v.Por, &v.Cambios, &v.Avisos, &v.Seguidores, &v.Snapshot)
	if db.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// snapshot freezes the draft: days (settings + any day with sesiones), non-empty sesiones, confirmed athletes only.
func snapshot(b Borrador, byID map[uuid.UUID]atleta, numero int) Snapshot {
	sn := Snapshot{Numero: numero, PublicadoAt: time.Now().UTC(), ZonaHoraria: b.ZonaHoraria, Dias: []SnapDia{}}
	idx := map[string]int{}
	dia := func(f string) *SnapDia {
		if i, ok := idx[f]; ok {
			return &sn.Dias[i]
		}
		idx[f] = len(sn.Dias)
		sn.Dias = append(sn.Dias, SnapDia{Fecha: f, Notas: []string{}, Agenda: []AgendaItem{}, Sesiones: []SnapSesion{}})
		return &sn.Dias[len(sn.Dias)-1]
	}
	for _, d := range b.Config.Dias {
		sd := dia(d.Fecha)
		sd.Puertas = d.Puertas
		if d.Notas != nil {
			sd.Notas = d.Notas
		}
	}
	for _, f := range b.Sesiones {
		var as []SnapAtleta
		for _, fa := range f.Atletas {
			a, ok := byID[fa.ID]
			if fa.Baja || !ok {
				continue
			}
			sa := SnapAtleta{ID: a.ID, Publico: a.Publico, Sexo: a.Sexo, Categoria: a.Categoria, Lote: len(as) + 1}
			if a.Publico {
				sa.Slug, sa.Nombre, sa.Club, sa.DivisionNombre = a.Slug, a.Nombre, a.Club, a.DivisionNombre
			}
			as = append(as, sa)
		}
		if len(as) == 0 {
			continue
		}
		sd := dia(f.Dia)
		sd.Sesiones = append(sd.Sesiones, SnapSesion{ID: f.ID, Prueba: f.Prueba, Titulo: f.Titulo, Sexo: f.Sexo, SexoFijo: f.SexoFijo, Categorias: f.Categorias, Inicio: f.Inicio, Fin: f.Fin,
			DuracionMin: f.DuracionMin, PesajeInicio: f.PesajeInicio, PesajeFin: f.PesajeFin, Atletas: as})
	}
	for _, a := range b.Agenda {
		sd := dia(a.Dia)
		sd.Agenda = append(sd.Agenda, a)
	}
	sort.Slice(sn.Dias, func(i, j int) bool { return sn.Dias[i].Fecha < sn.Dias[j].Fecha })
	return sn
}

// esDePrueba: a published sesion belongs to competition p (versions before sesiones.prueba: all its athletes are of p).
func esDePrueba(f SnapSesion, p string, byID map[uuid.UUID]atleta) bool {
	if f.Prueba != "" {
		return f.Prueba == p
	}
	for _, a := range f.Atletas {
		if byID[a.ID].Prueba != p {
			return false
		}
	}
	return len(f.Atletas) > 0
}

// partir splits a published snapshot into the sesiones of p and the rest (agenda and days stay in both).
func partir(sn Snapshot, p string, byID map[uuid.UUID]atleta) (suya, resto Snapshot, tiene bool) {
	suya, resto = sn, sn
	suya.Dias, resto.Dias = make([]SnapDia, len(sn.Dias)), make([]SnapDia, len(sn.Dias))
	for i, d := range sn.Dias {
		x, y := d, d
		x.Sesiones, y.Sesiones = []SnapSesion{}, []SnapSesion{}
		for _, f := range d.Sesiones {
			if esDePrueba(f, p, byID) {
				x.Sesiones, tiene = append(x.Sesiones, f), true
			} else {
				y.Sesiones = append(y.Sesiones, f)
			}
		}
		suya.Dias[i], resto.Dias[i] = x, y
	}
	return
}

// fusionar adds to sn (the draft of one competition) the published sesiones of the others, without the athletes
// sn already places: the web keeps showing the other competition as it was published.
func fusionar(sn Snapshot, resto Snapshot) Snapshot {
	en := posiciones(&sn)
	idx := map[string]int{}
	for i, d := range sn.Dias {
		idx[d.Fecha] = i
	}
	for _, d := range resto.Dias {
		for _, f := range d.Sesiones {
			as := []SnapAtleta{}
			for _, a := range f.Atletas {
				if _, ok := en[a.ID]; !ok {
					a.Lote = len(as) + 1
					as = append(as, a)
				}
			}
			if len(as) == 0 {
				continue
			}
			f.Atletas = as
			i, ok := idx[d.Fecha]
			if !ok {
				i = len(sn.Dias)
				idx[d.Fecha] = i
				sn.Dias = append(sn.Dias, SnapDia{Fecha: d.Fecha, Puertas: d.Puertas, Notas: d.Notas, Agenda: []AgendaItem{}, Sesiones: []SnapSesion{}})
			}
			sn.Dias[i].Sesiones = append(sn.Dias[i].Sesiones, f)
		}
	}
	for i := range sn.Dias {
		sort.SliceStable(sn.Dias[i].Sesiones, func(a, b int) bool { return sn.Dias[i].Sesiones[a].Inicio.Before(sn.Dias[i].Sesiones[b].Inicio) })
	}
	sort.Slice(sn.Dias, func(i, j int) bool { return sn.Dias[i].Fecha < sn.Dias[j].Fecha })
	return sn
}

// ---- diff ----

// Cambio is a row of the publish dialog («Lucía Martín · C · 11:30 → B · 10:40»).
type Cambio struct {
	Tipo    string `json:"tipo" enum:"atleta,sesion,alta,baja,agenda"`
	Titulo  string `json:"titulo"`
	Antes   string `json:"antes"`
	Despues string `json:"despues"`
	Atletas int    `json:"atletas" doc:"Atletas a los que afecta"`
}

// Diff compares the draft with the published version.
type Diff struct {
	Prueba      string   `json:"prueba" doc:"Competición que se publica (vacío: todo el evento)"`
	Desde       int      `json:"desde" doc:"Versión publicada (0 = primera publicación)"`
	Siguiente   int      `json:"siguiente"`
	Primera     bool     `json:"primera"`
	Cambios     []Cambio `json:"cambios"`
	Afectados   int      `json:"afectados" doc:"Atletas con algún cambio (los que reciben el aviso)"`
	ConEmail    int      `json:"conEmail" doc:"Afectados con email"`
	Seguidores  int      `json:"seguidores" doc:"Personas que siguen a los afectados"`
	Bloqueantes int      `json:"bloqueantes"`
	Atletas     int      `json:"atletas" doc:"Atletas en los sesiones publicados"`
	afectados   []uuid.UUID
}

// posicion is what an athlete sees of their schedule: when their session starts and their weigh-in (the session's
// internal id does not matter: regenerating the draft creates new sessions at the same times).
type posicion struct {
	inicio    time.Time
	pesaje    time.Time
	lote      int
	pesajeFin time.Time
	sesion    string // BIZ-202: «Femenino −57 / −63 kg» (sex and weight classes of the session)
	nivel     string // BIZ-202: AEP level of the session
}

// texto: «sáb 19/12 10:00 · pesaje 08:00–09:30 · Femenino −57 kg · AEP-2» (what the athlete is told).
func (p posicion) texto(loc *time.Location) string {
	t := diaCorto(p.inicio, loc) + " " + hhmm(p.inicio, loc) + " · pesaje " + hhmm(p.pesaje, loc) + "–" + hhmm(p.pesajeFin, loc)
	if p.sesion != "" {
		t += " · " + p.sesion
	}
	if p.nivel != "" {
		t += " · " + nombrePrueba(p.nivel)
	}
	return t
}

func posiciones(sn *Snapshot) map[uuid.UUID]posicion {
	out := map[uuid.UUID]posicion{}
	if sn == nil {
		return out
	}
	for _, d := range sn.Dias {
		for _, f := range d.Sesiones {
			for _, a := range f.Atletas {
				out[a.ID] = posicion{inicio: f.Inicio, pesaje: f.PesajeInicio, lote: a.Lote, pesajeFin: f.PesajeFin, sesion: f.Titulo, nivel: f.Prueba}
			}
		}
	}
	return out
}

func diff(prev *Snapshot, cur Snapshot, byID map[uuid.UUID]atleta, loc *time.Location) Diff {
	d := Diff{Primera: prev == nil, Cambios: []Cambio{}}
	if prev != nil {
		d.Desde = prev.Numero
	}
	antes, ahora := posiciones(prev), posiciones(&cur)
	d.Atletas = len(ahora)
	pos := func(p posicion) string { return diaCorto(p.inicio, loc) + " " + hhmm(p.inicio, loc) }
	nombre := func(id uuid.UUID) string {
		if a, ok := byID[id]; ok {
			return a.Nombre
		}
		return "Atleta dado de baja"
	}
	// Athletes whose session moved: one row per athlete, or one per session when several move together.
	type grupo struct {
		antes, despues posicion
		ids            []uuid.UUID
	}
	grupos := map[string]*grupo{}
	var orden []string
	for id, p := range ahora {
		q, estaba := antes[id]
		switch {
		case prev == nil:
			d.afectados = append(d.afectados, id)
		case !estaba:
			d.Cambios = append(d.Cambios, Cambio{Tipo: "alta", Titulo: nombre(id), Antes: "—", Despues: pos(p), Atletas: 1})
			d.afectados = append(d.afectados, id)
		case !q.inicio.Equal(p.inicio) || !q.pesaje.Equal(p.pesaje) || q.sesion != p.sesion || q.nivel != p.nivel:
			k := q.inicio.String() + "|" + p.inicio.String() + "|" + q.pesaje.String() + "|" + p.pesaje.String() + "|" + q.sesion + "|" + p.sesion + "|" + q.nivel + "|" + p.nivel
			g, ok := grupos[k]
			if !ok {
				g = &grupo{antes: q, despues: p}
				grupos[k] = g
				orden = append(orden, k)
			}
			g.ids = append(g.ids, id)
			d.afectados = append(d.afectados, id)
		}
	}
	sort.Strings(orden)
	for _, k := range orden {
		g := grupos[k]
		a, b := pos(g.antes), pos(g.despues)
		if !g.antes.pesaje.Equal(g.despues.pesaje) {
			a, b = a+" · pesaje "+hhmm(g.antes.pesaje, loc), b+" · pesaje "+hhmm(g.despues.pesaje, loc)
		}
		if g.antes.sesion != g.despues.sesion || g.antes.nivel != g.despues.nivel { // BIZ-202
			a, b = join(a, strings.TrimSpace(g.antes.sesion+" "+nombrePrueba(g.antes.nivel))), join(b, strings.TrimSpace(g.despues.sesion+" "+nombrePrueba(g.despues.nivel)))
		}
		if len(g.ids) == 1 {
			d.Cambios = append(d.Cambios, Cambio{Tipo: "atleta", Titulo: nombre(g.ids[0]), Antes: a, Despues: b, Atletas: 1})
		} else {
			d.Cambios = append(d.Cambios, Cambio{Tipo: "sesion", Titulo: fmt.Sprintf("Sesión de las %s (%d atletas)", hhmm(g.antes.inicio, loc), len(g.ids)), Antes: a, Despues: b, Atletas: len(g.ids)})
		}
	}
	for id, q := range antes {
		if _, sigue := ahora[id]; !sigue {
			d.Cambios = append(d.Cambios, Cambio{Tipo: "baja", Titulo: nombre(id), Antes: pos(q), Despues: "sin sesión", Atletas: 1})
			if _, ok := byID[id]; ok {
				d.afectados = append(d.afectados, id) // still confirmed: tell them they have no sesion now
			}
		}
	}
	if prev != nil && !mismaAgenda(*prev, cur) {
		d.Cambios = append(d.Cambios, Cambio{Tipo: "agenda", Titulo: "Agenda e info del día", Antes: "", Despues: "actualizada"})
	}
	sort.SliceStable(d.Cambios, func(i, j int) bool { return d.Cambios[i].Tipo < d.Cambios[j].Tipo })
	for _, id := range d.afectados {
		if a, ok := byID[id]; ok {
			d.Seguidores += a.Seguidores
			if a.Email {
				d.ConEmail++
			}
		}
	}
	d.Afectados = len(d.afectados)
	return d
}

func join(a, b string) string {
	if a == "" {
		return b
	}
	return a + " · " + b
}

func mismaAgenda(a, b Snapshot) bool {
	if len(a.Dias) != len(b.Dias) {
		return false
	}
	for i := range a.Dias {
		x, y := a.Dias[i], b.Dias[i]
		if x.Fecha != y.Fecha || x.Puertas != y.Puertas || !slices.Equal(x.Notas, y.Notas) || !slices.Equal(x.Agenda, y.Agenda) {
			return false
		}
	}
	return true
}

// ---- publish ----

type asignacion struct {
	AtletaID     uuid.UUID `json:"atletaId"`
	Dia          string    `json:"dia"`
	Lote         int       `json:"lote"`
	Inicio       time.Time `json:"inicio"`
	PesajeInicio time.Time `json:"pesajeInicio"`
	PesajeFin    time.Time `json:"pesajeFin"`
	Sesion       string    `json:"sesion,omitempty" doc:"BIZ-202: sexo y categorías de la sesión"`
	Nivel        string    `json:"nivel,omitempty" doc:"BIZ-202: AEP-1/2/3"`
	Antes        string    `json:"antes,omitempty" doc:"BIZ-202: horario publicado anterior (texto)"`
}

// aplicarIn is the body of athletes' PUT /internal/competiciones/{cid}/horarios.
// asignacionesDe turns a published snapshot into the times every athlete gets in its profile. antes (may be empty)
// holds each athlete's previous position, the «antes» text of the notice.
func asignacionesDe(sn Snapshot, antes map[uuid.UUID]posicion, loc *time.Location) []asignacion {
	out := []asignacion{}
	for _, dd := range sn.Dias {
		for _, f := range dd.Sesiones {
			for _, a := range f.Atletas {
				as := asignacion{AtletaID: a.ID, Dia: dd.Fecha, Lote: a.Lote, Inicio: f.Inicio, PesajeInicio: f.PesajeInicio, PesajeFin: f.PesajeFin, Sesion: f.Titulo, Nivel: nombrePrueba(f.Prueba)}
				if q, ok := antes[a.ID]; ok {
					as.Antes = q.texto(loc)
				}
				out = append(out, as)
			}
		}
	}
	return out
}

type aplicarIn struct {
	Version          int          `json:"version"`
	Asignaciones     []asignacion `json:"asignaciones"`
	Afectados        []uuid.UUID  `json:"afectados"`
	AvisarAtletas    bool         `json:"avisarAtletas"`
	AvisarSeguidores bool         `json:"avisarSeguidores"`
	Primera          bool         `json:"primera" doc:"Primera publicación (plantilla «Tu horario»)"`
}

type aplicarOut struct {
	Actualizados     int `json:"actualizados"`
	AvisosAtletas    int `json:"avisosAtletas"`
	AvisosSeguidores int `json:"avisosSeguidores"`
}

// Publicado is the result of publishing.
type Publicado struct {
	Version      int    `json:"version"`
	Prueba       string `json:"prueba"`
	NumeroPrueba int    `json:"numeroPrueba"`
	Cambios      int    `json:"cambios"`
	Avisos       int    `json:"avisos" doc:"Emails a atletas"`
	Seguidores   int    `json:"seguidores" doc:"Emails a seguidores"`
}

// preparar builds the snapshot to publish and its diff. With prueba, only that competition is published: the
// snapshot is its draft plus the published sesiones of the other one, and the diff, the conflicts and the version
// number («v1 · AEP-3») are the ones of that competition.
func (s *Svc) preparar(ctx context.Context, cid uuid.UUID, prueba string) (Borrador, map[uuid.UUID]atleta, *version, Snapshot, Diff, error) {
	if prueba != "" && !slices.Contains(ordenPruebas, prueba) {
		return Borrador{}, nil, nil, Snapshot{}, Diff{}, problem.Unprocessable("COMPETICION_INVALIDA", "Esa competición no existe.")
	}
	b, byID, prev, err := s.cargar(ctx, cid)
	if err != nil {
		return b, nil, nil, Snapshot{}, Diff{}, err
	}
	var n int
	if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(max(numero), 0) + 1 FROM versiones WHERE competition_id = $1`, cid).Scan(&n); err != nil {
		return b, nil, nil, Snapshot{}, Diff{}, err
	}
	var ps *Snapshot
	if prev != nil {
		ps = &prev.Snapshot
	}
	if prueba == "" {
		sn := snapshot(b, byID, n)
		d := diff(ps, sn, byID, s.loc(ctx, cid))
		d.Siguiente, d.Bloqueantes = n, bloqueantes(b.Conflictos)
		return b, byID, prev, sn, d, nil
	}
	bp := b
	bp.Sesiones = nil
	for _, f := range b.Sesiones {
		if f.Prueba == prueba {
			bp.Sesiones = append(bp.Sesiones, f)
		}
	}
	bp.Conflictos = nil
	for _, c := range b.Conflictos {
		if c.Prueba == prueba {
			bp.Conflictos = append(bp.Conflictos, c)
		}
	}
	snP := snapshot(bp, byID, n)
	sn := snP
	var psP *Snapshot
	if ps != nil {
		suya, resto, tiene := partir(*ps, prueba, byID)
		if tiene {
			psP = &suya
		}
		sn = fusionar(snP, resto)
	}
	d := diff(psP, snP, byID, s.loc(ctx, cid))
	if psP != nil && !mismaAgenda(*ps, sn) {
		// agenda compared against the whole published snapshot (diff above saw only this competition's part)
		d.Cambios = slices.DeleteFunc(d.Cambios, func(c Cambio) bool { return c.Tipo == "agenda" })
		d.Cambios = append(d.Cambios, Cambio{Tipo: "agenda", Titulo: "Agenda e info del día", Despues: "actualizada"})
	}
	// Only athletes of this competition are told (and counted): nobody of the other one or without one.
	d.afectados = slices.DeleteFunc(d.afectados, func(id uuid.UUID) bool { a, ok := byID[id]; return ok && a.Prueba != prueba })
	d.Afectados, d.ConEmail, d.Seguidores = len(d.afectados), 0, 0
	d.Atletas = 0 // «Primera publicación: N atletas» counts this competition only
	for id := range posiciones(&snP) {
		if a, ok := byID[id]; ok && a.Prueba == prueba {
			d.Atletas++
		}
	}
	for _, id := range d.afectados {
		if a, ok := byID[id]; ok {
			d.Seguidores += a.Seguidores
			if a.Email {
				d.ConEmail++
			}
		}
	}
	d.Prueba, d.Bloqueantes = prueba, bloqueantes(bp.Conflictos)
	if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(max(numero_prueba), 0) FROM versiones WHERE competition_id = $1 AND prueba = $2`, cid, prueba).Scan(&d.Desde); err != nil {
		return b, nil, nil, Snapshot{}, Diff{}, err
	}
	d.Siguiente = d.Desde + 1
	return b, byID, prev, sn, d, nil
}

func (s *Svc) publicar(ctx context.Context, cid uuid.UUID, ifm, prueba string, avisarAtletas, avisarSeguidores bool) (Publicado, error) {
	b, _, prev, sn, d, err := s.preparar(ctx, cid, prueba)
	if err != nil {
		return Publicado{}, err
	}
	if ifm != "" && ifMatch(ifm) != b.Rev {
		return Publicado{}, errConflicto
	}
	if d.Bloqueantes > 0 {
		return Publicado{}, problem.Conflict("HORARIO_CON_CONFLICTOS", fmt.Sprintf("Resuelve antes los %d conflictos marcados en rojo.", d.Bloqueantes))
	}
	if d.Atletas == 0 {
		return Publicado{}, problem.Unprocessable("SIN_SESIONES", "No hay sesiones con atletas que publicar.")
	}
	if !d.Primera && len(d.Cambios) == 0 {
		return Publicado{}, problem.Conflict("SIN_CAMBIOS", "No hay cambios respecto a la versión publicada.")
	}
	antes := posiciones(nil)
	if prev != nil {
		antes = posiciones(&prev.Snapshot)
	}
	in := aplicarIn{Version: sn.Numero, Asignaciones: asignacionesDe(sn, antes, s.loc(ctx, cid)), Afectados: d.afectados, AvisarAtletas: avisarAtletas, AvisarSeguidores: avisarSeguidores, Primera: d.Primera}
	if in.Afectados == nil {
		in.Afectados = []uuid.UUID{}
	}
	// «Publicar horarios» off: the version is stored but stays off the web, so the profiles get no time and nobody is
	// told (switching it on applies this version, without notices).
	visible, err := webVisible(ctx, s.a.DB, cid)
	if err != nil {
		return Publicado{}, err
	}
	if !visible {
		in.Asignaciones, in.Afectados, in.AvisarAtletas, in.AvisarSeguidores = []asignacion{}, []uuid.UUID{}, false, false
	}
	var res aplicarOut
	out := Publicado{Version: sn.Numero, Prueba: prueba, NumeroPrueba: d.Siguiente, Cambios: len(d.Cambios)}
	if d.Primera {
		out.Cambios = d.Atletas
	}
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		// Hold the settings row: nobody edits the draft while the athletes get their times.
		var rev int
		if err := tx.QueryRow(ctx, `SELECT rev FROM config WHERE competition_id = $1 FOR UPDATE`, cid).Scan(&rev); err != nil {
			return err
		}
		if rev != b.Rev {
			return errConflicto
		}
		// Someone else may have published since the diff was built (publishing does not change the revision).
		var n int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(numero), 0) + 1 FROM versiones WHERE competition_id = $1`, cid).Scan(&n); err != nil {
			return err
		}
		if n != sn.Numero {
			return problem.Conflict("PUBLICACION_EN_CURSO", "Otra persona acaba de publicar los horarios. Recarga para ver la versión nueva.")
		}
		s.a.Log.Info("[BIZ-202] schedule_publicar_avisos", "competition_id", cid, "version", sn.Numero, "prueba", prueba, "afectados", len(in.Afectados), "avisar_atletas", avisarAtletas)
		if err := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/horarios", in, &res); err != nil {
			s.a.Log.Warn("athletes horarios", "err", err)
			return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido actualizar las fichas de los atletas. Inténtalo en unos segundos.")
		}
		out.Avisos, out.Seguidores = res.AvisosAtletas, res.AvisosSeguidores
		if _, err := tx.Exec(ctx, `UPDATE versiones SET estado = 'sustituida' WHERE competition_id = $1 AND estado = 'publicada'`, cid); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO versiones (id, competition_id, numero, snapshot, estado, cambios, avisos, seguidores, publicado_por, prueba, numero_prueba) VALUES ($1,$2,$3,$4,'publicada',$5,$6,$7,$8,$9,$10)`,
			newID(), cid, sn.Numero, sn, out.Cambios, out.Avisos, out.Seguidores, actor(ctx), prueba, d.Siguiente); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE config SET publicado = true, rev_publicada = rev WHERE competition_id = $1`, cid); err != nil {
			return err
		}
		ids := []uuid.UUID{}
		for _, dd := range sn.Dias {
			for _, f := range dd.Sesiones {
				ids = append(ids, f.ID)
			}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM directo WHERE competition_id = $1 AND NOT (sesion_id = ANY($2))`, cid, ids); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "horarios.publicados", map[string]any{"version": sn.Numero, "cambios": out.Cambios, "avisos": out.Avisos + out.Seguidores},
			events.Competition(cid.String()), events.Audience(events.Public)))
	})
	if err != nil {
		return Publicado{}, err
	}
	s.bump(ctx, cid)
	s.marcarChecklist(ctx, cid, true)
	return out, nil
}

func (s *Svc) registerPublicar() {
	api := s.a.API
	type pruebaQ struct {
		CID         uuid.UUID `path:"cid"`
		Competicion string    `query:"competicion" doc:"aep2 o aep3: solo esta competición (vacío: todo el evento)"`
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-diff", Method: http.MethodGet, Path: base + "/diff", Summary: "Cambios del borrador respecto a la versión publicada", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *pruebaQ) (*struct{ Body Diff }, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			_, _, _, _, d, err := s.preparar(ctx, in.CID, in.Competicion)
			if err != nil {
				return nil, err
			}
			return &struct{ Body Diff }{d}, nil
		})

	type publicarIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			AvisarAtletas    bool   `json:"avisarAtletas,omitempty" doc:"Email «Cambio en tu horario» a los atletas afectados"`
			AvisarSeguidores bool   `json:"avisarSeguidores,omitempty" doc:"Email a quien activó avisos de esos atletas"`
			Competicion      string `json:"competicion,omitempty" enum:"aep2,aep3" doc:"Publicar solo esta competición; la otra sigue como estaba publicada"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-publicar", Method: http.MethodPost, Path: base + "/publicar", Summary: "Publicar una nueva versión de los horarios y avisar", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *publicarIn) (*struct{ Body Publicado }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			p, err := s.publicar(ctx, in.CID, in.IfMatch, in.Body.Competicion, in.Body.AvisarAtletas, in.Body.AvisarSeguidores)
			if err != nil {
				return nil, err
			}
			return &struct{ Body Publicado }{p}, nil
		})

	// ---- «Publicar horarios»: show or hide the published version on the web without a new version ----
	type visibilidadIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Visible bool `json:"visible" doc:"true: la web muestra la versión publicada; false: la web muestra «Próximamente»"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-visibilidad", Method: http.MethodPut, Path: base + "/visibilidad", Summary: "Mostrar u ocultar en la web los horarios publicados (interruptor «Publicar horarios»)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *visibilidadIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			if err := s.ensureConfig(ctx, in.CID); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var antes bool
				if err := tx.QueryRow(ctx, `SELECT web_visible FROM config WHERE competition_id = $1 FOR UPDATE`, in.CID).Scan(&antes); err != nil {
					return err
				}
				if antes == in.Body.Visible {
					return nil
				}
				// The athletes' profiles follow the switch: the published times (no notices) or none.
				if v, err := s.versionPublicada(ctx, tx, in.CID); err != nil {
					return err
				} else if v != nil {
					ap := aplicarIn{Version: v.Numero, Asignaciones: []asignacion{}, Afectados: []uuid.UUID{}}
					if in.Body.Visible {
						ap.Asignaciones = asignacionesDe(v.Snapshot, nil, s.loc(ctx, in.CID))
					}
					if err := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+in.CID.String()+"/horarios", ap, nil); err != nil {
						s.a.Log.Warn("athletes horarios", "err", err)
						return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido actualizar las fichas de los atletas. Inténtalo en unos segundos.")
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET web_visible = $2 WHERE competition_id = $1`, in.CID, in.Body.Visible); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "horarios.visibilidad", map[string]any{"visible": in.Body.Visible},
					events.Competition(in.CID.String()), events.Audience(events.Public)))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return nil, nil
		})

	huma.Register(api, huma.Operation{OperationID: "horarios-despublicar", Method: http.MethodPost, Path: base + "/despublicar", Summary: "Retirar los horarios publicados (la web vuelve a «Próximamente»)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *cidIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `SELECT 1 FROM config WHERE competition_id = $1 FOR UPDATE`, in.CID); err != nil {
					return err
				}
				v, err := s.versionPublicada(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if v == nil {
					return problem.Conflict("NO_PUBLICADO", "Los horarios no están publicados.")
				}
				if err := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+in.CID.String()+"/horarios",
					aplicarIn{Version: v.Numero, Asignaciones: []asignacion{}, Afectados: []uuid.UUID{}}, nil); err != nil {
					return problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido actualizar las fichas de los atletas. Inténtalo en unos segundos.")
				}
				if _, err := tx.Exec(ctx, `UPDATE versiones SET estado = 'retirada' WHERE competition_id = $1 AND estado = 'publicada'`, in.CID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET publicado = false, rev_publicada = 0 WHERE competition_id = $1`, in.CID); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "horarios.retirados", map[string]any{"version": v.Numero},
					events.Competition(in.CID.String()), events.Audience(events.Public)))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			s.marcarChecklist(ctx, in.CID, false)
			return nil, nil
		})

	huma.Register(api, huma.Operation{OperationID: "horarios-versiones", Method: http.MethodGet, Path: base + "/versiones", Summary: "Versiones publicadas", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *pruebaQ) (*struct{ Body []VersionInfo }, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			// With a competition: its versions and the whole-event ones published before (prueba '').
			rows, err := s.a.DB.Query(ctx, `SELECT numero, prueba, numero_prueba, estado, publicado_at, publicado_por, cambios, avisos, seguidores FROM versiones
				WHERE competition_id = $1 AND ($2 = '' OR prueba IN ($2, '')) ORDER BY numero DESC LIMIT 50`, in.CID, in.Competicion)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (VersionInfo, error) {
				var v VersionInfo
				err := r.Scan(&v.Numero, &v.Prueba, &v.NumeroPrueba, &v.Estado, &v.At, &v.Por, &v.Cambios, &v.Avisos, &v.Seguidores)
				return v, err
			})
			if list == nil {
				list = []VersionInfo{}
			}
			return &struct{ Body []VersionInfo }{list}, err
		})

	type restaurarIn struct {
		CID     uuid.UUID `path:"cid"`
		N       int       `path:"n" minimum:"1"`
		IfMatch string    `header:"If-Match"`
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-restaurar", Method: http.MethodPost, Path: base + "/versiones/{n}/restaurar", Summary: "Volver al borrador de una versión publicada", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *restaurarIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, fmt.Sprintf("restauró la versión v%d en el borrador", in.N), func(tx pgx.Tx) error {
				var sn Snapshot
				var prueba string
				if err := tx.QueryRow(ctx, `SELECT snapshot, prueba FROM versiones WHERE competition_id = $1 AND numero = $2`, in.CID, in.N).Scan(&sn, &prueba); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Esa versión no existe.")
					}
					return err
				}
				return restaurar(ctx, tx, in.CID, sn, prueba)
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})
}

// restaurar replaces the draft sesiones, athletes and agenda with a published snapshot (same sesion ids, so the live
// state stays linked) and copies its doors time and notes into the day settings. A version of one competition
// (prueba) only brings back the sesiones of that competition; the rest of the draft stays.
func restaurar(ctx context.Context, tx pgx.Tx, cid uuid.UUID, sn Snapshot, prueba string) error {
	if prueba != "" {
		if _, err := tx.Exec(ctx, `DELETE FROM sesiones WHERE competition_id = $1 AND prueba = $2`, cid, prueba); err != nil {
			return err
		}
		for _, d := range sn.Dias {
			for _, f := range d.Sesiones {
				if f.Prueba != prueba {
					continue
				}
				ids := make([]uuid.UUID, len(f.Atletas))
				for i, a := range f.Atletas {
					ids[i] = a.ID
				}
				if _, err := tx.Exec(ctx, `DELETE FROM sesiones WHERE competition_id = $1 AND id = $2`, cid, f.ID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `DELETE FROM sesion_atletas WHERE competition_id = $1 AND atleta_id = ANY($2)`, cid, ids); err != nil {
					return err
				}
				if err := insertarSnap(ctx, tx, cid, d.Fecha, f); err != nil {
					return err
				}
			}
		}
		return nil
	}
	for _, q := range []string{`DELETE FROM sesiones WHERE competition_id = $1`, `DELETE FROM agenda WHERE competition_id = $1`} {
		if _, err := tx.Exec(ctx, q, cid); err != nil {
			return err
		}
	}
	cfg, _, _, _, err := loadConfig(ctx, tx, cid)
	if err != nil {
		return err
	}
	for _, d := range sn.Dias {
		for i := range cfg.Dias {
			if cfg.Dias[i].Fecha == d.Fecha {
				cfg.Dias[i].Puertas, cfg.Dias[i].Notas = d.Puertas, d.Notas
			}
		}
		for _, f := range d.Sesiones {
			if err := insertarSnap(ctx, tx, cid, d.Fecha, f); err != nil {
				return err
			}
		}
		for i, a := range d.Agenda {
			if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden) VALUES ($1,$2,$3,$4,$5,$6,$7)`, newID(), cid, d.Fecha, a.Hora, a.Titulo, a.Icono, i); err != nil {
				return err
			}
		}
	}
	_, err = tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, cid, cfg.Dias)
	return err
}

func insertarSnap(ctx context.Context, tx pgx.Tx, cid uuid.UUID, fecha string, f SnapSesion) error {
	sexo, cats := "", []string{}
	if f.SexoFijo { // BIZ-202: restoring keeps the session's own sex and weight classes
		sexo, cats = f.Sexo, append(cats, f.Categorias...)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sesiones (id, competition_id, dia, inicio, duracion_min, pesaje_inicio, pesaje_fin, prueba, sexo, categorias) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		f.ID, cid, fecha, f.Inicio, f.DuracionMin, f.PesajeInicio, f.PesajeFin, f.Prueba, sexo, cats); err != nil {
		return err
	}
	for _, a := range f.Atletas {
		if _, err := tx.Exec(ctx, `INSERT INTO sesion_atletas (sesion_id, competition_id, atleta_id, orden) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, f.ID, cid, a.ID, a.Lote); err != nil {
			return err
		}
	}
	return nil
}

var diasCortos = [...]string{"dom", "lun", "mar", "mié", "jue", "vie", "sáb"}

func diaCorto(t time.Time, loc *time.Location) string {
	t = t.In(loc)
	return diasCortos[t.Weekday()] + " " + t.Format("2/1")
}
