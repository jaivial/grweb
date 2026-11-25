package schedule

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Dia is a day of competition (local times of the competition time zone).
type Dia struct {
	Fecha       string   `json:"fecha" format:"date"`
	Inicio      string   `json:"inicio" pattern:"^[0-2][0-9]:[0-5][0-9]$" doc:"Primera sesión"`
	Fin         string   `json:"fin" pattern:"^[0-2][0-9]:[0-5][0-9]$" doc:"Última sesión terminada"`
	Puertas     string   `json:"puertas,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$" doc:"Apertura de puertas al público"`
	PausaInicio string   `json:"pausaInicio,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$"`
	PausaFin    string   `json:"pausaFin,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$"`
	Notas       []string `json:"notas,omitempty" maxItems:"6" doc:"«Info del día» de la web"`
}

// Config are the planner settings (Figma 56 toolbar and «Ajustes del día»).
type Config struct {
	MaxPorSesion      int   `json:"maxPorSesion" db:"max_por_sesion" minimum:"2" maximum:"30"`
	MinPorAtleta      int   `json:"minPorAtleta" db:"min_por_atleta" minimum:"3" maximum:"20" doc:"Minutos estimados por atleta (9 intentos)"`
	DescansoMin       int   `json:"descansoMin" db:"descanso_min" minimum:"0" maximum:"120" doc:"Entre sesiones (una sola tarima)"`
	PesajeAntesMin    int   `json:"pesajeAntesMin" db:"pesaje_antes_min" minimum:"30" maximum:"240" doc:"El pesaje abre N minutos antes de la sesión"`
	PesajeDuracionMin int   `json:"pesajeDuracionMin" db:"pesaje_duracion_min" minimum:"15" maximum:"180"`
	MesasPesaje       int   `json:"mesasPesaje" db:"mesas_pesaje" minimum:"1" maximum:"4"`
	Dias              []Dia `json:"dias" db:"dias" maxItems:"7"`
}

// atleta is a confirmed athlete as the athletes service gives it to other services.
type atleta struct {
	ID             uuid.UUID `json:"id"`
	Nombre         string    `json:"nombre"`
	Slug           string    `json:"slug"`
	Publico        bool      `json:"publico"`
	Email          bool      `json:"conEmail"`
	Sexo           string    `json:"sexo"`
	Categoria      string    `json:"categoria"`
	DivisionNombre string    `json:"divisionNombre"`
	Club           string    `json:"club"`
	Prueba         string    `json:"prueba"`
	TotalPrevisto  *float64  `json:"totalPrevisto,omitempty"`
	Seguidores     int       `json:"seguidores"`
}

// SesionAtleta is an athlete in the planner.
type SesionAtleta struct {
	ID             uuid.UUID `json:"id"`
	Nombre         string    `json:"nombre"`
	Sexo           string    `json:"sexo"`
	Categoria      string    `json:"categoria"`
	Club           string    `json:"club"`
	DivisionNombre string    `json:"divisionNombre"`
	Prueba         string    `json:"prueba" doc:"Competición del atleta: aep2, aep3 o vacío (sin elegir)"`
	TotalPrevisto  *float64  `json:"totalPrevisto,omitempty"`
	Seguidores     int       `json:"seguidores"`
	Lote           int       `json:"lote"`
	Baja           bool      `json:"baja" doc:"Ya no está confirmado: se quitará al publicar"`
}

// Directo is the live state of a sesion on the day.
type Directo struct {
	Estado     string `json:"estado" enum:"programado,en_curso,finalizado"`
	RetrasoMin int    `json:"retrasoMin,omitempty"`
}

