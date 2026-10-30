package live

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/legacy"
)

// etlMySQL («live etl-mysql --mysql DSN [--dry-run] [--etiqueta …]») imports the attempts of the finished editions
// and publishes their final results, computed by the same ranking as the desk (one flight per category, in the
// old registration order). An edition not held yet starts its live from zero. Example results seeded for an
// edition («Datos de ejemplo») are replaced by the real ones.
//
// Old votes: two whites → good, two reds → no lift; an attempt with a weight but no decision, or one missing
// between recorded ones, counts as not taken (renuncia): the competition is over and nothing can be pending.
func (s *Svc) etlMySQL(ctx context.Context, a *app.App, args []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	o, err := legacy.Leer(args)
	if err != nil {
		return err
	}
	mapa, err := legacy.CargarMapa(ctx, a.Redis, a.Keys, o.DryRun)
	if err != nil {
		return err
	}
	my, err := legacy.Abrir(ctx, o.DSN)
	if err != nil {
		return err
	}
	defer my.Close()
	inf := legacy.NuevoInforme("live", o.DryRun)

	type ins struct {
		ID, Comp                    int
		Nombre, Ap1, Ap2, Sexo, Cat string
	}
	rows, err := my.QueryContext(ctx, `SELECT Id, CompeticionId, Nombre, COALESCE(Apellido1, ''), COALESCE(Apellido2, ''), COALESCE(Sexo, ''), COALESCE(CategoriaPeso, '')
		FROM Inscripciones WHERE PagoConfirmado = 1 OR ParticipacionConfirmada = 1 ORDER BY Id`)
	if err != nil {
		return err
	}
	inscritos := map[int]ins{}
	var orden []int
	for rows.Next() {
		var r ins
		if err := rows.Scan(&r.ID, &r.Comp, &r.Nombre, &r.Ap1, &r.Ap2, &r.Sexo, &r.Cat); err != nil {
			rows.Close()
			return err
		}
		inscritos[r.ID] = r
		orden = append(orden, r.ID)
	}
	rows.Close()
	type entrada struct {
		ID, Ins, Num int
		Mov          string
		Peso         float64
		Votos        string
		Fecha        time.Time
	}
	rows, err = my.QueryContext(ctx, `SELECT Id, InscripcionId, LiftType, AttemptNumber, Weight, Juez1Voto, Juez2Voto, Juez3Voto, UpdatedAt FROM LiftEntriesInscripcion ORDER BY Id`)
	if err != nil {
		return err
	}
	porIns := map[int][]entrada{}
	for rows.Next() {
		var e entrada
		var tipo string
		var v1, v2, v3 *bool
		if err := rows.Scan(&e.ID, &e.Ins, &tipo, &e.Num, &e.Peso, &v1, &v2, &v3, &e.Fecha); err != nil {
			rows.Close()
			return err
		}
		inf.Leidos["intentos"]++
		e.Mov = movLegado(tipo)
		if e.Mov == "" || e.Num < 1 || e.Num > 3 || e.Peso <= 0 || e.Peso >= 10000 {
			inf.Omitir("intento sin movimiento, número o peso válidos")
			continue
		}
		for _, v := range []*bool{v1, v2, v3} {
			if v != nil {
				e.Votos += map[bool]string{true: "B", false: "R"}[*v]
			}
		}
		porIns[e.Ins] = append(porIns[e.Ins], e)
	}
	rows.Close()

	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for _, ed := range mapa {
			cid := ed.NuevaID
			p := &plan{Atletas: map[uuid.UUID]*atleta{}}
			fl := map[string]*flight{}
			var flOrden []string
			n := 0
			for _, iid := range orden {
				r := inscritos[iid]
				if r.Comp != ed.ID || len(porIns[iid]) == 0 {
					continue
				}
				if !ed.Finalizada {
					inf.Omitir("intentos de una edición sin terminar (el directo empieza de cero)")
					continue
				}
				nombre := strings.Join(strings.Fields(r.Nombre+" "+r.Ap1+" "+r.Ap2), " ")
				aid := legacy.ID("Inscripciones/atleta", iid)
				sexo, cat := legacy.Sexo(r.Sexo), legacy.Categoria(r.Cat)
				if cat == "" {
					inf.Omitir("atleta sin categoría (no entra en la clasificación)")
					continue
				}
				p.Atletas[aid] = &atleta{ID: aid, Nombre: nombre, Publico: true, Sexo: sexo, Categoria: cat, DivisionNombre: "Open"}
				k := clave(sexo, cat)
				f := fl[k]
				if f == nil {
					f = &flight{ID: legacy.ID("live/flight", cid.String()+"/"+k), Codigo: k, Sexo: sexo, Dia: ed.Fecha.Format("2006-01-02")}
					fl[k] = f
					flOrden = append(flOrden, k)
				}
				n++
				f.Atletas = append(f.Atletas, snapAtleta{ID: aid, Lote: n})
				// attempts: the recorded ones, plus «renuncia» for a missing number of a lift that has others
				por := map[string]*[4]*entrada{}
				for i := range porIns[iid] {
					e := &porIns[iid][i]
					if por[e.Mov] == nil {
						por[e.Mov] = &[4]*entrada{}
					}
					por[e.Mov][e.Num] = e
				}
				for _, m := range movs {
					arr := por[m]
					if arr == nil {
						inf.Omitir("movimiento sin intentos (queda sin total)")
						continue
					}
					for num := 1; num <= 3; num++ {
						e := arr[num]
						id, peso, votos, res := uuid.Nil, 0.0, "", "renuncia"
						at, motivo := ed.Fecha, "intentos no registrados → renuncia"
						if e != nil {
							id, peso, votos, at = legacy.ID("LiftEntriesInscripcion", e.ID), e.Peso, e.Votos, e.Fecha
							res, motivo = veredictoLegado(e.Votos), "intentos sin decisión → renuncia"
						} else {
							for j := num - 1; j >= 1 && peso == 0; j-- {
								if arr[j] != nil {
									peso = arr[j].Peso
								}
							}
							for j := num + 1; j <= 3 && peso == 0; j++ {
								if arr[j] != nil {
									peso = arr[j].Peso
								}
							}
							id = legacy.ID("live/renuncia", fmt.Sprintf("%s/%s/%d", aid, m, num))
						}
						tag, err := tx.Exec(ctx, `INSERT INTO intentos (id, competition_id, atleta_id, flight_id, movimiento, numero, peso, votos, resultado, corregido_por, juzgado_at, updated_at)
							VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) ON CONFLICT DO NOTHING`, id, cid, aid, f.ID, m, num, peso, votos, res, o.Etiqueta, at)
						if err != nil {
							return fmt.Errorf("intento de la inscripción %d: %w", iid, err)
						}
						if tag.RowsAffected() > 0 {
							inf.Escritos["intentos "+res]++
							if res == "renuncia" {
								inf.Escritos[motivo]++
							}
						}
					}
				}
			}
			if len(p.Atletas) == 0 {
				continue
			}
			for _, k := range flOrden {
				f := fl[k]
				f.Titulo, _ = titulo(f.Sexo, k[1:])
				p.Flights = append(p.Flights, *f)
			}
			p.index()
			t, err := cargarIntentos(ctx, tx, cid)
			if err != nil {
				return err
			}
			recs, err := cargarRecords(ctx, tx, cid)
			if err != nil {
				return err
			}
			// example categories the import does not have go away (the others are overwritten below)
			tag, err := tx.Exec(ctx, `DELETE FROM resultados WHERE competition_id = $1 AND publicado_por = 'Datos de ejemplo' AND NOT (categoria = ANY($2))`, cid, p.categorias())
			if err != nil {
				return err
			}
			if tag.RowsAffected() > 0 {
				inf.Notas = append(inf.Notas, fmt.Sprintf("%s: %d categorías de «Datos de ejemplo» retiradas (no están en la web anterior)", ed.Nueva, tag.RowsAffected()))
			}
			pubs, err := cargarPublicados(ctx, tx, cid)
			if err != nil {
				return err
			}
			publicado := time.Date(ed.Fecha.Year(), ed.Fecha.Month(), ed.Fecha.Day(), 20, 0, 0, 0, madrid)
			for _, k := range p.categorias() {
				cat := clasificar(p, t, recs, k, true)
				if old, ok := pubs[k]; ok && old.pub.Por == o.Etiqueta && mismaClasificacion(old.datos, cat) {
					inf.Omitir("categoría ya publicada sin cambios")
					continue
				}
				if _, err := tx.Exec(ctx, `INSERT INTO resultados (competition_id, categoria, datos, publicado_por, publicado_at) VALUES ($1,$2,$3,$4,$5)
					ON CONFLICT (competition_id, categoria) DO UPDATE SET datos = EXCLUDED.datos, version = resultados.version + 1, publicado_por = EXCLUDED.publicado_por`,
					cid, k, cat, o.Etiqueta, publicado); err != nil {
					return err
				}
				inf.Escritos["categorías publicadas"]++
			}
			if _, err := tx.Exec(ctx, `INSERT INTO estado (competition_id, fase) VALUES ($1, 'finalizado') ON CONFLICT (competition_id) DO UPDATE SET fase = 'finalizado', flight_id = NULL`, cid); err != nil {
				return err
			}
			inf.Notas = append(inf.Notas, fmt.Sprintf("%s: %d atletas con intentos, %d categorías", ed.Nueva, len(p.Atletas), len(p.categorias())))
		}
		if o.DryRun {
			return legacy.ErrDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, legacy.ErrDryRun) {
		return err
	}
	if !o.DryRun {
		for _, ed := range mapa {
			s.bump(ctx, ed.NuevaID)
		}
	}
	inf.Log(a.Log)
	return nil
}

func movLegado(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	switch {
	case strings.HasPrefix(t, "sq") || strings.HasPrefix(t, "sent"):
		return "sq"
	case strings.HasPrefix(t, "b") || strings.HasPrefix(t, "pr"):
		return "bp"
	case strings.HasPrefix(t, "d") || strings.HasPrefix(t, "pm") || strings.HasPrefix(t, "pe"):
		return "dl"
	}
	return ""
}

// veredictoLegado: two whites → valido, two reds → nulo, otherwise nothing was decided → renuncia.
func veredictoLegado(v string) string {
	switch {
	case strings.Count(v, "B") >= 2:
		return "valido"
	case strings.Count(v, "R") >= 2:
		return "nulo"
	}
	return "renuncia"
}
