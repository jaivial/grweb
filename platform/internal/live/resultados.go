package live

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagResultados = []string{"Resultados"}

// Publicada is the published state of a category.
type Publicada struct {
	Version int       `json:"version"`
	At      time.Time `json:"at"`
	Por     string    `json:"por"`
}

// CategoriaResumen is a tab of the results page.
type CategoriaResumen struct {
	Clave     string     `json:"clave"`
	Titulo    string     `json:"titulo"`
	Corto     string     `json:"corto"`
	Atletas   int        `json:"atletas"`
	Completos int        `json:"completos"`
	Publicado *Publicada `json:"publicado,omitempty"`
	Cambios   bool       `json:"cambios" doc:"Hay intentos corregidos o nuevos desde la publicación"`
}

type publicadoRow struct {
	datos Categoria
	pub   Publicada
}

func cargarPublicados(ctx context.Context, q querier, cid uuid.UUID) (map[string]publicadoRow, error) {
	rows, err := q.Query(ctx, `SELECT categoria, datos, version, publicado_at, publicado_por FROM resultados WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]publicadoRow{}
	for rows.Next() {
		var k string
		var r publicadoRow
		if err := rows.Scan(&k, &r.datos, &r.pub.Version, &r.pub.At, &r.pub.Por); err != nil {
			return nil, err
		}
		out[k] = r
	}
	return out, rows.Err()
}

// mismaClasificacion compares a published category with the current computation (public view).
func mismaClasificacion(a, b Categoria) bool {
	if len(a.Filas) != len(b.Filas) {
		return false
	}
	for i := range a.Filas {
		x, y := a.Filas[i], b.Filas[i]
		if x.Nombre != y.Nombre || x.Puesto != y.Puesto || !eqF(x.Total, y.Total) || !eqF(x.SQ, y.SQ) || !eqF(x.BP, y.BP) || !eqF(x.DL, y.DL) {
			return false
		}
		for _, m := range movs {
			if x.Intentos[m] != y.Intentos[m] {
				return false
			}
		}
	}
	return true
}

func eqF(a, b *float64) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// ResultadosAdmin is the results page of the backoffice.
type ResultadosAdmin struct {
	Categorias   []CategoriaResumen `json:"categorias"`
	Categoria    *Categoria         `json:"categoria,omitempty"`
	Absoluta     map[string][]Fila  `json:"absoluta" doc:"Mejores por puntos GL (F, M)"`
	PublicarAuto bool               `json:"publicarAuto"`
	Flights      int                `json:"flights"`
	Cerrados     int                `json:"cerrados"`
}

// publicar freezes the public ranking of some categories and tells athletes (followers' notices on the first
// publication of each category).
func (s *Svc) publicar(ctx context.Context, cid uuid.UUID, p *plan, t tabla, claves []string, avisar bool, por string) ([]string, error) {
	recs, err := cargarRecords(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	type aviso struct {
		Titulo string        `json:"titulo"`
		Filas  []avisoAtleta `json:"filas"`
	}
	var avisos []aviso
	var hechas []string
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		pubs, err := cargarPublicados(ctx, tx, cid)
		if err != nil {
			return err
		}
		for _, k := range claves {
			pub := clasificar(p, t, recs, k, true)
			if pub.Clave == "" {
				return problem.Unprocessable("CATEGORIA_NO_VALIDA", "La categoría «"+k+"» no tiene atletas en los horarios publicados.")
			}
			if old, ok := pubs[k]; ok && mismaClasificacion(old.datos, pub) {
				continue
			}
			var ver int
			if err := tx.QueryRow(ctx, `INSERT INTO resultados (competition_id, categoria, datos, publicado_por) VALUES ($1,$2,$3,$4)
				ON CONFLICT (competition_id, categoria) DO UPDATE SET datos = EXCLUDED.datos, version = resultados.version + 1, publicado_por = EXCLUDED.publicado_por, publicado_at = now()
				RETURNING version`, cid, k, pub, por).Scan(&ver); err != nil {
				return err
			}
			hechas = append(hechas, k)
			if ver == 1 && avisar {
				adm := clasificar(p, t, recs, k, false)
				av := aviso{Titulo: adm.Titulo}
				for _, f := range adm.Filas {
					av.Filas = append(av.Filas, avisoAtleta{AtletaID: f.AtletaID, Puesto: f.Puesto, Total: f.Total, SinTotal: f.SinTotal})
				}
				avisos = append(avisos, av)
			}
		}
		if len(hechas) == 0 {
			return nil
		}
		titulos := []string{}
		for _, k := range hechas {
			tt, _ := titulo(k[:1], k[1:])
			titulos = append(titulos, tt)
		}
		if err := evento(ctx, tx, cid, "resultados.publicados", map[string]any{"categorias": hechas}, events.Subject(strings.Join(hechas, ", "))); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "resultados.publicacion", map[string]any{"categorias": titulos, "por": por},
			events.Competition(cid.String()), events.ForPermission("resultados.publicar"), events.Subject(strings.Join(hechas, ", "))))
	})
	if err != nil {
		return nil, err
	}
	s.bump(ctx, cid)
	// Notices are best effort after the commit (athletes dedupes per athlete, so a retry never emails twice).
	for _, av := range avisos {
		if err := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/resultados", av, nil); err != nil {
			s.a.Log.Warn("avisos de resultados", "categoria", av.Titulo, "err", err)
		}
	}
	return hechas, nil
}

type avisoAtleta struct {
	AtletaID uuid.UUID `json:"atletaId"`
	Puesto   int       `json:"puesto"`
	Total    *float64  `json:"total,omitempty"`
	SinTotal bool      `json:"sinTotal,omitempty"`
}

// publicarAuto: «Publicación programada al cerrar el flight». When every athlete of a category has finished, it
// is published once (corrections after that are published by hand from «Resultados»).
func (s *Svc) publicarAuto(ctx context.Context, cid uuid.UUID, p *plan, t tabla, e Estado) {
	if !e.PublicarAuto {
		return
	}
	pubs, err := cargarPublicados(ctx, s.a.DB, cid)
	if err != nil {
		return
	}
	var claves []string
	for _, k := range p.categorias() {
		if _, ok := pubs[k]; ok {
			continue
		}
		completa := true
		for _, a := range p.porCat[k] {
			for _, m := range movs {
				for n := 1; n <= 3; n++ {
					if !t.get(a.ID, m, n).resuelto() {
						completa = false
					}
				}
			}
		}
		if completa {
			claves = append(claves, k)
		}
	}
	if len(claves) == 0 {
		return
	}
	if _, err := s.publicar(ctx, cid, p, t, claves, true, "Publicación automática"); err != nil {
		s.a.Log.Warn("publicación automática", "err", err)
	}
}

func (s *Svc) resultadosAdmin(ctx context.Context, cid uuid.UUID, sel string) (*ResultadosAdmin, error) {
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
	e, err := s.estadoLeer(ctx, cid)
	if err != nil {
		return nil, err
	}
	o := &ResultadosAdmin{Categorias: []CategoriaResumen{}, Absoluta: map[string][]Fila{"F": {}, "M": {}}, PublicarAuto: e.PublicarAuto, Flights: len(p.Flights)}
	for i := range p.Flights {
		if flightCompleto(&p.Flights[i], t) {
			o.Cerrados++
		}
	}
	var todas []Categoria
	for _, k := range p.categorias() {
		c := clasificar(p, t, recs, k, false)
		todas = append(todas, c)
		r := CategoriaResumen{Clave: k, Titulo: c.Titulo, Corto: c.Corto, Atletas: c.Atletas, Completos: c.Completos}
		if pb, ok := pubs[k]; ok {
			pp := pb.pub
			r.Publicado = &pp
			r.Cambios = !mismaClasificacion(pb.datos, clasificar(p, t, recs, k, true))
		}
		o.Categorias = append(o.Categorias, r)
		if k == sel || (sel == "" && o.Categoria == nil) {
			cc := c
			o.Categoria = &cc
		}
	}
	o.Absoluta["F"], o.Absoluta["M"] = absoluta(todas, "F", 10), absoluta(todas, "M", 10)
	return o, nil
}

// ResultadosPublicos are the published results of a competition (/resultados/{año}).
type ResultadosPublicos struct {
	Competicion struct {
		Slug        string `json:"slug"`
		Nombre      string `json:"nombre"`
		FechaInicio string `json:"fechaInicio,omitempty"`
		FechaFin    string `json:"fechaFin,omitempty"`
		Sede        string `json:"sede"`
		Estado      string `json:"estado"`
	} `json:"competicion"`
	Publicado   bool             `json:"publicado"`
	Ejemplo     bool             `json:"ejemplo" doc:"Datos de ejemplo (sin acta real todavía)"`
	Actualizado *time.Time       `json:"actualizado,omitempty"`
	Categorias  []Categoria      `json:"categorias"`
	Mejores     map[string]*Fila `json:"mejores" doc:"Mejor levantador/a por puntos GL (F, M)"`
}

func (s *Svc) resultadosPublicos(ctx context.Context, slug string) (*ResultadosPublicos, error) {
	c, err := s.comps.Public(ctx, slug)
	if err != nil {
		return nil, err
	}
	key := "res:" + c.ID.String() + ":" + s.version(ctx, c.ID)
	var o ResultadosPublicos
	if s.cache.Get(ctx, key, &o) {
		return &o, nil
	}
	pubs, err := cargarPublicados(ctx, s.a.DB, c.ID)
	if err != nil {
		return nil, err
	}
	o.Competicion.Slug, o.Competicion.Nombre, o.Competicion.FechaInicio, o.Competicion.FechaFin, o.Competicion.Estado = c.Slug, c.Nombre, c.FechaInicio, c.FechaFin, c.Estado
	o.Competicion.Sede = strings.Trim(c.Sede.Nombre+" · "+c.Sede.Ciudad, " ·")
	o.Categorias, o.Mejores = []Categoria{}, map[string]*Fila{}
	for _, r := range pubs {
		o.Categorias = append(o.Categorias, r.datos)
		if r.pub.Por == "Datos de ejemplo" {
			o.Ejemplo = true
		}
		if o.Actualizado == nil || r.pub.At.After(*o.Actualizado) {
			at := r.pub.At
			o.Actualizado = &at
		}
	}
	ordenarCategorias(o.Categorias)
	o.Publicado = len(o.Categorias) > 0
	for _, sx := range []string{"F", "M"} {
		if l := absoluta(o.Categorias, sx, 1); len(l) > 0 {
			f := l[0]
			o.Mejores[sx] = &f
		}
	}
	s.cache.Set(ctx, key, o, time.Minute)
	return &o, nil
}

func ordenarCategorias(cs []Categoria) {
	for i := 1; i < len(cs); i++ {
		for j := i; j > 0 && menorCat(cs[j], cs[j-1]); j-- {
			cs[j], cs[j-1] = cs[j-1], cs[j]
		}
	}
}

func menorCat(a, b Categoria) bool {
	if a.Sexo != b.Sexo {
		return a.Sexo == "F"
	}
	return pesoCat(a.Categoria) < pesoCat(b.Categoria)
}

func (s *Svc) registerResultados() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/resultados"
	leer := func(ctx context.Context, cid uuid.UUID) error {
		_, err := requireAny(ctx, cid, "Tu rol no tiene acceso a los resultados.", "resultados.publicar", "directo.operar")
		return err
	}
	publicarPerm := func(ctx context.Context, cid uuid.UUID) error {
		_, err := requireAny(ctx, cid, "Tu rol no puede publicar resultados (permiso «resultados.publicar»).", "resultados.publicar")
		return err
	}

	type getIn struct {
		CID       uuid.UUID `path:"cid"`
		Categoria string    `query:"categoria" maxLength:"10"`
	}
	huma.Register(api, huma.Operation{OperationID: "resultados-admin", Method: http.MethodGet, Path: base, Summary: "Clasificaciones (calculadas al momento) y estado de publicación", Tags: tagResultados, Security: bearer},
		func(ctx context.Context, in *getIn) (*struct{ Body *ResultadosAdmin }, error) {
			if err := leer(ctx, in.CID); err != nil {
				return nil, err
			}
			o, err := s.resultadosAdmin(ctx, in.CID, in.Categoria)
			return &struct{ Body *ResultadosAdmin }{o}, err
		})

	type pubIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Categorias []string `json:"categorias" minItems:"1" maxItems:"40"`
			Avisar     bool     `json:"avisar" doc:"Avisar a los atletas y a sus seguidores (solo la primera vez de cada categoría)"`
		}
	}
	type pubOut struct {
		Body struct {
			Publicadas []string `json:"publicadas" doc:"Las que han cambiado (las demás ya estaban publicadas igual)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "resultados-publicar", Method: http.MethodPost, Path: base + "/publicar", Summary: "Publicar categorías en /resultados", Tags: tagResultados, Security: bearer},
		func(ctx context.Context, in *pubIn) (*pubOut, error) {
			if err := publicarPerm(ctx, in.CID); err != nil {
				return nil, err
			}
			p, err := s.cargarPlan(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			t, err := cargarIntentos(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			o := &pubOut{}
			o.Body.Publicadas, err = s.publicar(ctx, in.CID, p, t, in.Body.Categorias, in.Body.Avisar, actor(ctx))
			if o.Body.Publicadas == nil {
				o.Body.Publicadas = []string{}
			}
			return o, err
		})

	type retIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Categoria string `json:"categoria" maxLength:"10"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "resultados-retirar", Method: http.MethodPost, Path: base + "/retirar", Summary: "Retirar una categoría de /resultados", Tags: tagResultados, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *retIn) (*struct{}, error) {
			if err := publicarPerm(ctx, in.CID); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `DELETE FROM resultados WHERE competition_id = $1 AND categoria = $2`, in.CID, in.Body.Categoria)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					return problem.NotFound("Esa categoría no está publicada.")
				}
				if err := evento(ctx, tx, in.CID, "resultados.retirados", map[string]any{"categorias": []string{in.Body.Categoria}}); err != nil {
					return err
				}
				tt, _ := titulo(in.Body.Categoria[:1], in.Body.Categoria[1:])
				return events.Enqueue(ctx, tx, events.New(ctx, "resultados.retirada", map[string]any{"categoria": tt, "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("resultados.publicar"), events.Subject(in.Body.Categoria)))
			})
			if err == nil {
				s.bump(ctx, in.CID)
			}
			return nil, err
		})

	// «Exportar acta»: every category with attempts, totals and GL (CSV; the official record is validated by the AEP).
	type csvOut struct {
		ContentType        string `header:"Content-Type"`
		ContentDisposition string `header:"Content-Disposition"`
		Body               []byte
	}
	huma.Register(api, huma.Operation{OperationID: "resultados-acta", Method: http.MethodGet, Path: base + "/acta.csv", Summary: "Acta en CSV", Tags: tagResultados, Security: bearer},
		func(ctx context.Context, in *cidIn) (*csvOut, error) {
			if err := leer(ctx, in.CID); err != nil {
				return nil, err
			}
			p, err := s.cargarPlan(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			t, err := cargarIntentos(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			recs, err := cargarRecords(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			var b bytes.Buffer
			b.WriteString("\ufeff")
			w := csv.NewWriter(&b)
			w.Comma = ';'
			_ = w.Write([]string{"Categoría", "Puesto", "Atleta", "Club", "División", "Peso corporal", "SQ1", "SQ2", "SQ3", "BP1", "BP2", "BP3", "DL1", "DL2", "DL3", "Mejor SQ", "Mejor BP", "Mejor DL", "Total", "GL", "Récords"})
			cel := func(c Celda) string {
				if c.Resultado == "pendiente" || c.Peso == 0 {
					return ""
				}
				if c.Resultado == "renuncia" {
					return "—"
				}
				if c.Resultado == "nulo" {
					return "-" + kg(c.Peso)
				}
				return kg(c.Peso)
			}
			f2 := func(v *float64) string {
				if v == nil {
					return ""
				}
				return kg(*v)
			}
			for _, k := range p.categorias() {
				c := clasificar(p, t, recs, k, false)
				for _, f := range c.Filas {
					puesto := "—"
					if f.Puesto > 0 {
						puesto = itoa(f.Puesto)
					}
					row := []string{c.Titulo, puesto, f.Nombre, f.Club, f.Division, f2(f.PesoCorporal)}
					for _, m := range movs {
						for _, x := range f.Intentos[m] {
							row = append(row, cel(x))
						}
					}
					gl := ""
					if f.GL != nil {
						gl = strings.ReplaceAll(trimFloat2(*f.GL), ".", ",")
					}
					row = append(row, f2(f.SQ), f2(f.BP), f2(f.DL), f2(f.Total), gl, strings.Join(f.Records, " · "))
					_ = w.Write(row)
				}
			}
			w.Flush()
			return &csvOut{ContentType: "text/csv; charset=utf-8", ContentDisposition: `attachment; filename="acta-resultados.csv"`, Body: b.Bytes()}, nil
		})
}

func trimFloat2(v float64) string {
	n := int64(v*100 + 0.5)
	d := n % 100
	s := itoa(int(n/100)) + "."
	if d < 10 {
		s += "0"
	}
	return s + itoa(int(d))
}

var _ = errors.New