// Sesion is a sesion of the draft.
type Sesion struct {
	ID           uuid.UUID      `json:"id"`
	Prueba       string         `json:"prueba" doc:"Competición de la sesión: aep2, aep3 o vacío (sin competición)"`
	Dia          string         `json:"dia" format:"date"`
	Inicio       time.Time      `json:"inicio"`
	Fin          time.Time      `json:"fin" doc:"Fin estimado"`
	DuracionMin  int            `json:"duracionMin"`
	PesajeInicio time.Time      `json:"pesajeInicio"`
	PesajeFin    time.Time      `json:"pesajeFin"`
	Titulo       string         `json:"titulo" doc:"Femenino −57 / −63 kg"`
	Sexo         string         `json:"sexo" doc:"F, M, X (mixto) o vacío"`
	Categorias   []string       `json:"categorias" doc:"Categorías de peso elegidas para la sesión (vacío: las de sus atletas)"`
	SexoFijo     bool           `json:"sexoFijo" doc:"El sexo y las categorías los fijó el backoffice"`
	Atletas      []SesionAtleta `json:"atletas"`
	Directo      Directo        `json:"directo"`
	Publicado    bool           `json:"publicado" doc:"Está en la versión publicada (admite estado en directo)"`
	Avisos       []string       `json:"avisos" doc:"Conflictos que afectan a esta sesión (texto corto)"`
}

// AgendaItem is another moment of the day (doors, awards…).
type AgendaItem struct {
	Dia    string `json:"dia" format:"date"`
	Hora   string `json:"hora" pattern:"^[0-2][0-9]:[0-5][0-9]$"`
	Titulo string `json:"titulo" minLength:"1" maxLength:"120"`
	Icono  string `json:"icono,omitempty" enum:"clock,door,trophy,ticket,users,info,camera,gift"`
}

// Conflicto is a problem of the draft. Blocking ones must be solved before publishing.
type Conflicto struct {
	Tipo     string     `json:"tipo" enum:"exceso,solape,solape_pesaje,sexo_mixto,fuera_horario,pausa,baja,sin_sesion,vacio"`
	Bloquea  bool       `json:"bloquea"`
	SesionID *uuid.UUID `json:"sesionId,omitempty"`
	Sesion   string     `json:"sesion,omitempty"`
	Prueba   string     `json:"prueba,omitempty" doc:"Competición de la sesión afectada"`
	Titulo   string     `json:"titulo"`
	Detalle  string     `json:"detalle"`
}

// VersionInfo summarises a published version.
type VersionInfo struct {
	Numero       int       `json:"numero"`
	Prueba       string    `json:"prueba" doc:"Competición publicada (vacío: todo el evento)"`
	NumeroPrueba int       `json:"numeroPrueba" doc:"Número de versión dentro de su competición («v1 · AEP-3»)"`
	Estado       string    `json:"estado" enum:"publicada,sustituida,retirada"`
	At           time.Time `json:"at"`
	Por          string    `json:"por"`
	Cambios      int       `json:"cambios"`
	Avisos       int       `json:"avisos"`
	Seguidores   int       `json:"seguidores"`
}

// Borrador is the planner (GET …/horarios).
type Borrador struct {
	Config             Config         `json:"config"`
	Rev                int            `json:"rev"`
	ZonaHoraria        string         `json:"zonaHoraria"`
	Sesiones           []Sesion       `json:"sesiones"`
	Agenda             []AgendaItem   `json:"agenda"`
	SinSesion          []SesionAtleta `json:"sinSesion"`
	Conflictos         []Conflicto    `json:"conflictos"`
	Atletas            int            `json:"atletas" doc:"Atletas confirmados"`
	Publicado          bool           `json:"publicado"`
	Publicada          *VersionInfo   `json:"publicada,omitempty"`
	CambiosSinPublicar bool           `json:"cambiosSinPublicar"`
}

