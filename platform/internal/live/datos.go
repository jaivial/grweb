package live

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// ---- the published flights (schedule) and the athletes (athletes) ----

type marcas struct {
	SQ *float64 `json:"sq,omitempty"`
	BP *float64 `json:"bp,omitempty"`
	DL *float64 `json:"dl,omitempty"`
}

func (m marcas) de(mov string) *float64 {
	switch mov {
	case "sq":
		return m.SQ
	case "bp":
		return m.BP
	}
	return m.DL
}

// atleta is what the desk needs of a confirmed athlete (internal: full name; the public views use publico/slug).
type atleta struct {
	ID             uuid.UUID `json:"id"`
	Nombre         string    `json:"nombre"`
	Slug           string    `json:"slug"`
	Publico        bool      `json:"publico"`
	Sexo           string    `json:"sexo"`
	Categoria      string    `json:"categoria"`
	DivisionNombre string    `json:"divisionNombre"`
	Club           string    `json:"club"`
	PesoCorporal   *float64  `json:"pesoCorporal,omitempty"`
	Primeros       marcas    `json:"primeros"`
	RackSQ         *int      `json:"rackSq,omitempty"`
	RackBP         string    `json:"rackBp,omitempty"`
	Frase          string    `json:"frase,omitempty"`
	// from the published schedule
	Lote   int       `json:"-"`
	Flight uuid.UUID `json:"-"`
}

type snapAtleta struct {
	ID   uuid.UUID `json:"id"`
	Lote int       `json:"lote"`
}

// flight is a published flight with its athletes in lot order.
type flight struct {
	ID         uuid.UUID    `json:"id"`
	Codigo     string       `json:"codigo"`
	Titulo     string       `json:"titulo"`
	Sexo       string       `json:"sexo"`
	Plataforma int          `json:"plataforma"`
	Inicio     time.Time    `json:"inicio"`
	Fin        time.Time    `json:"fin"`
	Atletas    []snapAtleta `json:"atletas"`
	Dia        string       `json:"dia"`
}

type snapshot struct {
	Numero int `json:"numero"`
	Dias   []struct {
		Fecha   string   `json:"fecha"`
		Flights []flight `json:"flights"`
	} `json:"dias"`
}

// plan is the published schedule joined with the athletes (cached a few seconds; bumped by the desk changes).
type plan struct {
	Version int                   `json:"version"`
	Flights []flight              `json:"flights"`
	Atletas map[uuid.UUID]*atleta `json:"atletas"`
	porCat  map[string][]*atleta  `json:"-"`
	fl      map[uuid.UUID]*flight `json:"-"`
}

func (p *plan) index() {
	p.porCat = map[string][]*atleta{}
	p.fl = map[uuid.UUID]*flight{}
	for i := range p.Flights {
		f := &p.Flights[i]
		p.fl[f.ID] = f
		for _, x := range f.Atletas {
			if a := p.Atletas[x.ID]; a != nil {
				a.Lote, a.Flight = x.Lote, f.ID
			}
		}
	}
	for _, a := range p.Atletas {
		if a.Flight == uuid.Nil {
			continue // confirmed but not in the published schedule (late change): not on the desk
		}
		k := clave(a.Sexo, a.Categoria)
		p.porCat[k] = append(p.porCat[k], a)
	}
}

func (p *plan) flight(id uuid.UUID) *flight { return p.fl[id] }

func clave(sexo, cat string) string { return sexo + cat }

// cargarPlan reads the published schedule and the athletes. No published schedule → an empty plan (the desk says
// to publish the schedule first).
func (s *Svc) cargarPlan(ctx context.Context, cid uuid.UUID) (*plan, error) {
	key := "plan:" + cid.String()
	var p plan
	if !s.cache.Get(ctx, key, &p) {
		var sn *snapshot
		if err := s.schedule.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/horarios/publicados", nil, &sn); err != nil {
			s.a.Log.Warn("horarios publicados", "err", err)
			return nil, problem.New(http.StatusServiceUnavailable, "HORARIOS_NO_DISPONIBLES", "No se pudieron leer los horarios publicados. Reintenta en unos segundos.")
		}
		var ats []atleta
		if err := s.athletes.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/atletas", nil, &ats); err != nil {
			s.a.Log.Warn("atletas", "err", err)
			return nil, problem.New(http.StatusServiceUnavailable, "ATLETAS_NO_DISPONIBLES", "No se pudieron leer los atletas. Reintenta en unos segundos.")
		}
		p = plan{Atletas: map[uuid.UUID]*atleta{}}
		if sn != nil {
			p.Version = sn.Numero
			for _, d := range sn.Dias {
				for _, f := range d.Flights {
					f.Dia = d.Fecha
					p.Flights = append(p.Flights, f)
				}
			}
		}
		for i := range ats {
			p.Atletas[ats[i].ID] = &ats[i]
		}
		s.cache.Set(ctx, key, p, 15*time.Second)
	}
	p.index()
	return &p, nil
}

