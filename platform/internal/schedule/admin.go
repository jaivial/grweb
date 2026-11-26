package schedule

import (
	"context"
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

var tagAdmin = []string{"Horarios"}

type sesionIn struct {
	Dia          string    `json:"dia,omitempty" format:"date"`
	Inicio       string    `json:"inicio,omitempty" pattern:"^[0-2][0-9]:[0-5][0-9]$" doc:"Hora local"`
	DuracionMin  int       `json:"duracionMin,omitempty" minimum:"10" maximum:"600"`
	PesajeInicio string    `json:"pesajeInicio,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$" doc:"Hora local (mismo día)"`
	PesajeFin    string    `json:"pesajeFin,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$"`
	Competicion  string    `json:"competicion,omitempty" enum:"aep1,aep2,aep3" doc:"Competición del sesion nuevo (solo al crear)"`
	Sexo         *string   `json:"sexo,omitempty" enum:"F,M" doc:"BIZ-202: sexo de la sesión (solo uno)"`
	Categorias   *[]string `json:"categorias,omitempty" maxItems:"9" doc:"BIZ-202: categorías de peso de la sesión, del mismo sexo"`
	Nivel        *string   `json:"nivel,omitempty" doc:"BIZ-202: nivel AEP de la sesión: aep1, aep2, aep3 o vacío"`
}

const base = "/api/admin/competiciones/{cid}/horarios"

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

type borradorOut struct {
	ETag string `header:"ETag"`
	Body Borrador
}

func (s *Svc) out(ctx context.Context, cid uuid.UUID) (*borradorOut, error) {
	b, err := s.borrador(ctx, cid)
	if err != nil {
		return nil, err
	}
	return &borradorOut{ETag: etag(b.Rev), Body: b}, nil
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	type enOut struct {
		Body map[string]string
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-en-get", Method: http.MethodGet, Path: base + "/en", Summary: "Textos en inglés del horario público (texto en español → inglés)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*enOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			out := &enOut{Body: map[string]string{}}
			_ = s.a.DB.QueryRow(ctx, `SELECT en FROM config WHERE competition_id = $1`, in.CID).Scan(&out.Body)
			return out, nil
		})
	type enIn struct {
		CID  uuid.UUID `path:"cid"`
		Body map[string]string
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-en-put", Method: http.MethodPut, Path: base + "/en", Summary: "Guarda los textos en inglés del horario público", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *enIn) (*enOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `UPDATE config SET en = $2 WHERE competition_id = $1`, in.CID, in.Body); err != nil {
				return nil, err
			}
			return &enOut{Body: in.Body}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "horarios-get", Method: http.MethodGet, Path: base, Summary: "Planificador: sesiones, atletas sin sesión, conflictos y versión publicada", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*borradorOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type configIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    Config
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-config", Method: http.MethodPut, Path: base + "/config", Summary: "Ajustes del planificador y de los días (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *configIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			c := in.Body
			if err := validarDias(c.Dias); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "cambió los ajustes de los horarios", func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `UPDATE config SET max_por_sesion = $2, min_por_atleta = $3, descanso_min = $4,
					pesaje_antes_min = $5, pesaje_duracion_min = $6, mesas_pesaje = $7, dias = $8 WHERE competition_id = $1`,
					in.CID, c.MaxPorSesion, c.MinPorAtleta, c.DescansoMin, c.PesajeAntesMin, c.PesajeDuracionMin, c.MesasPesaje, c.Dias)
				if err != nil {
					return err
				}
				return avisarDias(ctx, tx, in.CID, c.Dias)
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type nuevaIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Fecha string `json:"fecha,omitempty" format:"date" doc:"Vacío: el día siguiente a la última fecha"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-dia-crear", Method: http.MethodPost, Path: base + "/dias", Summary: "Añadir una fecha (misma plantilla que la última: horario, puertas, pausa, info y agenda)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *nuevaIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "añadió una fecha", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if len(cfg.Dias) >= 7 {
					return problem.Unprocessable("DEMASIADAS_FECHAS", "Como mucho 7 fechas por competición.")
				}
				plantilla := Dia{Inicio: "09:00", Fin: "21:00", Puertas: "08:30", PausaInicio: "14:00", PausaFin: "15:00"}
				if n := len(cfg.Dias); n > 0 {
					plantilla = cfg.Dias[n-1]
				}
				src, f := plantilla.Fecha, in.Body.Fecha
				if f == "" {
					t, err := time.Parse("2006-01-02", src)
					if err != nil {
						t = time.Now().AddDate(0, 0, 6)
					}
					f = t.AddDate(0, 0, 1).Format("2006-01-02")
				}
				plantilla.Fecha = f
				cfg.Dias = append(cfg.Dias, plantilla)
				if err := validarDias(cfg.Dias); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, in.CID, cfg.Dias); err != nil {
					return err
				}
				if src != "" {
					if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden)
						SELECT gen_random_uuid(), competition_id, $3, hora, titulo, icono, orden FROM agenda WHERE competition_id = $1 AND dia = $2`, in.CID, src, f); err != nil {
						return err
					}
				}
				return avisarDias(ctx, tx, in.CID, cfg.Dias)
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type diaIn struct {
		CID     uuid.UUID `path:"cid"`
		Dia     string    `path:"dia" format:"date"`
		IfMatch string    `header:"If-Match"`
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-dia-borrar", Method: http.MethodDelete, Path: base + "/dias/{dia}", Summary: "Quitar una fecha (sus sesiones se borran y sus atletas quedan sin sesión)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *diaIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "quitó la fecha "+in.Dia, func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				dias := []Dia{}
				for _, d := range cfg.Dias {
					if d.Fecha != in.Dia {
						dias = append(dias, d)
					}
				}
				if len(dias) == len(cfg.Dias) {
					return problem.NotFound("Esa fecha ya no existe.")
				}
				if len(dias) == 0 {
					return problem.Unprocessable("ULTIMA_FECHA", "La competición necesita al menos una fecha.")
				}
				for _, q := range []string{`DELETE FROM sesiones WHERE competition_id = $1 AND dia = $2`, `DELETE FROM agenda WHERE competition_id = $1 AND dia = $2`} {
					if _, err := tx.Exec(ctx, q, in.CID, in.Dia); err != nil {
						return err
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, in.CID, dias); err != nil {
					return err
				}
				return avisarDias(ctx, tx, in.CID, dias)
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type generarIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			MaxPorSesion int    `json:"maxPorSesion,omitempty" minimum:"2" maximum:"30"`
			Competicion  string `json:"competicion,omitempty" enum:"aep2,aep3" doc:"Solo esta competición: sus atletas, en su día; los sesiones de la otra no se tocan"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-generar", Method: http.MethodPost, Path: base + "/generar", Summary: "Generar las sesiones automáticamente (sustituye el borrador)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *generarIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			ats, err := s.confirmados(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			prueba := in.Body.Competicion
			if prueba != "" {
				ats = dePrueba(ats, prueba)
			}
			if len(ats) == 0 {
				if prueba != "" {
					return nil, problem.Conflict("SIN_ATLETAS", "No hay atletas confirmados en "+nombrePrueba(prueba)+".")
				}
				return nil, problem.Conflict("SIN_ATLETAS", "No hay atletas confirmados. Importa primero el acta de la AEP.")
			}
			loc := s.loc(ctx, in.CID)
			n := 0
			_, err = s.change(ctx, in.CID, in.IfMatch, "generó las sesiones automáticamente", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if b := in.Body; b.MaxPorSesion > 0 {
					if b.MaxPorSesion > 0 {
						cfg.MaxPorSesion = b.MaxPorSesion
					}
					if _, err := tx.Exec(ctx, `UPDATE config SET max_por_sesion = $2 WHERE competition_id = $1`, in.CID, cfg.MaxPorSesion); err != nil {
						return err
					}
				}
				var borrar []uuid.UUID
				var quedan []sesionRow
				if prueba != "" {
					cfg.Dias = diasPrueba(cfg.Dias, prueba)
					if borrar, quedan, err = sesionesDePrueba(ctx, tx, in.CID, prueba, ats); err != nil {
						return err
					}
				}
				plan := generar(cfg, loc, ats, quedan)
				n = len(plan)
				if err := s.reemplazar(ctx, tx, in.CID, cfg, plan, borrar, prueba); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "horarios.generados", map[string]any{"sesiones": len(plan), "atletas": len(ats)},
					events.Competition(in.CID.String()), events.ForPermission("horarios.publicar")))
			})
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("sesiones generadas", "competicion", in.CID, "sesiones", n, "atletas", len(ats))
			return s.out(ctx, in.CID)
		})

	type crearIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    sesionIn
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-sesion-crear", Method: http.MethodPost, Path: base + "/sesiones", Summary: "Crear una sesión vacía", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *crearIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			loc := s.loc(ctx, in.CID)
			_, err := s.change(ctx, in.CID, in.IfMatch, "creó una sesión", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				b := in.Body
				if b.Dia == "" {
					if len(cfg.Dias) == 0 {
						return problem.Unprocessable("SIN_DIAS", "Añade primero los días de competición en los ajustes.")
					}
					b.Dia = cfg.Dias[len(cfg.Dias)-1].Fecha
				}
				if b.Inicio == "" {
					// After the last sesion of the day.
					var fin *time.Time
					if err := tx.QueryRow(ctx, `SELECT max(inicio + duracion_min * interval '1 minute') FROM sesiones WHERE competition_id = $1 AND dia = $2`, in.CID, b.Dia).Scan(&fin); err != nil {
						return err
					}
					if fin != nil {
						b.Inicio = hhmm(ceil5(fin.Add(time.Duration(cfg.DescansoMin)*time.Minute)), loc)
					} else {
						b.Inicio = "09:00"
						for _, d := range cfg.Dias {
							if d.Fecha == b.Dia {
								b.Inicio = d.Inicio
							}
						}
					}
				}
				ini := dayTime(b.Dia, b.Inicio, loc)
				if ini.IsZero() {
					return problem.Unprocessable("HORA_INVALIDA", "Revisa el día y la hora.")
				}
				if b.DuracionMin == 0 {
					b.DuracionMin = cfg.MaxPorSesion * cfg.MinPorAtleta
				}
				pi, pf := pesaje(cfg, ini)
				_, err = tx.Exec(ctx, `INSERT INTO sesiones (id, competition_id, dia, inicio, duracion_min, pesaje_inicio, pesaje_fin, prueba) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					newID(), in.CID, b.Dia, ini, b.DuracionMin, pi, pf, b.Competicion)
				return err
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type editarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    sesionIn
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-sesion-editar", Method: http.MethodPatch, Path: base + "/sesiones/{id}", Summary: "Cambiar día, hora, duración o pesaje de una sesión", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *editarIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			loc := s.loc(ctx, in.CID)
			accion := ""
			_, err := s.change(ctx, in.CID, in.IfMatch, "", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				var f sesionRow
				if err := tx.QueryRow(ctx, `SELECT id, prueba, sexo, categorias, dia, duracion_min, inicio, pesaje_inicio, pesaje_fin FROM sesiones WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).
					Scan(&f.ID, &f.Prueba, &f.Sexo, &f.Categorias, &f.Dia, &f.DuracionMin, &f.Inicio, &f.PesajeIni, &f.PesajeFn); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Esa sesión ya no existe.")
					}
					return err
				}
				b := in.Body
				dia := f.Dia.Format("2006-01-02")
				if b.Dia != "" {
					dia = b.Dia
				}
				hm := hhmm(f.Inicio, loc)
				if b.Inicio != "" {
					hm = b.Inicio
				}
				ini := dayTime(dia, hm, loc)
				if ini.IsZero() {
					return problem.Unprocessable("HORA_INVALIDA", "Revisa el día y la hora.")
				}
				pi, pf := f.PesajeIni, f.PesajeFn
				if !ini.Equal(f.Inicio) {
					pi, pf = pesaje(cfg, ini) // the weigh-in follows the start unless it is set explicitly
				}
				if b.PesajeInicio != "" {
					pi = dayTime(dia, b.PesajeInicio, loc)
				}
				if b.PesajeFin != "" {
					pf = dayTime(dia, b.PesajeFin, loc)
				}
				if !pf.After(pi) || pf.After(ini) {
					return problem.Unprocessable("PESAJE_INVALIDO", "El pesaje tiene que terminar después de empezar y antes de que empiece la sesión.")
				}
				if b.DuracionMin > 0 {
					f.DuracionMin = b.DuracionMin
				}
				sexo, cats, prueba, err := categoriasSesion(f, b)
				if err != nil {
					return err
				}
				accion = "cambió el horario de la sesión de las " + hhmm(f.Inicio, loc)
				_, err = tx.Exec(ctx, `UPDATE sesiones SET dia = $3, inicio = $4, duracion_min = $5, pesaje_inicio = $6, pesaje_fin = $7, sexo = $8, categorias = $9, prueba = $10, updated_at = now()
					WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, dia, ini, f.DuracionMin, pi, pf, sexo, cats, prueba)
				if err == nil {
					s.a.Log.Info("[BIZ-202] schedule_sesion_editada", "competition_id", in.CID, "sesion_id", in.ID, "dia", dia, "inicio", hhmm(ini, loc),
						"pesaje", hhmm(pi, loc)+"–"+hhmm(pf, loc), "sexo", sexo, "categorias", strings.Join(cats, ","), "nivel", prueba)
				}
				return err
			}, func() string { return accion })
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type borrarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-sesion-borrar", Method: http.MethodDelete, Path: base + "/sesiones/{id}", Summary: "Borrar una sesión (sus atletas quedan sin sesión)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *borrarIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "borró una sesión", func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `DELETE FROM sesiones WHERE competition_id = $1 AND id = $2`, in.CID, in.ID)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("Esa sesión ya no existe.")
				}
				return err
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type atletasIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Atletas []uuid.UUID `json:"atletas" maxItems:"40" doc:"Atletas del sesion en orden de lote (los que vengan de otro sesion se mueven)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-sesion-atletas", Method: http.MethodPut, Path: base + "/sesiones/{id}/atletas", Summary: "Atletas de una sesión y su orden (mover entre sesiones)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *atletasIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			ats, err := s.confirmados(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			byID := map[uuid.UUID]atleta{}
			for _, a := range ats {
				byID[a.ID] = a
			}
			accion := ""
			loc := s.loc(ctx, in.CID)
			_, err = s.change(ctx, in.CID, in.IfMatch, "", func(tx pgx.Tx) error {
				var codigo string
				var inicioSes time.Time
				var prueba string
				if err := tx.QueryRow(ctx, `SELECT inicio, prueba FROM sesiones WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&inicioSes, &prueba); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Esa sesión ya no existe.")
					}
					return err
				}
				codigo = hhmm(inicioSes, loc)
				// Where everyone is now (to describe the move and keep withdrawn athletes that were already here).
				rows, err := tx.Query(ctx, `SELECT fa.atleta_id, fa.sesion_id, to_char(f.inicio AT TIME ZONE $2, 'DD/MM HH24:MI') FROM sesion_atletas fa JOIN sesiones f ON f.id = fa.sesion_id WHERE fa.competition_id = $1`, in.CID, loc.String())
				if err != nil {
					return err
				}
				type pos struct {
					sesion uuid.UUID
					codigo string
				}
				donde := map[uuid.UUID]pos{}
				for rows.Next() {
					var a, f uuid.UUID
					var c string
					if err := rows.Scan(&a, &f, &c); err != nil {
						rows.Close()
						return err
					}
					donde[a] = pos{f, c}
				}
				if err := rows.Err(); err != nil {
					return err
				}
				seen := map[uuid.UUID]bool{}
				var movidos []string
				// A sesion only takes athletes of one competition (AEP-2 / AEP-3 / sin competición): the sesion's own
				// one, or the first athlete's when the sesion has none yet.
				fija := prueba != ""
				for _, id := range in.Body.Atletas {
					if seen[id] {
						return problem.Unprocessable("ATLETA_REPETIDO", "Un atleta aparece dos veces en la sesión.")
					}
					seen[id] = true
					if a, ok := byID[id]; ok {
						if !fija {
							prueba, fija = a.Prueba, true
						} else if a.Prueba != prueba {
							return problem.Unprocessable("PRUEBA_DISTINTA", fmt.Sprintf("%s %s y la sesión de las %s es de %s. Cámbiale la competición en su ficha.", a.Nombre, compiteEn(a.Prueba), codigo, nombreOSin(prueba)))
						}
					}
					p, aqui := donde[id]
					aqui = aqui && p.sesion == in.ID
					if _, ok := byID[id]; !ok && !aqui {
						return problem.Unprocessable("ATLETA_NO_CONFIRMADO", "Solo puedes asignar atletas confirmados.")
					}
					if !aqui {
						de := "sin sesión"
						if p.codigo != "" {
							de = p.codigo
						}
						movidos = append(movidos, fmt.Sprintf("movió a %s de %s a %s", byID[id].Nombre, de, codigo))
					}
				}
				quitados := 0
				for a, p := range donde {
					if p.sesion == in.ID && !seen[a] {
						quitados++
					}
				}
				switch {
				case len(movidos) == 1 && quitados == 0:
					accion = movidos[0]
				case len(movidos) > 1:
					accion = fmt.Sprintf("movió %d atletas a la sesión de las %s", len(movidos), codigo)
				case quitados > 0:
					accion = fmt.Sprintf("quitó %d atleta(s) de la sesión de las %s", quitados, codigo)
				default:
					accion = "reordenó la sesión de las " + codigo
				}
				if _, err := tx.Exec(ctx, `DELETE FROM sesion_atletas WHERE competition_id = $1 AND (sesion_id = $2 OR atleta_id = ANY($3))`, in.CID, in.ID, in.Body.Atletas); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE sesiones SET prueba = $3 WHERE competition_id = $1 AND id = $2 AND prueba = ''`, in.CID, in.ID, prueba); err != nil {
					return err
				}
				for i, id := range in.Body.Atletas {
					if _, err := tx.Exec(ctx, `INSERT INTO sesion_atletas (sesion_id, competition_id, atleta_id, orden) VALUES ($1,$2,$3,$4)`, in.ID, in.CID, id, i+1); err != nil {
						return err
					}
				}
				// Keep the lots of the sesiones that lost someone consecutive.
				_, err = tx.Exec(ctx, `UPDATE sesion_atletas fa SET orden = x.n FROM (
					SELECT sesion_id, atleta_id, row_number() OVER (PARTITION BY sesion_id ORDER BY orden) AS n FROM sesion_atletas WHERE competition_id = $1) x
					WHERE fa.sesion_id = x.sesion_id AND fa.atleta_id = x.atleta_id AND fa.orden <> x.n`, in.CID)
				return err
			}, func() string { return accion })
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type agendaIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Items []AgendaItem `json:"items" maxItems:"40"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-agenda", Method: http.MethodPut, Path: base + "/agenda", Summary: "Otros momentos del día (puertas, premios, sorteo…)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *agendaIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "editó la agenda del día", func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `DELETE FROM agenda WHERE competition_id = $1`, in.CID); err != nil {
					return err
				}
				for i, it := range in.Body.Items {
					if it.Icono == "" {
						it.Icono = "clock"
					}
					if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
						newID(), in.CID, it.Dia, it.Hora, it.Titulo, it.Icono, i); err != nil {
						return err
					}
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			return s.out(ctx, in.CID)
		})

	type directoIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body Directo
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-sesion-directo", Method: http.MethodPut, Path: base + "/sesiones/{id}/directo", Summary: "Estado en directo de una sesión publicada (en curso, retraso)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *directoIn) (*struct{ Body Directo }, error) {
			p, err := auth.User(ctx)
			if err != nil {
				return nil, err
			}
			if !p.Can(in.CID.String(), "directo.operar") && !p.Can(in.CID.String(), "horarios.publicar") {
				return nil, problem.Forbidden("Tu rol no puede marcar el directo.")
			}
			if in.Body.RetrasoMin < 0 || in.Body.RetrasoMin > 600 {
				return nil, problem.Unprocessable("RETRASO_INVALIDO", "El retraso va de 0 a 600 minutos.")
			}
			if err := s.setDirecto(ctx, in.CID, in.ID, in.Body, "horarios"); err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			return &struct{ Body Directo }{in.Body}, nil
		})
}