// confirmados asks athletes for the confirmed athletes (planning data; no contact data).
func (s *Svc) confirmados(ctx context.Context, cid uuid.UUID) ([]atleta, error) {
	var out []atleta
	if err := s.athletes.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/atletas", nil, &out); err != nil {
		s.a.Log.Warn("athletes no disponible", "err", err)
		return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No podemos cargar los atletas ahora mismo. Inténtalo en unos segundos.")
	}
	return out, nil
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func loadConfig(ctx context.Context, q querier, cid uuid.UUID) (Config, int, int, bool, error) {
	var c Config
	var rev, revPub int
	var pub bool
	err := q.QueryRow(ctx, `SELECT max_por_sesion, min_por_atleta, descanso_min, pesaje_antes_min, pesaje_duracion_min,
		mesas_pesaje, dias, rev, rev_publicada, publicado FROM config WHERE competition_id = $1`, cid).
		Scan(&c.MaxPorSesion, &c.MinPorAtleta, &c.DescansoMin, &c.PesajeAntesMin, &c.PesajeDuracionMin,
			&c.MesasPesaje, &c.Dias, &rev, &revPub, &pub)
	if c.Dias == nil {
		c.Dias = []Dia{}
	}
	return c, rev, revPub, pub, err
}

type sesionRow struct {
	ID                          uuid.UUID
	Prueba                      string
	Sexo                        string   // BIZ-202: set from the backoffice ('' = from its athletes)
	Categorias                  []string // BIZ-202: weight classes of the session (empty = from its athletes)
	Dia                         time.Time
	DuracionMin                 int
	Inicio, PesajeIni, PesajeFn time.Time
}

func loadSesiones(ctx context.Context, q querier, cid uuid.UUID) ([]sesionRow, map[uuid.UUID][]uuid.UUID, error) {
	rows, err := q.Query(ctx, `SELECT id, prueba, sexo, categorias, dia, duracion_min, inicio, pesaje_inicio, pesaje_fin FROM sesiones WHERE competition_id = $1 ORDER BY dia, inicio, created_at`, cid)
	if err != nil {
		return nil, nil, err
	}
	fl, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (sesionRow, error) {
		var f sesionRow
		err := r.Scan(&f.ID, &f.Prueba, &f.Sexo, &f.Categorias, &f.Dia, &f.DuracionMin, &f.Inicio, &f.PesajeIni, &f.PesajeFn)
		return f, err
	})
	if err != nil {
		return nil, nil, err
	}
	rows, err = q.Query(ctx, `SELECT sesion_id, atleta_id FROM sesion_atletas WHERE competition_id = $1 ORDER BY sesion_id, orden`, cid)
	if err != nil {
		return nil, nil, err
	}
	asig := map[uuid.UUID][]uuid.UUID{}
	for rows.Next() {
		var f, a uuid.UUID
		if err := rows.Scan(&f, &a); err != nil {
			rows.Close()
			return nil, nil, err
		}
		asig[f] = append(asig[f], a)
	}
	return fl, asig, rows.Err()
}

func loadAgenda(ctx context.Context, q querier, cid uuid.UUID) ([]AgendaItem, error) {
	rows, err := q.Query(ctx, `SELECT dia::text, hora, titulo, icono FROM agenda WHERE competition_id = $1 ORDER BY dia, hora, orden`, cid)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (AgendaItem, error) {
		var a AgendaItem
		err := r.Scan(&a.Dia, &a.Hora, &a.Titulo, &a.Icono)
		return a, err
	})
}

// borrador builds the planner view: sesiones with their athletes, athletes without sesion and the conflicts.
func (s *Svc) borrador(ctx context.Context, cid uuid.UUID) (Borrador, error) {
	b, _, _, err := s.cargar(ctx, cid)
	return b, err
}

