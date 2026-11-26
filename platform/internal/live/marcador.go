// marcador.go: internal scoreboard for the games service (contract §8). It reuses the desk data (datos.go) and
// the results computation (resultados.go): the public name follows the /en-directo privacy rule, and the best lift,
// total, IPF GL, places and bomb-outs come from the same code the public views use.
package live

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// MarcadorIntento is one attempt of the scoreboard.
type MarcadorIntento struct {
	N         int        `json:"n"`
	Peso      float64    `json:"peso"`
	Resultado string     `json:"resultado" enum:"pendiente,valido,nulo,renuncia"`
	JuzgadoAt *time.Time `json:"juzgadoAt,omitempty"`
}

// MarcadorAtleta is one athlete of the scoreboard: identity, attempts, best lifts, total, GL and places.
type MarcadorAtleta struct {
	AtletaID         uuid.UUID                    `json:"atletaId"`
	NombrePublico    string                       `json:"nombrePublico" doc:"Nombre si el perfil es público; si no «Atleta · −83 kg · lote 12»"`
	FotoURL          string                       `json:"fotoUrl,omitempty" doc:"Foto pública: solo con perfil público e imagen consentida"`
	Sexo             string                       `json:"sexo"`
	Categoria        string                       `json:"categoria"`
	SesionID         uuid.UUID                    `json:"sesionId"`
	SesionEnCurso    bool                         `json:"sesionEnCurso"`
	Intentos         map[string][]MarcadorIntento `json:"intentos"`
	Mejor            map[string]*float64          `json:"mejor"`
	Total            *float64                     `json:"total"`
	GL               *float64                     `json:"gl"`
	PuestoCategoria  int                          `json:"puestoCategoria" doc:"0 = sin total"`
	PuestoGL         int                          `json:"puestoGL" doc:"Puesto por puntos GL dentro de su sexo (0 = sin total)"`
	PuestoMovimiento map[string]int               `json:"puestoMovimiento" doc:"Puesto por mejor levantamiento dentro de su sexo (0 = sin intento válido)"`
	Blanqueo         map[string]bool              `json:"blanqueo" doc:"3 nulos en el movimiento"`
	Terminado        bool                         `json:"terminado" doc:"Los 9 intentos resueltos"`
}

// Marcador is the response of the internal scoreboard (GET /internal/competiciones/{cid}/marcador).
type Marcador struct {
	Fase                 string           `json:"fase" enum:"antes,en_directo,finalizado"`
	SesionEnCurso        string           `json:"sesionEnCurso" doc:"Id de la sesión que está en la tarima («» = ninguno)"`
	Atletas              []MarcadorAtleta `json:"atletas"`
	CategoriasPublicadas []string         `json:"categoriasPublicadas"`
	Degradado            bool             `json:"degradado,omitempty" doc:"true = plan viejo de respaldo (schedule/athletes caídos): solo añadir opciones, nunca quitar"`
}

// fotoPublica is the photo only for a public profile (athletes already sends it only with image consent).
func fotoPublica(a *atleta) string {
	if !a.Publico {
		return ""
	}
	return a.FotoURL
}

// nombrePublico applies the privacy rule of /en-directo: the name only with a public profile, otherwise
// «Atleta · −83 kg · lote 12».
func nombrePublico(a *atleta) string {
	if a.Publico {
		return a.Nombre
	}
	if a.Lote == 0 {
		return "Atleta · " + sinMenos(a.Categoria) + " kg" // not in a published sesion yet: no lot
	}
	return "Atleta · " + sinMenos(a.Categoria) + " kg · lote " + itoa(a.Lote)
}

// sinMenos formats a weight class the way the public views do: −83 (typographic minus).
func sinMenos(cat string) string {
	s := ""
	for i, c := range cat {
		if i == 0 && c == '-' {
			s += "−"
			continue
		}
		s += string(c)
	}
	return s
}

