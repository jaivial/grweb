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

// Dia is a date of the competition (local times of the competition time zone). Every date follows the same
// template: a new one copies the settings of the last one.
type Dia struct {
	Fecha       string   `json:"fecha" format:"date"`
	Inicio      string   `json:"inicio" pattern:"^[0-2][0-9]:[0-5][0-9]$" doc:"Empieza la competición del día"`
	Fin         string   `json:"fin" pattern:"^[0-2][0-9]:[0-5][0-9]$" doc:"Hora límite del día"`
	Puertas     string   `json:"puertas,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$" doc:"Apertura de puertas al público"`
	PausaInicio string   `json:"pausaInicio,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$"`
	PausaFin    string   `json:"pausaFin,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$"`
	Notas       []string `json:"notas,omitempty" maxItems:"6" doc:"«Info del día» de la web"`
}

// Config are the planner settings (one platform, no flights).
type Config struct {
	MinPorAtleta      int   `json:"minPorAtleta" db:"min_por_atleta" minimum:"3" maximum:"20" doc:"Minutos estimados por atleta (9 intentos) para el fin estimado del día"`
	PesajeAntesMin    int   `json:"pesajeAntesMin" db:"pesaje_antes_min" minimum:"30" maximum:"240" doc:"El pesaje abre N minutos antes del inicio del día"`
	PesajeDuracionMin int   `json:"pesajeDuracionMin" db:"pesaje_duracion_min" minimum:"15" maximum:"180"`
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

// AtletaPlan is an athlete in the planner.
type AtletaPlan struct {
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

// Directo is the live state of a day (driven by the OpenLifter desk).
type Directo struct {
	Estado     string `json:"estado" enum:"programado,en_curso,finalizado"`
	RetrasoMin int    `json:"retrasoMin,omitempty"`
}

// Jornada is a date of the draft: its athletes in lot order on the only platform.
type Jornada struct {
	Dia          string       `json:"dia" format:"date"`
	Prueba       string       `json:"prueba" doc:"Competición del día: aep2 (1.ª fecha), aep3 (2.ª) o vacío"`
	Inicio       time.Time    `json:"inicio"`
	Fin          time.Time    `json:"fin" doc:"Fin estimado (atletas × min por atleta, saltando la pausa)"`
	PesajeInicio time.Time    `json:"pesajeInicio"`
	PesajeFin    time.Time    `json:"pesajeFin"`
	Atletas      []AtletaPlan `json:"atletas"`
	Directo      Directo      `json:"directo"`
	Publicado    bool         `json:"publicado" doc:"Está en la versión publicada (admite estado en directo)"`
	Avisos       []string     `json:"avisos" doc:"Conflictos que afectan a este día (texto corto)"`
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
	Tipo    string `json:"tipo" enum:"fuera_horario,baja,sin_jornada,prueba_distinta,dia_inexistente"`
	Bloquea bool   `json:"bloquea"`
	Dia     string `json:"dia,omitempty" format:"date"`
	Titulo  string `json:"titulo"`
	Detalle string `json:"detalle"`
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
	Config             Config       `json:"config"`
	Rev                int          `json:"rev"`
	ZonaHoraria        string       `json:"zonaHoraria"`
	Jornadas           []Jornada    `json:"jornadas"`
	Agenda             []AgendaItem `json:"agenda"`
	SinJornada         []AtletaPlan `json:"sinJornada"`
	Conflictos         []Conflicto  `json:"conflictos"`
	Atletas            int          `json:"atletas" doc:"Atletas confirmados"`
	Publicado          bool         `json:"publicado"`
	Publicada          *VersionInfo `json:"publicada,omitempty"`
	CambiosSinPublicar bool         `json:"cambiosSinPublicar"`
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
	err := q.QueryRow(ctx, `SELECT min_por_atleta, pesaje_antes_min, pesaje_duracion_min, dias, rev, rev_publicada, publicado FROM config WHERE competition_id = $1`, cid).
		Scan(&c.MinPorAtleta, &c.PesajeAntesMin, &c.PesajeDuracionMin, &c.Dias, &rev, &revPub, &pub)
	if c.Dias == nil {
		c.Dias = []Dia{}
	}
	return c, rev, revPub, pub, err
}

// loadJornadas returns the athletes of every day in lot order.
func loadJornadas(ctx context.Context, q querier, cid uuid.UUID) (map[string][]uuid.UUID, error) {
	rows, err := q.Query(ctx, `SELECT dia::text, atleta_id FROM jornada_atletas WHERE competition_id = $1 ORDER BY dia, orden`, cid)
	if err != nil {
		return nil, err
	}
	out := map[string][]uuid.UUID{}
	for rows.Next() {
		var d string
		var a uuid.UUID
		if err := rows.Scan(&d, &a); err != nil {
			rows.Close()
			return nil, err
		}
		out[d] = append(out[d], a)
	}
	return out, rows.Err()
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

// borrador builds the planner view.
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
	asig, err := loadJornadas(ctx, s.a.DB, cid)
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
	b := Borrador{Config: cfg, Rev: rev, Agenda: ag, Atletas: len(ats), Publicado: pub, Jornadas: []Jornada{}, SinJornada: []AtletaPlan{}}
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
	// One jornada per configured date, plus any date that still has athletes but was removed from the settings.
	fechas := map[string]bool{}
	for i, d := range cfg.Dias {
		fechas[d.Fecha] = true
		b.Jornadas = append(b.Jornadas, buildJornada(cfg, loc, d, pruebaDeDia(cfg.Dias, i), asig[d.Fecha], byID, dir, asignado))
	}
	var huerfanos []string
	for f := range asig {
		if !fechas[f] {
			huerfanos = append(huerfanos, f)
		}
	}
	sort.Strings(huerfanos)
	for _, f := range huerfanos {
		b.Jornadas = append(b.Jornadas, buildJornada(cfg, loc, Dia{Fecha: f, Inicio: "09:00", Fin: "21:00"}, "", asig[f], byID, dir, asignado))
	}
	for _, a := range ats {
		if !asignado[a.ID] {
			b.SinJornada = append(b.SinJornada, toAP(a, 0))
		}
	}
	sort.SliceStable(b.SinJornada, func(i, j int) bool { return ordenSalida(b.SinJornada[i], b.SinJornada[j]) })
	b.Conflictos = conflictos(cfg, loc, b.Jornadas, fechas, len(b.SinJornada))
	for i := range b.Jornadas {
		b.Jornadas[i].Avisos = []string{}
		for _, c := range b.Conflictos {
			if c.Dia == b.Jornadas[i].Dia {
				b.Jornadas[i].Avisos = append(b.Jornadas[i].Avisos, c.Titulo)
			}
		}
	}
	v, err := s.versionPublicada(ctx, s.a.DB, cid)
	if err != nil {
		return b, nil, nil, err
	}
	if v != nil {
		b.Publicada = &v.VersionInfo
		for i := range b.Jornadas {
			b.Jornadas[i].Publicado = v.Snapshot.dia(b.Jornadas[i].Dia) != nil
		}
		b.CambiosSinPublicar = len(diff(&v.Snapshot, snapshot(b, byID, v.Numero+1), byID, loc).Cambios) > 0
	} else {
		b.CambiosSinPublicar = asignados(b) > 0
	}
	return b, byID, v, nil
}

func asignados(b Borrador) int {
	n := 0
	for _, j := range b.Jornadas {
		n += len(j.Atletas)
	}
	return n
}

func toAP(a atleta, lote int) AtletaPlan {
	return AtletaPlan{ID: a.ID, Nombre: a.Nombre, Sexo: a.Sexo, Categoria: a.Categoria, Club: a.Club, DivisionNombre: a.DivisionNombre,
		Prueba: a.Prueba, TotalPrevisto: a.TotalPrevisto, Seguidores: a.Seguidores, Lote: lote}
}

// tiempos returns the start, the estimated end and the weigh-in window of a day with n active athletes.
func tiempos(cfg Config, loc *time.Location, d Dia, n int) (ini, fin, pi, pf time.Time) {
	ini = dayTime(d.Fecha, d.Inicio, loc)
	if ini.IsZero() {
		ini = dayTime(d.Fecha, "09:00", loc)
	}
	fin = ini.Add(time.Duration((n*cfg.MinPorAtleta+4)/5*5) * time.Minute)
	if p1, p2 := dayTime(d.Fecha, d.PausaInicio, loc), dayTime(d.Fecha, d.PausaFin, loc); !p1.IsZero() && !p2.IsZero() && fin.After(p1) {
		fin = fin.Add(p2.Sub(p1)) // the lunch break pauses the session
	}
	pi, pf = pesaje(cfg, ini)
	return
}

func buildJornada(cfg Config, loc *time.Location, d Dia, prueba string, ids []uuid.UUID, byID map[uuid.UUID]atleta, dir map[string]Directo, asignado map[uuid.UUID]bool) Jornada {
	out := Jornada{Dia: d.Fecha, Prueba: prueba, Atletas: []AtletaPlan{}, Directo: Directo{Estado: "programado"}}
	if x, ok := dir[d.Fecha]; ok {
		out.Directo = x
	}
	activos := 0
	for i, id := range ids {
		a, ok := byID[id]
		if !ok {
			out.Atletas = append(out.Atletas, AtletaPlan{ID: id, Nombre: "Atleta dado de baja", Lote: i + 1, Baja: true})
			continue
		}
		asignado[id] = true
		activos++
		out.Atletas = append(out.Atletas, toAP(a, i+1))
	}
	out.Inicio, out.Fin, out.PesajeInicio, out.PesajeFin = tiempos(cfg, loc, d, activos)
	return out
}

// ordenSalida is the lot order of a day: women first, lighter class first, lower expected total, name.
func ordenSalida(a, b AtletaPlan) bool {
	if a.Sexo != b.Sexo {
		return a.Sexo < b.Sexo // F before M
	}
	if ka, kb := catKey(a.Categoria), catKey(b.Categoria); ka != kb {
		return ka < kb
	}
	ta, tb := 0.0, 0.0
	if a.TotalPrevisto != nil {
		ta = *a.TotalPrevisto
	}
	if b.TotalPrevisto != nil {
		tb = *b.TotalPrevisto
	}
	if ta != tb {
		return ta < tb
	}
	return strings.ToLower(a.Nombre) < strings.ToLower(b.Nombre)
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

func loadDirecto(ctx context.Context, q querier, cid uuid.UUID) (map[string]Directo, error) {
	rows, err := q.Query(ctx, `SELECT dia::text, estado, retraso_min FROM directo_jornada WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	out := map[string]Directo{}
	for rows.Next() {
		var dia string
		var d Directo
		if err := rows.Scan(&dia, &d.Estado, &d.RetrasoMin); err != nil {
			rows.Close()
			return nil, err
		}
		out[dia] = d
	}
	return out, rows.Err()
}

// ---- conflicts ----

func hhmm(t time.Time, loc *time.Location) string { return t.In(loc).Format("15:04") }

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

func conflictos(cfg Config, loc *time.Location, js []Jornada, fechas map[string]bool, sinJornada int) []Conflicto {
	out := []Conflicto{}
	dias := map[string]Dia{}
	for _, d := range cfg.Dias {
		dias[d.Fecha] = d
	}
	for _, j := range js {
		add := func(tipo string, bloquea bool, titulo, detalle string) {
			out = append(out, Conflicto{Tipo: tipo, Bloquea: bloquea, Dia: j.Dia, Titulo: titulo, Detalle: detalle})
		}
		if !fechas[j.Dia] {
			add("dia_inexistente", true, plural(len(j.Atletas), "atleta en una fecha borrada", "atletas en una fecha borrada"), "Muévelos a otra fecha antes de publicar.")
			continue
		}
		bajas, otra := 0, 0
		for _, a := range j.Atletas {
			if a.Baja {
				bajas++
			} else if j.Prueba != "" && a.Prueba != "" && a.Prueba != j.Prueba {
				otra++
			}
		}
		if bajas > 0 {
			add("baja", false, plural(bajas, "baja sigue en la jornada", "bajas siguen en la jornada"), "Ya no están confirmadas: se quitarán al publicar.")
		}
		if otra > 0 {
			add("prueba_distinta", false, plural(otra, "atleta de otra competición", "atletas de otra competición"), "Este día es de "+nombrePrueba(j.Prueba)+". Revisa si es intencionado.")
		}
		if d := dias[j.Dia]; d.Fin != "" && len(j.Atletas) > 0 {
			if fin := dayTime(j.Dia, d.Fin, loc); !fin.IsZero() && j.Fin.After(fin) {
				add("fuera_horario", false, "El día termina más tarde de lo previsto", fmt.Sprintf("Fin estimado hacia las %s; la hora límite es %s.", hhmm(j.Fin, loc), d.Fin))
			}
		}
	}
	if sinJornada > 0 {
		out = append(out, Conflicto{Tipo: "sin_jornada", Titulo: plural(sinJornada, "atleta sin fecha", "atletas sin fecha"), Detalle: "No aparecerán en los horarios hasta que les asignes una fecha."})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Bloquea && !out[j].Bloquea })
	return out
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

// plural: «1 atleta sin fecha» / «3 atletas sin fecha».
func plural(n int, uno, varios string) string {
	if n == 1 {
		return "1 " + uno
	}
	return fmt.Sprintf("%d %s", n, varios)
}