// cargar returns the planner view plus the confirmed athletes by id and the published version (nil if none).
// «Cambios sin publicar» compares the draft with that version, so undoing a move leaves nothing to publish.
func (s *Svc) cargar(ctx context.Context, cid uuid.UUID) (Borrador, map[uuid.UUID]atleta, *version, error) {
	if err := s.ensureConfig(ctx, cid); err != nil {
		return Borrador{}, nil, nil, err
	}
	ats, err := s.confirmados(ctx, cid)
	if err != nil {
		return Borrador{}, nil, nil, err
	}
	cfg, rev, _, pub, err := loadConfig(ctx, s.a.DB, cid)
	if err != nil {
		return Borrador{}, nil, nil, err
	}
	fl, asig, err := loadSesiones(ctx, s.a.DB, cid)
	if err != nil {
		return Borrador{}, nil, nil, err
	}
	ag, err := loadAgenda(ctx, s.a.DB, cid)
	if err != nil {
		return Borrador{}, nil, nil, err
	}
	dir, err := loadDirecto(ctx, s.a.DB, cid)
	if err != nil {
		return Borrador{}, nil, nil, err
	}
	b := Borrador{Config: cfg, Rev: rev, Agenda: ag, Atletas: len(ats), Publicado: pub}
	if b.Agenda == nil {
		b.Agenda = []AgendaItem{}
	}
	loc := s.loc(ctx, cid)
	b.ZonaHoraria = loc.String()
	byID := map[uuid.UUID]atleta{}
	for _, a := range ats {
		byID[a.ID] = a
	}
	asignado := map[uuid.UUID]bool{}
	for _, f := range fl {
		nf := buildSesion(f, asig[f.ID], byID, dir, asignado)
		if f.Prueba == "" && nf.Prueba != "" {
			// Backfill of the sesiones created before sesiones.prueba: their athletes' competition.
			if _, err := s.a.DB.Exec(ctx, `UPDATE sesiones SET prueba = $3 WHERE competition_id = $1 AND id = $2 AND prueba = ''`, cid, f.ID, nf.Prueba); err != nil {
				return Borrador{}, nil, nil, err
			}
		}
		b.Sesiones = append(b.Sesiones, nf)
	}
	if b.Sesiones == nil {
		b.Sesiones = []Sesion{}
	}
	b.SinSesion = []SesionAtleta{}
	for _, a := range ats {
		if !asignado[a.ID] {
			b.SinSesion = append(b.SinSesion, toFA(a, 0))
		}
	}
	sort.SliceStable(b.SinSesion, func(i, j int) bool {
		return catLess(b.SinSesion[i].Sexo, b.SinSesion[i].Categoria, b.SinSesion[j].Sexo, b.SinSesion[j].Categoria)
	})
	sinCat := 0
	for _, a := range b.SinSesion {
		if catKey(a.Categoria) == 999 {
			sinCat++
		}
	}
	b.Conflictos = conflictos(cfg, loc, b.Sesiones, len(b.SinSesion), sinCat)
	for i := range b.Sesiones {
		b.Sesiones[i].Avisos = []string{}
		for _, c := range b.Conflictos {
			if c.SesionID != nil && *c.SesionID == b.Sesiones[i].ID {
				b.Sesiones[i].Avisos = append(b.Sesiones[i].Avisos, c.Titulo)
			}
		}
	}
	for i, c := range b.Conflictos {
		for _, f := range b.Sesiones {
			if c.SesionID != nil && *c.SesionID == f.ID {
				b.Conflictos[i].Prueba = f.Prueba
			}
		}
	}
	v, err := s.versionPublicada(ctx, s.a.DB, cid)
	if err != nil {
		return b, nil, nil, err
	}
	if v != nil {
		b.Publicada = &v.VersionInfo
		for i := range b.Sesiones {
			b.Sesiones[i].Publicado = v.Snapshot.sesion(b.Sesiones[i].ID) != nil
		}
		b.CambiosSinPublicar = len(diff(&v.Snapshot, snapshot(b, byID, v.Numero+1), byID, loc).Cambios) > 0
	} else {
		b.CambiosSinPublicar = len(b.Sesiones) > 0
	}
	return b, byID, v, nil
}

func toFA(a atleta, lote int) SesionAtleta {
	return SesionAtleta{ID: a.ID, Nombre: a.Nombre, Sexo: a.Sexo, Categoria: a.Categoria, Club: a.Club, DivisionNombre: a.DivisionNombre,
		Prueba: a.Prueba, TotalPrevisto: a.TotalPrevisto, Seguidores: a.Seguidores, Lote: lote}
}

