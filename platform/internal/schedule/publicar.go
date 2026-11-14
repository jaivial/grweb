package schedule

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"sort"
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

// SnapDia is a date of a published version: its athletes in lot order on the only platform.
type SnapDia struct {
	Fecha        string       `json:"fecha"`
	Prueba       string       `json:"prueba,omitempty"`
	Puertas      string       `json:"puertas,omitempty"`
	Notas        []string     `json:"notas"`
	Agenda       []AgendaItem `json:"agenda"`
	Inicio       time.Time    `json:"inicio"`
	Fin          time.Time    `json:"fin"`
	PesajeInicio time.Time    `json:"pesajeInicio"`
	PesajeFin    time.Time    `json:"pesajeFin"`
	Atletas      []SnapAtleta `json:"atletas"`
}

// Snapshot is a published version of the schedule (immutable).
type Snapshot struct {
	Numero      int       `json:"numero"`
	PublicadoAt time.Time `json:"publicadoAt"`
	ZonaHoraria string    `json:"zonaHoraria"`
	Dias        []SnapDia `json:"dias"`
}

func (sn Snapshot) dia(f string) *SnapDia {
	for i := range sn.Dias {
		if sn.Dias[i].Fecha == f {
			return &sn.Dias[i]
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

// snapshot freezes the draft: every configured date (also without athletes) with its confirmed athletes.
func snapshot(b Borrador, byID map[uuid.UUID]atleta, numero int) Snapshot {
	sn := Snapshot{Numero: numero, PublicadoAt: time.Now().UTC(), ZonaHoraria: b.ZonaHoraria, Dias: []SnapDia{}}
	cfg := map[string]Dia{}
	for _, d := range b.Config.Dias {
		cfg[d.Fecha] = d
	}
	for _, j := range b.Jornadas {
		d, ok := cfg[j.Dia]
		if !ok {
			continue // a removed date (blocking conflict)
		}
		sd := SnapDia{Fecha: j.Dia, Prueba: j.Prueba, Puertas: d.Puertas, Notas: []string{}, Agenda: []AgendaItem{}, Atletas: []SnapAtleta{},
			Inicio: j.Inicio, Fin: j.Fin, PesajeInicio: j.PesajeInicio, PesajeFin: j.PesajeFin}
		if d.Notas != nil {
			sd.Notas = d.Notas
		}
		for _, ap := range j.Atletas {
			a, ok := byID[ap.ID]
			if ap.Baja || !ok {
				continue
			}
			sa := SnapAtleta{ID: a.ID, Publico: a.Publico, Sexo: a.Sexo, Categoria: a.Categoria, Lote: len(sd.Atletas) + 1}
			if a.Publico {
				sa.Slug, sa.Nombre, sa.Club, sa.DivisionNombre = a.Slug, a.Nombre, a.Club, a.DivisionNombre
			}
			sd.Atletas = append(sd.Atletas, sa)
		}
		for _, x := range b.Agenda {
			if x.Dia == j.Dia {
				sd.Agenda = append(sd.Agenda, x)
			}
		}
		sn.Dias = append(sn.Dias, sd)
	}
	sort.Slice(sn.Dias, func(i, j int) bool { return sn.Dias[i].Fecha < sn.Dias[j].Fecha })
	return sn
}

// partir splits a published snapshot into the dates of competition p and the rest.
func partir(sn Snapshot, p string) (suya, resto Snapshot, tiene bool) {
	suya, resto = sn, sn
	suya.Dias, resto.Dias = []SnapDia{}, []SnapDia{}
	for _, d := range sn.Dias {
		if d.Prueba == p {
			suya.Dias, tiene = append(suya.Dias, d), true
		} else {
			resto.Dias = append(resto.Dias, d)
		}
	}
	return
}

// fusionar adds to sn (the draft dates of one competition) the published dates of the others: the web keeps
// showing the other competition as it was published.
func fusionar(sn Snapshot, resto Snapshot) Snapshot {
	for _, d := range resto.Dias {
		if sn.dia(d.Fecha) == nil {
			sn.Dias = append(sn.Dias, d)
		}
	}
	sort.Slice(sn.Dias, func(i, j int) bool { return sn.Dias[i].Fecha < sn.Dias[j].Fecha })
	return sn
}

// ---- diff ----

// Cambio is a row of the publish dialog («Lucía Martín · sáb 19/12 09:00 → dom 20/12 09:00»).
type Cambio struct {
	Tipo    string `json:"tipo" enum:"atleta,jornada,alta,baja,agenda"`
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
	Atletas     int      `json:"atletas" doc:"Atletas en las fechas publicadas"`
	afectados   []uuid.UUID
}

// posicion is what an athlete sees of their schedule: the date, its start and the weigh-in (the lot inside the day
// does not trigger a notice).
type posicion struct {
	dia    string
	inicio time.Time
	pesaje time.Time
}

func posiciones(sn *Snapshot) map[uuid.UUID]posicion {
	out := map[uuid.UUID]posicion{}
	if sn == nil {
		return out
	}
	for _, d := range sn.Dias {
		for _, a := range d.Atletas {
			out[a.ID] = posicion{d.Fecha, d.Inicio, d.PesajeInicio}
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
	type grupo struct {
		c   Cambio
		ids []uuid.UUID
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
		case q.dia != p.dia:
			d.Cambios = append(d.Cambios, Cambio{Tipo: "atleta", Titulo: nombre(id), Antes: pos(q), Despues: pos(p), Atletas: 1})
			d.afectados = append(d.afectados, id)
		case !q.inicio.Equal(p.inicio) || !q.pesaje.Equal(p.pesaje):
			var a, b string
			if !q.inicio.Equal(p.inicio) {
				a, b = "inicio "+hhmm(q.inicio, loc), "inicio "+hhmm(p.inicio, loc)
			}
			if !q.pesaje.Equal(p.pesaje) {
				a, b = join(a, "pesaje "+hhmm(q.pesaje, loc)), join(b, "pesaje "+hhmm(p.pesaje, loc))
			}
			k := p.dia + "|" + a + "|" + b
			g, ok := grupos[k]
			if !ok {
				g = &grupo{c: Cambio{Tipo: "jornada", Antes: a, Despues: b}}
				grupos[k] = g
				orden = append(orden, k)
			}
			g.ids = append(g.ids, id)
			d.afectados = append(d.afectados, id)
		}
	}
	for id, q := range antes {
		if _, sigue := ahora[id]; !sigue {
			d.Cambios = append(d.Cambios, Cambio{Tipo: "baja", Titulo: nombre(id), Antes: pos(q), Despues: "sin fecha", Atletas: 1})
			if _, ok := byID[id]; ok {
				d.afectados = append(d.afectados, id) // still confirmed: tell them they have no date now
			}
		}
	}
	sort.Strings(orden)
	for _, k := range orden {
		g := grupos[k]
		g.c.Titulo = fmt.Sprintf("%s (%d atletas)", diaCorto(dayTime(k[:indexBar(k)], "12:00", loc), loc), len(g.ids))
		g.c.Atletas = len(g.ids)
		d.Cambios = append(d.Cambios, g.c)
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

func indexBar(s string) int {
	for i, r := range s {
		if r == '|' {
			return i
		}
	}
	return len(s)
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
}

// aplicarIn is the body of athletes' PUT /internal/competiciones/{cid}/horarios.
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

// preparar builds the snapshot to publish and its diff. With prueba, only the date of that competition is published:
// the snapshot is its draft plus the published dates of the other one, and the diff, the conflicts and the version
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
	bp.Jornadas = nil
	for _, j := range b.Jornadas {
		if j.Prueba == prueba {
			bp.Jornadas = append(bp.Jornadas, j)
		}
	}
	bp.Conflictos = nil
	for _, c := range b.Conflictos {
		for _, j := range bp.Jornadas {
			if c.Dia == j.Dia {
				bp.Conflictos = append(bp.Conflictos, c)
			}
		}
	}
	snP := snapshot(bp, byID, n)
	sn := snP
	var psP *Snapshot
	if ps != nil {
		suya, resto, tiene := partir(*ps, prueba)
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
	b, _, _, sn, d, err := s.preparar(ctx, cid, prueba)
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
		return Publicado{}, problem.Unprocessable("SIN_ATLETAS", "No hay fechas con atletas que publicar.")
	}
	if !d.Primera && len(d.Cambios) == 0 {
		return Publicado{}, problem.Conflict("SIN_CAMBIOS", "No hay cambios respecto a la versión publicada.")
	}
	in := aplicarIn{Version: sn.Numero, Asignaciones: []asignacion{}, Afectados: d.afectados, AvisarAtletas: avisarAtletas, AvisarSeguidores: avisarSeguidores, Primera: d.Primera}
	if in.Afectados == nil {
		in.Afectados = []uuid.UUID{}
	}
	for _, dd := range sn.Dias {
		for _, a := range dd.Atletas {
			in.Asignaciones = append(in.Asignaciones, asignacion{a.ID, dd.Fecha, a.Lote, dd.Inicio, dd.PesajeInicio, dd.PesajeFin})
		}
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
		fechas := []string{}
		for _, dd := range sn.Dias {
			fechas = append(fechas, dd.Fecha)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM directo_jornada WHERE competition_id = $1 AND NOT (dia::text = ANY($2))`, cid, fechas); err != nil {
			return err
		}
		cfg, _, _, _, err := loadConfig(ctx, tx, cid)
		if err != nil {
			return err
		}
		if err := avisarJornadas(ctx, tx, cid, cfg.Dias); err != nil {
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

// restaurar replaces the draft athletes and agenda with a published snapshot and copies its doors time and notes
// into the date settings. A version of one competition (prueba) only brings back the dates of that competition.
func restaurar(ctx context.Context, tx pgx.Tx, cid uuid.UUID, sn Snapshot, prueba string) error {
	cfg, _, _, _, err := loadConfig(ctx, tx, cid)
	if err != nil {
		return err
	}
	for _, d := range sn.Dias {
		if prueba != "" && d.Prueba != prueba {
			continue
		}
		ids := make([]uuid.UUID, len(d.Atletas))
		for i, a := range d.Atletas {
			ids[i] = a.ID
		}
		for _, q := range []string{`DELETE FROM jornada_atletas WHERE competition_id = $1 AND dia = $2`, `DELETE FROM agenda WHERE competition_id = $1 AND dia = $2`} {
			if _, err := tx.Exec(ctx, q, cid, d.Fecha); err != nil {
				return err
			}
		}
		if err := insertarJornada(ctx, tx, cid, d.Fecha, ids); err != nil {
			return err
		}
		for i, a := range d.Agenda {
			if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden) VALUES ($1,$2,$3,$4,$5,$6,$7)`, newID(), cid, d.Fecha, a.Hora, a.Titulo, a.Icono, i); err != nil {
				return err
			}
		}
		esta := false
		for i := range cfg.Dias {
			if cfg.Dias[i].Fecha == d.Fecha {
				cfg.Dias[i].Puertas, cfg.Dias[i].Notas, esta = d.Puertas, d.Notas, true
			}
		}
		if !esta {
			cfg.Dias = append(cfg.Dias, Dia{Fecha: d.Fecha, Inicio: hhmm(d.Inicio, madrid), Fin: "21:00", Puertas: d.Puertas, Notas: d.Notas})
		}
	}
	if err := validarDias(cfg.Dias); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, cid, cfg.Dias)
	return err
}

var diasCortos = [...]string{"dom", "lun", "mar", "mié", "jue", "vie", "sáb"}

func diaCorto(t time.Time, loc *time.Location) string {
	t = t.In(loc)
	return diasCortos[t.Weekday()] + " " + t.Format("2/1")
}