// marcadorDelDia builds the scoreboard of one day. It computes the places on a sub-plan with only that day's
// sesiones, so two jornadas of the same competition (AEP-2, AEP-3) rank independently. prueba ("" = off) also
// lists the confirmed athletes that are in no published sesion of any day yet, so the games can offer them before
// the schedule places them: "*" every one of them, "aep2"/"aep3" the ones of that competition and those without
// one. They carry no sesion (uuid.Nil) and are never ranked here.
func (s *Svc) marcadorDelDia(ctx context.Context, cid uuid.UUID, dia, prueba string) (*Marcador, error) {
	e, err := s.estadoLeer(ctx, cid)
	if err != nil {
		return nil, err
	}
	p, err := s.cargarPlan(ctx, cid)
	if err != nil {
		return nil, err
	}
	t, err := cargarIntentos(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	recs, err := cargarRecords(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	pubs, err := cargarPublicados(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	enSesion := map[uuid.UUID]bool{} // athletes placed in a published sesion of any day
	for i := range p.Sesiones {
		for _, x := range p.Sesiones[i].Atletas {
			enSesion[x.ID] = true
		}
	}
	sub := &plan{Version: p.Version, Atletas: p.Atletas, Degradado: p.Degradado}
	for i := range p.Sesiones {
		if dia == "" || p.Sesiones[i].Dia == dia {
			sub.Sesiones = append(sub.Sesiones, p.Sesiones[i])
		}
	}
	sub.index()

	m := &Marcador{Fase: e.Fase, Degradado: sub.Degradado, Atletas: []MarcadorAtleta{}, CategoriasPublicadas: []string{}}
	if e.SesionID != nil {
		m.SesionEnCurso = e.SesionID.String()
	}
	// category rankings of the day (admin view: real ids), plus the per-sex tables of GL and lifts.
	cats := map[string]Categoria{}
	var filasPorSexo = map[string][]Fila{}
	for _, k := range sub.categorias() {
		c := clasificar(sub, t, recs, k, false)
		cats[k] = c
		filasPorSexo[k[:1]] = append(filasPorSexo[k[:1]], c.Filas...)
	}
	glSexo := map[string][]Fila{}
	for sx, fs := range filasPorSexo {
		for _, f := range fs {
			if f.GL != nil && f.Total != nil {
				glSexo[sx] = append(glSexo[sx], f)
			}
		}
		sort.SliceStable(glSexo[sx], func(i, j int) bool {
			a, b := glSexo[sx][i], glSexo[sx][j]
			if *a.GL != *b.GL {
				return *a.GL > *b.GL
			}
			ab, bb := bwOr(sub.Atletas[a.AtletaID]), bwOr(sub.Atletas[b.AtletaID])
			if ab != bb {
				return ab < bb
			}
			return a.lote < b.lote
		})
	}
	movSexo := map[string]map[string][]Fila{} // sexo → movimiento → filas con mejor intento
	for sx, fs := range filasPorSexo {
		movSexo[sx] = map[string][]Fila{}
		for _, mv := range movs {
			for _, f := range fs {
				if mejorFila(&f, mv) != nil {
					movSexo[sx][mv] = append(movSexo[sx][mv], f)
				}
			}
			l := movSexo[sx][mv]
			sort.SliceStable(l, func(i, j int) bool {
				a, b := *mejorFila(&l[i], mv), *mejorFila(&l[j], mv)
				if a != b {
					return a > b
				}
				ab, bb := bwOr(sub.Atletas[l[i].AtletaID]), bwOr(sub.Atletas[l[j].AtletaID])
				if ab != bb {
					return ab < bb
				}
				return l[i].lote < l[j].lote
			})
			movSexo[sx][mv] = l
		}
	}
	puestoGL := map[uuid.UUID]int{}
	for _, fs := range glSexo {
		for i, f := range fs {
			puestoGL[f.AtletaID] = i + 1
		}
	}
	puestoMov := map[uuid.UUID]map[string]int{}
	for _, porMov := range movSexo {
		for mv, fs := range porMov {
			for i, f := range fs {
				if puestoMov[f.AtletaID] == nil {
					puestoMov[f.AtletaID] = map[string]int{}
				}
				puestoMov[f.AtletaID][mv] = i + 1
			}
		}
	}
	publicadas := map[string]bool{}
	for k := range cats {
		if _, ok := pubs[k]; ok {
			publicadas[k] = true
			m.CategoriasPublicadas = append(m.CategoriasPublicadas, k)
		}
	}
	sort.Slice(m.CategoriasPublicadas, func(i, j int) bool {
		a, b := m.CategoriasPublicadas[i], m.CategoriasPublicadas[j]
		if a[0] != b[0] {
			return a[0] == 'F'
		}
		return pesoCat(a[1:]) < pesoCat(b[1:])
	})

	anadir := func(a *atleta, sesionID uuid.UUID) {
		k := clave(a.Sexo, a.Categoria)
		ma := MarcadorAtleta{
			AtletaID: a.ID, NombrePublico: nombrePublico(a), FotoURL: fotoPublica(a), Sexo: a.Sexo, Categoria: a.Categoria,
			SesionID: sesionID, SesionEnCurso: sesionID != uuid.Nil && e.SesionID != nil && *e.SesionID == sesionID,
			Intentos: map[string][]MarcadorIntento{}, Mejor: map[string]*float64{},
			PuestoMovimiento: map[string]int{}, Blanqueo: map[string]bool{},
		}
		if c, ok := cats[k]; ok {
			for j := range c.Filas {
				if c.Filas[j].AtletaID == a.ID {
					ma.Mejor = map[string]*float64{"sq": c.Filas[j].SQ, "bp": c.Filas[j].BP, "dl": c.Filas[j].DL}
					ma.Total, ma.GL, ma.PuestoCategoria = c.Filas[j].Total, c.Filas[j].GL, c.Filas[j].Puesto
				}
			}
		}
		terminado := true
		for _, mv := range movs {
			for n := 1; n <= 3; n++ {
				it := t.get(a.ID, mv, n)
				if it == nil {
					terminado = false
					continue
				}
				ma.Intentos[mv] = append(ma.Intentos[mv], MarcadorIntento{N: n, Peso: it.Peso, Resultado: it.Resultado, JuzgadoAt: it.JuzgadoAt})
				if !it.resuelto() {
					terminado = false
				}
			}
			ma.Blanqueo[mv] = blanqueoDe(t, a.ID, mv)
			if px := puestoMov[a.ID]; px != nil {
				ma.PuestoMovimiento[mv] = px[mv]
			}
		}
		ma.Terminado = terminado && len(ma.Intentos) > 0
		ma.PuestoGL = puestoGL[a.ID]
		m.Atletas = append(m.Atletas, ma)
	}
	for i := range sub.Sesiones {
		f := &sub.Sesiones[i]
		for _, x := range f.Atletas {
			if a := sub.Atletas[x.ID]; a != nil {
				anadir(a, f.ID)
			}
		}
	}
	if prueba != "" {
		var sin []*atleta
		for _, a := range p.Atletas {
			if !enSesion[a.ID] && (a.Sexo == "F" || a.Sexo == "M") && a.Categoria != "" && (prueba == "*" || a.Prueba == "" || a.Prueba == prueba) {
				sin = append(sin, a)
			}
		}
		sort.Slice(sin, func(i, j int) bool {
			return sin[i].Nombre < sin[j].Nombre || (sin[i].Nombre == sin[j].Nombre && sin[i].ID.String() < sin[j].ID.String())
		})
		for _, a := range sin {
			anadir(a, uuid.Nil)
		}
	}
	return m, nil
}

// mejorFila returns the best valid lift of a row for one movement.
func mejorFila(f *Fila, mov string) *float64 {
	switch mov {
	case "sq":
		return f.SQ
	case "bp":
		return f.BP
	}
	return f.DL
}

// blanqueoDe reports three null attempts in one movement (contract §6.3; a bomb-out by renunciation is not).
func blanqueoDe(t tabla, atleta uuid.UUID, mov string) bool {
	for n := 1; n <= 3; n++ {
		it := t.get(atleta, mov, n)
		if it == nil || it.Resultado != "nulo" {
			return false
		}
	}
	return true
}

// registerMarcador exposes the internal scoreboard (service token, only for juegos).
func (s *Svc) registerMarcador() {
	type in struct {
		CID uuid.UUID `path:"cid"`
		Dia string    `query:"dia" minLength:"0" maxLength:"10" doc:"YYYY-MM-DD (Europe/Madrid); vacío = todos los días"`
		// the games (juegos) list every confirmed athlete, also the ones the schedule has not placed yet
		Prueba string `query:"prueba" pattern:"^(\\*|aep2|aep3)?$" required:"false" doc:"Añade los atletas confirmados sin sesión publicada: * todos, aep2/aep3 los de esa competición y los que no tienen; vacío = no"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-marcador", Method: http.MethodGet,
		Path: "/internal/competiciones/{cid}/marcador", Summary: "Marcador por atleta y día (solo juegos)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, i *in) (*struct{ Body *Marcador }, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			m, err := s.marcadorDelDia(ctx, i.CID, i.Dia, i.Prueba)
			return &struct{ Body *Marcador }{m}, err
		})
	// juegos calls it on every athletes.* event: the plan cache (15 s) is dropped so the next marcador reads the
	// athletes again at once (an approved, edited or deleted athlete reaches the games in about a second).
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-plan-refrescar", Method: http.MethodPost,
		Path: "/internal/competiciones/{cid}/plan/refrescar", Summary: "Olvidar el plan cacheado (solo juegos)", Tags: []string{"Interno"}, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, i *cidIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			s.cache.Del(ctx, "plan:"+i.CID.String())
			return nil, nil
		})
}