func buildSesion(f sesionRow, ids []uuid.UUID, byID map[uuid.UUID]atleta, dir map[uuid.UUID]Directo, asignado map[uuid.UUID]bool) Sesion {
	out := Sesion{ID: f.ID, Dia: f.Dia.Format("2006-01-02"), Inicio: f.Inicio, DuracionMin: f.DuracionMin,
		Fin: f.Inicio.Add(time.Duration(f.DuracionMin) * time.Minute), PesajeInicio: f.PesajeIni, PesajeFin: f.PesajeFn, Atletas: []SesionAtleta{},
		Directo: Directo{Estado: "programado"}, Prueba: f.Prueba}
	if d, ok := dir[f.ID]; ok {
		out.Directo = d
	}
	var sexos, cats []string
	pruebas := map[string]bool{}
	for i, id := range ids {
		a, ok := byID[id]
		if !ok {
			out.Atletas = append(out.Atletas, SesionAtleta{ID: id, Nombre: "Atleta dado de baja", Lote: i + 1, Baja: true})
			continue
		}
		asignado[id] = true
		out.Atletas = append(out.Atletas, toFA(a, i+1))
		sexos = append(sexos, a.Sexo)
		cats = append(cats, a.Categoria)
		pruebas[a.Prueba] = true
	}
	if out.Prueba == "" && len(pruebas) == 1 {
		for p := range pruebas {
			out.Prueba = p // sesiones before sesiones.prueba: the competition of their athletes, only if all share it
		}
	}
	out.Categorias = []string{}
	if f.Sexo != "" {
		// BIZ-202: the session's own sex and weight classes win over its athletes'.
		out.SexoFijo, out.Categorias = true, append(out.Categorias, f.Categorias...)
		cs := f.Categorias
		if len(cs) == 0 {
			cs = cats
		}
		out.Sexo, out.Titulo = titulo([]string{f.Sexo}, cs)
		return out
	}
	out.Sexo, out.Titulo = titulo(sexos, cats)
	return out
}

// titulo: «Femenino −47 / −52 / −57 kg» (classes in IPF order).
func titulo(sexos, cats []string) (string, string) {
	set := map[string]bool{}
	for _, s := range sexos {
		set[s] = true
	}
	sexo := ""
	switch {
	case len(set) > 1:
		sexo = "X"
	case set["F"]:
		sexo = "F"
	case set["M"]:
		sexo = "M"
	}
	if sexo == "" {
		return "", "Sin atletas"
	}
	seen := map[string]bool{}
	var u []string
	for _, c := range cats {
		if c != "" && !seen[c] {
			seen[c] = true
			u = append(u, c)
		}
	}
	sort.Slice(u, func(i, j int) bool { return catKey(u[i]) < catKey(u[j]) })
	for i := range u {
		u[i] = strings.Replace(u[i], "-", "−", 1)
	}
	label := map[string]string{"F": "Femenino", "M": "Masculino", "X": "Mixto"}[sexo]
	if len(u) == 0 {
		return sexo, label
	}
	return sexo, label + " " + strings.Join(u, " / ") + " kg"
}

// catKey orders weight classes: −47 < −52 < … < +84.
func catKey(c string) float64 {
	n, err := strconv.ParseFloat(strings.TrimLeft(c, "+-"), 64)
	if err != nil {
		return 999
	}
	if strings.HasPrefix(c, "+") {
		n += 0.5
	}
	return n
}

func catLess(s1, c1, s2, c2 string) bool {
	if s1 != s2 {
		return s1 < s2 // F before M
	}
	return catKey(c1) < catKey(c2)
}

