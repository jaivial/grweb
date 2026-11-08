// marcador.go: internal scoreboard for the games service (contract §8). It reuses the desk data (datos.go) and
// the results computation (resultados.go): the public name follows the /en-directo privacy rule, and the best lift,
// total, IPF GL, places and bomb-outs come from the same code the public views use.
package live

import (
	"context"
	"net/http"
	"sort"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// MarcadorIntento is one attempt of the scoreboard.
type MarcadorIntento struct {
	N         int     `json:"n"`
	Peso      float64 `json:"peso"`
	Resultado string  `json:"resultado" enum:"pendiente,valido,nulo,renuncia"`
}

// MarcadorAtleta is one athlete of the scoreboard: identity, attempts, best lifts, total, GL and places.
type MarcadorAtleta struct {
	AtletaID         uuid.UUID                    `json:"atletaId"`
	NombrePublico    string                       `json:"nombrePublico" doc:"Nombre si el perfil es público; si no «Atleta · −83 kg · lote 12»"`
	Sexo             string                       `json:"sexo"`
	Categoria        string                       `json:"categoria"`
	FlightID         uuid.UUID                    `json:"flightId"`
	FlightEnCurso    bool                         `json:"flightEnCurso"`
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
	FlightEnCurso        string           `json:"flightEnCurso" doc:"Id del flight que está en la plataforma («» = ninguno)"`
	Atletas              []MarcadorAtleta `json:"atletas"`
	CategoriasPublicadas []string         `json:"categoriasPublicadas"`
}

// nombrePublico applies the privacy rule of /en-directo: the name only with a public profile, otherwise
// «Atleta · −83 kg · lote 12».
func nombrePublico(a *atleta) string {
	if a.Publico {
		return a.Nombre
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
// flights, so two jornadas of the same competition (AEP-2, AEP-3) rank independently.
func (s *Svc) marcadorDelDia(ctx context.Context, cid uuid.UUID, dia string) (*Marcador, error) {
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
	sub := &plan{Version: p.Version, Atletas: p.Atletas}
	for i := range p.Flights {
		if dia == "" || p.Flights[i].Dia == dia {
			sub.Flights = append(sub.Flights, p.Flights[i])
		}
	}
	sub.index()

	m := &Marcador{Fase: e.Fase, Atletas: []MarcadorAtleta{}, CategoriasPublicadas: []string{}}
	if e.FlightID != nil {
		m.FlightEnCurso = e.FlightID.String()
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

	for i := range sub.Flights {
		f := &sub.Flights[i]
		for _, x := range f.Atletas {
			a := sub.Atletas[x.ID]
			if a == nil {
				continue
			}
			k := clave(a.Sexo, a.Categoria)
			ma := MarcadorAtleta{
				AtletaID: a.ID, NombrePublico: nombrePublico(a), Sexo: a.Sexo, Categoria: a.Categoria,
				FlightID: f.ID, FlightEnCurso: e.FlightID != nil && *e.FlightID == f.ID,
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
					ma.Intentos[mv] = append(ma.Intentos[mv], MarcadorIntento{N: n, Peso: it.Peso, Resultado: it.Resultado})
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
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-marcador", Method: http.MethodGet,
		Path: "/internal/competiciones/{cid}/marcador", Summary: "Marcador por atleta y día (solo juegos)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, i *in) (*struct{ Body *Marcador }, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			m, err := s.marcadorDelDia(ctx, i.CID, i.Dia)
			return &struct{ Body *Marcador }{m}, err
		})
}