// setDirecto stores the live state of a published sesion and announces it (public: no personal data).
func (s *Svc) setDirecto(ctx context.Context, cid, id uuid.UUID, d Directo, origen string) error {
	v, err := s.versionPublicada(ctx, s.a.DB, cid)
	if err != nil {
		return err
	}
	var f *SnapSesion
	if v != nil {
		f = v.Snapshot.sesion(id)
	}
	if f == nil {
		return problem.NotFound("Esa sesión no está en los horarios publicados.")
	}
	loc := s.loc(ctx, cid)
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO directo (sesion_id, competition_id, estado, retraso_min) VALUES ($1,$2,$3,$4)
			ON CONFLICT (sesion_id) DO UPDATE SET estado = EXCLUDED.estado, retraso_min = EXCLUDED.retraso_min, updated_at = now()`, id, cid, d.Estado, d.RetrasoMin); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "horarios.sesion", map[string]any{"sesionId": id, "dia": f.Inicio.In(loc).Format("2006-01-02"), "hora": hhmm(f.Inicio, loc), "estado": d.Estado,
			"retrasoMin": d.RetrasoMin, "inicioEstimado": hhmm(f.Inicio.Add(time.Duration(d.RetrasoMin)*time.Minute), loc), "origen": origen},
			events.Competition(cid.String()), events.Audience(events.Public), events.Subject(id.String())))
	})
	if err == nil {
		s.bump(ctx, cid)
		if e := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/jornadas/"+f.Inicio.In(loc).Format("2006-01-02")+"/retraso", map[string]int{"retrasoMin": d.RetrasoMin}, nil); e != nil {
			s.a.Log.Warn("retraso de la sesión en athletes", "sesion", id, "err", e)
		}
	}
	return err
}

// registerInternal: live reads the published sesiones (athletes in lot order) and drives their live state.
func (s *Svc) registerInternal() {
	type cidOnly struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-publicados", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/horarios/publicados", Summary: "Versión publicada (solo servicios)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidOnly) (*struct{ Body *Snapshot }, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			v, err := s.versionPublicada(ctx, s.a.DB, in.CID)
			if err != nil || v == nil {
				return &struct{ Body *Snapshot }{nil}, err
			}
			return &struct{ Body *Snapshot }{&v.Snapshot}, nil
		})
	type visOut struct {
		Body struct {
			Visible bool `json:"visible" doc:"Interruptor «Publicar horarios»"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-visibilidad", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/horarios/visibilidad", Summary: "Interruptor «Publicar horarios» (solo servicios)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidOnly) (*visOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			v, err := webVisible(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			o := &visOut{}
			o.Body.Visible = v
			return o, nil
		})
	type diasOut struct {
		Body struct {
			Dias []DiaInfo `json:"dias"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-dias", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/horarios/dias", Summary: "Fechas del evento (borrador), en orden (solo servicios: juegos)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidOnly) (*diasOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			if err := s.ensureConfig(ctx, in.CID); err != nil {
				return nil, err
			}
			cfg, _, _, _, err := loadConfig(ctx, s.a.DB, in.CID)
			if err != nil {
				return nil, err
			}
			o := &diasOut{}
			o.Body.Dias = diasInfo(cfg.Dias)
			return o, nil
		})
	type dirIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body Directo
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-directo", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/horarios/sesiones/{id}/directo", Summary: "Estado en directo de un sesion (solo live)", Tags: []string{"Interno"}, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *dirIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			return nil, s.setDirecto(ctx, in.CID, in.ID, in.Body, "directo")
		})
}

// reemplazar swaps the draft for a generated plan (agenda and settings stay): every sesion, or only the ones in borrar.
func (s *Svc) reemplazar(ctx context.Context, tx pgx.Tx, cid uuid.UUID, cfg Config, plan []planSesion, borrar []uuid.UUID, prueba string) error {
	q, args := `DELETE FROM sesiones WHERE competition_id = $1`, []any{cid}
	if borrar != nil {
		q, args = q+` AND id = ANY($2)`, append(args, borrar)
	}
	if _, err := tx.Exec(ctx, q, args...); err != nil {
		return err
	}
	for _, p := range plan {
		id := newID()
		pi, pf := pesaje(cfg, p.Inicio)
		if _, err := tx.Exec(ctx, `INSERT INTO sesiones (id, competition_id, dia, inicio, duracion_min, pesaje_inicio, pesaje_fin, prueba) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			id, cid, p.Dia, p.Inicio, p.Duracion, pi, pf, prueba); err != nil {
			return err
		}
		for i, a := range p.Atletas {
			if _, err := tx.Exec(ctx, `INSERT INTO sesion_atletas (sesion_id, competition_id, atleta_id, orden) VALUES ($1,$2,$3,$4)`, id, cid, a, i+1); err != nil {
				return err
			}
		}
	}
	return nil
}