func loadDirecto(ctx context.Context, q querier, cid uuid.UUID) (map[uuid.UUID]Directo, error) {
	rows, err := q.Query(ctx, `SELECT sesion_id, estado, retraso_min FROM directo WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	out := map[uuid.UUID]Directo{}
	for rows.Next() {
		var id uuid.UUID
		var d Directo
		if err := rows.Scan(&id, &d.Estado, &d.RetrasoMin); err != nil {
			rows.Close()
			return nil, err
		}
		out[id] = d
	}
	return out, rows.Err()
}

// ---- conflicts ----

func hhmm(t time.Time, loc *time.Location) string { return t.In(loc).Format("15:04") }

func overlap(a1, a2, b1, b2 time.Time) bool { return a1.Before(b2) && b1.Before(a2) }

// dayTime turns «HH:MM» of a date into an instant of the competition time zone (zero when empty or invalid).
func dayTime(fecha, hm string, loc *time.Location) time.Time {
	if hm == "" {
		return time.Time{}
	}
	t, err := time.ParseInLocation("2006-01-02 15:04", fecha+" "+hm, loc)
	if err != nil {
		return time.Time{}
	}
	return t
}

func conflictos(cfg Config, loc *time.Location, fl []Sesion, sinSesion, sinCategoria int) []Conflicto {
	out := []Conflicto{}
	add := func(f *Sesion, tipo string, bloquea bool, titulo, detalle string) {
		c := Conflicto{Tipo: tipo, Bloquea: bloquea, Titulo: titulo, Detalle: detalle}
		if f != nil {
			id := f.ID
			c.SesionID, c.Sesion = &id, hhmm(f.Inicio, loc)
		}
		out = append(out, c)
	}
	dias := map[string]Dia{}
	for _, d := range cfg.Dias {
		dias[d.Fecha] = d
	}
	for i := range fl {
		f := &fl[i]
		activos := 0
		for _, a := range f.Atletas {
			if !a.Baja {
				activos++
			}
		}
		if activos > cfg.MaxPorSesion {
			add(f, "exceso", true, fmt.Sprintf("La sesión de las %s tiene %d atletas", hhmm(f.Inicio, loc), activos), fmt.Sprintf("Máximo %d (reglamento del evento).", cfg.MaxPorSesion))
		}
		if len(f.Atletas) == 0 {
			add(f, "vacio", false, "La sesión de las "+hhmm(f.Inicio, loc)+" está vacía", "No se publicará mientras no tenga atletas.")
		}
		for _, a := range f.Atletas {
			if a.Baja {
				add(f, "baja", false, "Una baja sigue en la sesión de las "+hhmm(f.Inicio, loc), "Ya no está confirmada: se quitará al publicar.")
			}
		}
		if f.Sexo == "X" {
			add(f, "sexo_mixto", false, "La sesión de las "+hhmm(f.Inicio, loc)+" mezcla categorías femeninas y masculinas", "Revisa si es intencionado.")
		}
		if f.SexoFijo {
			for _, a := range f.Atletas {
				if !a.Baja && a.Sexo != "" && a.Sexo != f.Sexo {
					add(f, "sexo_mixto", false, "La sesión de las "+hhmm(f.Inicio, loc)+" tiene atletas de otro sexo", "Es una sesión "+map[string]string{"F": "femenina", "M": "masculina"}[f.Sexo]+": mueve a esos atletas o cambia su sexo.")
					break
				}
			}
		}
		if d, ok := dias[f.Dia]; !ok {
			add(f, "fuera_horario", false, "La sesión de las "+hhmm(f.Inicio, loc)+" está en un día sin competición", "Añade el día en los ajustes o muévelo.")
		} else {
			ini, fin := dayTime(f.Dia, d.Inicio, loc), dayTime(f.Dia, d.Fin, loc)
			if (!ini.IsZero() && f.Inicio.Before(ini)) || (!fin.IsZero() && f.Fin.After(fin)) {
				add(f, "fuera_horario", false, "La sesión de las "+hhmm(f.Inicio, loc)+" sale del horario del día", fmt.Sprintf("Termina hacia las %s; el día acaba a las %s.", hhmm(f.Fin, loc), d.Fin))
			}
			pi, pf := dayTime(f.Dia, d.PausaInicio, loc), dayTime(f.Dia, d.PausaFin, loc)
			if !pi.IsZero() && !pf.IsZero() && overlap(f.Inicio, f.Fin, pi, pf) {
				add(f, "pausa", false, "La sesión de las "+hhmm(f.Inicio, loc)+" se come la pausa", fmt.Sprintf("Pausa %s–%s.", d.PausaInicio, d.PausaFin))
			}
		}
	}
	for i := range fl {
		for j := i + 1; j < len(fl); j++ {
			a, b := &fl[i], &fl[j]
			if a.Dia == b.Dia && !otroSexo(a, b) && overlap(a.Inicio, a.Fin, b.Inicio, b.Fin) {
				add(b, "solape", true, fmt.Sprintf("Las sesiones de las %s y de las %s se solapan", hhmm(a.Inicio, loc), hhmm(b.Inicio, loc)),
					fmt.Sprintf("Solo hay una tarima: la de las %s termina hacia las %s.", hhmm(a.Inicio, loc), hhmm(a.Fin, loc)))
			}
		}
	}
	// Weigh-in: at most «mesas» windows at the same time.
	for i := range fl {
		var con []*Sesion
		for j := range fl {
			if i != j && !otroSexo(&fl[i], &fl[j]) && overlap(fl[i].PesajeInicio, fl[i].PesajeFin, fl[j].PesajeInicio, fl[j].PesajeFin) {
				con = append(con, &fl[j])
			}
		}
		var otras []ventana
		for _, c := range con {
			otras = append(otras, ventana{c.PesajeInicio, c.PesajeFin})
		}
		// BIZ-168: what counts is how many windows are open at the same time, not how many touch this one.
		if picoPesaje(fl[i].PesajeInicio, fl[i].PesajeFin, otras)+1 <= cfg.MesasPesaje {
			continue
		}
		o := con[0]
		for _, c := range con[1:] {
			if c.Inicio.Before(o.Inicio) {
				o = c
			}
		}
		if o.Inicio.Before(fl[i].Inicio) || (o.Inicio.Equal(fl[i].Inicio) && o.ID.String() < fl[i].ID.String()) {
			ini, fin := maxT(fl[i].PesajeInicio, o.PesajeInicio), minT(fl[i].PesajeFin, o.PesajeFin)
			add(&fl[i], "solape_pesaje", true, fmt.Sprintf("El pesaje de las %s se solapa con el de las %s", hhmm(fl[i].Inicio, loc), hhmm(o.Inicio, loc)),
				fmt.Sprintf("Misma mesa de pesaje %s–%s.", hhmm(ini, loc), hhmm(fin, loc)))
		}
	}
	if sinSesion > 0 {
		add(nil, "sin_sesion", false, plural(sinSesion, "atleta sin sesión", "atletas sin sesión"), "No aparecerán en los horarios hasta que los asignes.")
	}
	if sinCategoria > 0 {
		add(nil, "sin_sesion", false, plural(sinCategoria, "atleta sin categoría", "atletas sin categoría"), "«Generar» no los coloca: ponles categoría o asígnalos a mano.")
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Bloquea && !out[j].Bloquea })
	return out
}

// otroSexo: a women's and a men's session (BIZ-202) may share a time slot and weigh-in (different platform room).
func otroSexo(a, b *Sesion) bool {
	return (a.Sexo == "F" && b.Sexo == "M") || (a.Sexo == "M" && b.Sexo == "F")
}

func maxT(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minT(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func bloqueantes(cs []Conflicto) int {
	n := 0
	for _, c := range cs {
		if c.Bloquea {
			n++
		}
	}
	return n
}

// plural: «1 atleta sin sesión» / «3 atletas sin sesión».
func plural(n int, uno, varios string) string {
	if n == 1 {
		return "1 " + uno
	}
	return fmt.Sprintf("%d %s", n, varios)
}

type ventana struct{ ini, fin time.Time }

// picoPesaje is the most windows of otras open at the same instant inside [ini, fin) (BIZ-168).
func picoPesaje(ini, fin time.Time, otras []ventana) int {
	pico := 0
	for _, w := range otras {
		t := maxT(w.ini, ini) // the peak starts where some window starts
		if !t.Before(fin) {
			continue
		}
		n := 0
		for _, o := range otras {
			if !t.Before(o.ini) && t.Before(o.fin) {
				n++
			}
		}
		if n > pico {
			pico = n
		}
	}
	return pico
}