// ---- attempts ----

type intento struct {
	ID           uuid.UUID  `json:"id"`
	AtletaID     uuid.UUID  `json:"atletaId"`
	FlightID     uuid.UUID  `json:"flightId"`
	Mov          string     `json:"movimiento"`
	Numero       int        `json:"numero"`
	Peso         float64    `json:"peso"`
	Votos        string     `json:"votos"`
	Resultado    string     `json:"resultado" enum:"pendiente,valido,nulo,renuncia"`
	CorregidoPor string     `json:"corregidoPor,omitempty"`
	Motivo       string     `json:"motivo,omitempty"`
	JuzgadoAt    *time.Time `json:"juzgadoAt,omitempty"`
}

func (i *intento) resuelto() bool { return i != nil && i.Resultado != "pendiente" }

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// intentos of a competition indexed by athlete → lift → attempt number (1..3).
type tabla map[uuid.UUID]map[string]*[4]*intento

func (t tabla) get(a uuid.UUID, mov string, n int) *intento {
	if m := t[a]; m != nil {
		if x := m[mov]; x != nil {
			return x[n]
		}
	}
	return nil
}

func cargarIntentos(ctx context.Context, q querier, cid uuid.UUID) (tabla, error) {
	rows, err := q.Query(ctx, `SELECT id, atleta_id, flight_id, movimiento, numero, peso::float8, votos, resultado, corregido_por, motivo, juzgado_at
		FROM intentos WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	t := tabla{}
	for rows.Next() {
		var x intento
		if err := rows.Scan(&x.ID, &x.AtletaID, &x.FlightID, &x.Mov, &x.Numero, &x.Peso, &x.Votos, &x.Resultado, &x.CorregidoPor, &x.Motivo, &x.JuzgadoAt); err != nil {
			return nil, err
		}
		if t[x.AtletaID] == nil {
			t[x.AtletaID] = map[string]*[4]*intento{}
		}
		if t[x.AtletaID][x.Mov] == nil {
			t[x.AtletaID][x.Mov] = &[4]*intento{}
		}
		xx := x
		t[x.AtletaID][x.Mov][x.Numero] = &xx
	}
	return t, rows.Err()
}

// ---- the order on the platform (IPF: round by round, lightest bar first, then lot number) ----

type turno struct {
	Atleta  *atleta
	Numero  int
	Peso    float64 // 0 = not declared yet
	Intento *intento
}

// orden returns the current round of a lift in a flight (4 = the lift is over) and the queue: the athletes of this
// round still to lift, in order, followed by the declared attempts of the next round.
func orden(p *plan, f *flight, t tabla, mov string) (int, []turno) {
	ronda := 4
	sig := map[uuid.UUID]int{}
	for _, x := range f.Atletas {
		n := 1
		for n <= 3 && t.get(x.ID, mov, n).resuelto() {
			n++
		}
		sig[x.ID] = n
		if n < ronda {
			ronda = n
		}
	}
	var esta, prox []turno
	for _, x := range f.Atletas {
		a := p.Atletas[x.ID]
		if a == nil {
			continue
		}
		n := sig[x.ID]
		if n > 3 {
			continue
		}
		it := t.get(x.ID, mov, n)
		tu := turno{Atleta: a, Numero: n, Intento: it}
		if it != nil {
			tu.Peso = it.Peso
		} else if n == 1 && a.Primeros.de(mov) != nil {
			tu.Peso = *a.Primeros.de(mov)
		}
		switch n {
		case ronda:
			esta = append(esta, tu)
		case ronda + 1:
			if it != nil {
				prox = append(prox, tu)
			}
		}
	}
	sortTurnos(esta)
	sortTurnos(prox)
	return ronda, append(esta, prox...)
}

func sortTurnos(l []turno) {
	sort.SliceStable(l, func(i, j int) bool {
		a, b := l[i], l[j]
		if (a.Peso == 0) != (b.Peso == 0) {
			return b.Peso == 0 // undeclared at the end
		}
		if a.Peso != b.Peso {
			return a.Peso < b.Peso
		}
		return a.Atleta.Lote < b.Atleta.Lote
	})
}

// flightCompleto: every athlete of the flight has resolved the 9 attempts.
func flightCompleto(f *flight, t tabla) bool {
	for _, x := range f.Atletas {
		for _, m := range movs {
			for n := 1; n <= 3; n++ {
				if !t.get(x.ID, m, n).resuelto() {
					return false
				}
			}
		}
	}
	return len(f.Atletas) > 0
}

var movs = []string{"sq", "bp", "dl"}

// ---- results ----

// GL points (IPF GL formula, classic powerlifting, 2020 coefficients).
func puntosGL(sexo string, bw, total float64) float64 {
	a, b, c := 1199.72839, 1025.18162, 0.00921
	if sexo == "F" {
		a, b, c = 610.32796, 1045.59282, 0.03048
	}
	d := a - b*math.Exp(-c*bw)
	if d <= 0 {
		return 0
	}
	return math.Round(total*100/d*100) / 100
}

// Celda is one attempt of a results row (public).
type Celda struct {
	Peso      float64 `json:"peso"`
	Resultado string  `json:"resultado" enum:"pendiente,valido,nulo,renuncia"`
	Votos     string  `json:"votos,omitempty"`
}

// Fila is a row of a category ranking. In public views athletes without a public profile (minors without the
// guardian's authorisation, hidden profiles) appear as «Atleta» with no club, slug or body weight.
type Fila struct {
	Puesto       int                 `json:"puesto,omitempty" doc:"0 = sin total o sin terminar"`
	AtletaID     uuid.UUID           `json:"atletaId,omitzero"`
	Nombre       string              `json:"nombre"`
	Slug         string              `json:"slug,omitempty"`
	Club         string              `json:"club,omitempty"`
	Division     string              `json:"division,omitempty"`
	Iniciales    string              `json:"iniciales"`
	PesoCorporal *float64            `json:"pesoCorporal,omitempty"`
	SQ           *float64            `json:"sq,omitempty"`
	BP           *float64            `json:"bp,omitempty"`
	DL           *float64            `json:"dl,omitempty"`
	Total        *float64            `json:"total,omitempty"`
	GL           *float64            `json:"gl,omitempty"`
	Intentos     map[string][3]Celda `json:"intentos"`
	Medalla      string              `json:"medalla,omitempty" enum:"oro,plata,bronce"`
	Records      []string            `json:"records,omitempty" doc:"«Récord CV · Sentadilla»…"`
	SinTotal     bool                `json:"sinTotal,omitempty" doc:"Algún movimiento sin intento válido"`
	Completo     bool                `json:"completo"`
	lote         int
}

// Categoria is the ranking of a weight class.
type Categoria struct {
	Clave     string `json:"clave" example:"F-63"`
	Sexo      string `json:"sexo"`
	Categoria string `json:"categoria" example:"-63"`
	Titulo    string `json:"titulo" example:"Femenino −63 kg"`
	Corto     string `json:"corto" example:"F −63"`
	Atletas   int    `json:"atletas"`
	Completos int    `json:"completos"`
	Filas     []Fila `json:"filas"`
}

type record struct {
	Ambito, Sexo, Categoria, Mov string
	Peso                         float64
}

func cargarRecords(ctx context.Context, q querier, cid uuid.UUID) ([]record, error) {
	rows, err := q.Query(ctx, `SELECT ambito, sexo, categoria, movimiento, peso::float8 FROM records WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []record
	for rows.Next() {
		var r record
		if err := rows.Scan(&r.Ambito, &r.Sexo, &r.Categoria, &r.Mov, &r.Peso); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func titulo(sexo, cat string) (string, string) {
	s := map[string]string{"F": "Femenino", "M": "Masculino"}[sexo]
	c := strings.Replace(cat, "-", "−", 1)
	return s + " " + c + " kg", sexo + " " + c
}

func iniciales(n string) string {
	f := strings.Fields(n)
	out := ""
	for _, w := range f {
		if len(out) == 2 {
			break
		}
		r := []rune(w)
		out += strings.ToUpper(string(r[0]))
	}
	return out
}

// pesoCat orders categories: women first, then by the class limit («+84» after «-84»).
func pesoCat(c string) float64 {
	v, _ := strconv.ParseFloat(strings.TrimLeft(c, "+-"), 64)
	if strings.HasPrefix(c, "+") {
		v += 0.5
	}
	return v
}

// clasificar computes a category ranking from the attempts (publico: the public view of the rows).
func clasificar(p *plan, t tabla, recs []record, k string, publico bool) Categoria {
	ats := p.porCat[k]
	var c Categoria
	if len(ats) == 0 {
		return c
	}
	c.Clave, c.Sexo, c.Categoria, c.Atletas = k, ats[0].Sexo, ats[0].Categoria, len(ats)
	c.Titulo, c.Corto = titulo(c.Sexo, c.Categoria)
	for _, a := range ats {
		f := Fila{AtletaID: a.ID, Nombre: a.Nombre, Slug: a.Slug, Club: a.Club, Division: a.DivisionNombre, Iniciales: iniciales(a.Nombre),
			PesoCorporal: a.PesoCorporal, Intentos: map[string][3]Celda{}, Completo: true, lote: a.Lote}
		var total float64
		todos := true
		for _, m := range movs {
			var cs [3]Celda
			var mejor *float64
			for n := 1; n <= 3; n++ {
				it := t.get(a.ID, m, n)
				if it == nil {
					cs[n-1] = Celda{Resultado: "pendiente"}
					f.Completo = false
					continue
				}
				cs[n-1] = Celda{Peso: it.Peso, Resultado: it.Resultado, Votos: it.Votos}
				if it.Resultado == "pendiente" {
					f.Completo = false
				}
				if it.Resultado == "valido" && (mejor == nil || it.Peso > *mejor) {
					v := it.Peso
					mejor = &v
				}
			}
			f.Intentos[m] = cs
			switch m {
			case "sq":
				f.SQ = mejor
			case "bp":
				f.BP = mejor
			default:
				f.DL = mejor
			}
			if mejor == nil {
				todos = false
				// bombed out: no valid attempt and none left
				if cs[0].Resultado != "pendiente" && cs[1].Resultado != "pendiente" && cs[2].Resultado != "pendiente" && t.get(a.ID, m, 3) != nil {
					f.SinTotal = true
				}
			} else {
				total += *mejor
			}
			for _, r := range recs {
				if r.Sexo == a.Sexo && r.Categoria == a.Categoria && r.Mov == m && mejor != nil && *mejor > r.Peso {
					f.Records = append(f.Records, "Récord "+r.Ambito+" · "+movNombre[m])
				}
			}
		}
		if todos {
			f.Total = &total
			if a.PesoCorporal != nil {
				g := puntosGL(a.Sexo, *a.PesoCorporal, total)
				f.GL = &g
			}
			for _, r := range recs {
				if r.Sexo == a.Sexo && r.Categoria == a.Categoria && r.Mov == "total" && total > r.Peso {
					f.Records = append(f.Records, "Récord "+r.Ambito+" · Total")
				}
			}
		}
		if f.Completo {
			c.Completos++
		}
		if publico && !a.Publico {
			f.Nombre, f.Slug, f.Club, f.Iniciales, f.PesoCorporal = "Atleta", "", "", "·", nil
		}
		c.Filas = append(c.Filas, f)
	}
	sort.SliceStable(c.Filas, func(i, j int) bool {
		a, b := c.Filas[i], c.Filas[j]
		if (a.Total == nil) != (b.Total == nil) {
			return a.Total != nil
		}
		if a.Total != nil && *a.Total != *b.Total {
			return *a.Total > *b.Total
		}
		// IPF tie-break: the lighter athlete first, then the lot drawn
		ab, bb := bwOr(p.Atletas[a.AtletaID]), bwOr(p.Atletas[b.AtletaID])
		if ab != bb {
			return ab < bb
		}
		return a.lote < b.lote
	})
	if publico {
		for i := range c.Filas {
			c.Filas[i].AtletaID = uuid.Nil
		}
	}
	for i := range c.Filas {
		if c.Filas[i].Total == nil {
			break
		}
		c.Filas[i].Puesto = i + 1
		if i < 3 {
			c.Filas[i].Medalla = [...]string{"oro", "plata", "bronce"}[i]
		}
	}
	return c
}

func bwOr(a *atleta) float64 {
	if a == nil || a.PesoCorporal == nil {
		return 999
	}
	return *a.PesoCorporal
}

// categorias lists the keys of the categories with athletes in the published schedule, in display order.
func (p *plan) categorias() []string {
	var ks []string
	for k := range p.porCat {
		ks = append(ks, k)
	}
	sort.Slice(ks, func(i, j int) bool {
		if ks[i][0] != ks[j][0] {
			return ks[i][0] == 'F'
		}
		return pesoCat(ks[i][1:]) < pesoCat(ks[j][1:])
	})
	return ks
}

// absoluta: best lifters by GL points of each sex (rows of complete totals only).
func absoluta(cats []Categoria, sexo string, n int) []Fila {
	var out []Fila
	for _, c := range cats {
		if c.Sexo != sexo {
			continue
		}
		for _, f := range c.Filas {
			if f.GL != nil && f.Total != nil {
				out = append(out, f)
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return *out[i].GL > *out[j].GL })
	if len(out) > n {
		out = out[:n]
	}
	for i := range out {
		out[i].Puesto, out[i].Medalla = i+1, ""
	}
	return out
}