// validarDias checks the days: valid dates, start before end, the break inside the day, no repeated dates.
func validarDias(ds []Dia) error {
	seen := map[string]bool{}
	for _, d := range ds {
		if _, err := time.Parse("2006-01-02", d.Fecha); err != nil || seen[d.Fecha] {
			return problem.Unprocessable("DIA_INVALIDO", "Revisa las fechas: cada día una sola vez.")
		}
		seen[d.Fecha] = true
		if d.Inicio >= d.Fin {
			return problem.Unprocessable("DIA_INVALIDO", "El "+d.Fecha+" empieza después de terminar.")
		}
		if (d.PausaInicio == "") != (d.PausaFin == "") || d.PausaInicio != "" && !(d.Inicio < d.PausaInicio && d.PausaInicio < d.PausaFin && d.PausaFin <= d.Fin) {
			return problem.Unprocessable("PAUSA_INVALIDA", "La pausa del "+d.Fecha+" tiene que estar dentro del horario del día.")
		}
	}
	sort.Slice(ds, func(i, j int) bool { return ds[i].Fecha < ds[j].Fecha })
	return nil
}

// DiaInfo is a date of the event for other services (juegos creates one matchday per date).
type DiaInfo struct {
	Fecha  string `json:"fecha" format:"date"`
	Orden  int    `json:"orden" doc:"1 = primera fecha"`
	Prueba string `json:"prueba" doc:"aep2 (las fechas del principio) o aep3 (la última)"`
}

func diasInfo(ds []Dia) []DiaInfo {
	out := make([]DiaInfo, len(ds))
	for i, d := range ds {
		out[i] = DiaInfo{Fecha: d.Fecha, Orden: i + 1, Prueba: pruebaDeDia(len(ds), i)}
	}
	return out
}

// avisarDias announces that the dates of the event changed (event «horarios.dias», internal: juegos reconciles its
// matchdays at once).
func avisarDias(ctx context.Context, tx pgx.Tx, cid uuid.UUID, ds []Dia) error {
	fechas := make([]string, len(ds))
	for i, d := range ds {
		fechas[i] = d.Fecha
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "horarios.dias", map[string]any{"fechas": fechas},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}
