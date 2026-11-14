package schedule

import (
	"context"
	"fmt"
	"net/http"
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

var tagAdmin = []string{"Horarios"}

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

// avisarJornadas announces that the dates of the event changed (juegos creates its matchdays from them).
func avisarJornadas(ctx context.Context, tx pgx.Tx, cid uuid.UUID, dias []Dia) error {
	fechas := make([]string, len(dias))
	for i, d := range dias {
		fechas[i] = d.Fecha
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "horarios.jornadas", map[string]any{"dias": fechas},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	huma.Register(api, huma.Operation{OperationID: "horarios-get", Method: http.MethodGet, Path: base, Summary: "Planificador: fechas con sus atletas, atletas sin fecha, conflictos y versión publicada", Tags: tagAdmin, Security: bearer},
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
	huma.Register(api, huma.Operation{OperationID: "horarios-config", Method: http.MethodPut, Path: base + "/config", Summary: "Ajustes del planificador y de las fechas (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *configIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			c := in.Body
			if err := validarDias(c.Dias); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "cambió los ajustes de los horarios", func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE config SET min_por_atleta = $2, pesaje_antes_min = $3, pesaje_duracion_min = $4, dias = $5 WHERE competition_id = $1`,
					in.CID, c.MinPorAtleta, c.PesajeAntesMin, c.PesajeDuracionMin, c.Dias); err != nil {
					return err
				}
				return avisarJornadas(ctx, tx, in.CID, c.Dias)
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
	huma.Register(api, huma.Operation{OperationID: "horarios-dia-crear", Method: http.MethodPost, Path: base + "/dias", Summary: "Añadir una fecha (misma plantilla que la última)", Tags: tagAdmin, Security: bearer},
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
				f := in.Body.Fecha
				if f == "" {
					t, err := time.Parse("2006-01-02", plantilla.Fecha)
					if err != nil {
						t = time.Now().AddDate(0, 0, 6)
					}
					f = t.AddDate(0, 0, 1).Format("2006-01-02")
				}
				src := plantilla.Fecha
				plantilla.Fecha = f
				cfg.Dias = append(cfg.Dias, plantilla)
				if err := validarDias(cfg.Dias); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, in.CID, cfg.Dias); err != nil {
					return err
				}
				// Same template: the agenda of the last date is copied too.
				if src != "" {
					if _, err := tx.Exec(ctx, `INSERT INTO agenda (id, competition_id, dia, hora, titulo, icono, orden)
						SELECT gen_random_uuid(), competition_id, $3, hora, titulo, icono, orden FROM agenda WHERE competition_id = $1 AND dia = $2`, in.CID, src, f); err != nil {
						return err
					}
				}
				return avisarJornadas(ctx, tx, in.CID, cfg.Dias)
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
	huma.Register(api, huma.Operation{OperationID: "horarios-dia-borrar", Method: http.MethodDelete, Path: base + "/dias/{dia}", Summary: "Quitar una fecha (sus atletas quedan sin fecha)", Tags: tagAdmin, Security: bearer},
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
				for _, q := range []string{`DELETE FROM jornada_atletas WHERE competition_id = $1 AND dia = $2`, `DELETE FROM agenda WHERE competition_id = $1 AND dia = $2`} {
					if _, err := tx.Exec(ctx, q, in.CID, in.Dia); err != nil {
						return err
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE config SET dias = $2 WHERE competition_id = $1`, in.CID, dias); err != nil {
					return err
				}
				return avisarJornadas(ctx, tx, in.CID, dias)
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
			Dia string `json:"dia,omitempty" format:"date" doc:"Solo esta fecha: sus atletas en orden de salida; el resto no se toca"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-generar", Method: http.MethodPost, Path: base + "/generar", Summary: "Repartir los atletas en sus fechas y ordenarlos (sustituye el borrador)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *generarIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			ats, err := s.confirmados(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			if len(ats) == 0 {
				return nil, problem.Conflict("SIN_ATLETAS", "No hay atletas confirmados. Importa primero el acta de la AEP.")
			}
			n := 0
			_, err = s.change(ctx, in.CID, in.IfMatch, "generó el orden de salida automáticamente", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if len(cfg.Dias) == 0 {
					return problem.Unprocessable("SIN_DIAS", "Añade primero una fecha.")
				}
				plan := generar(cfg, ats)
				if in.Body.Dia != "" {
					// Only that date: the athletes that belong to it (and are not placed elsewhere), plus the ones already in it.
					asig, err := loadJornadas(ctx, tx, in.CID)
					if err != nil {
						return err
					}
					en := map[uuid.UUID]string{}
					for f, ids := range asig {
						for _, id := range ids {
							en[id] = f
						}
					}
					byID := map[uuid.UUID]atleta{}
					var suyos []atleta
					for _, a := range ats {
						byID[a.ID] = a
					}
					for _, id := range asig[in.Body.Dia] {
						if a, ok := byID[id]; ok {
							suyos = append(suyos, a)
						}
					}
					for _, id := range plan[in.Body.Dia] {
						if _, ok := en[id]; !ok {
							suyos = append(suyos, byID[id])
						}
					}
					cfg1 := cfg
					cfg1.Dias = []Dia{{Fecha: in.Body.Dia}}
					plan = map[string][]uuid.UUID{in.Body.Dia: generar(cfg1, suyos)[in.Body.Dia]}
					if _, err := tx.Exec(ctx, `DELETE FROM jornada_atletas WHERE competition_id = $1 AND dia = $2`, in.CID, in.Body.Dia); err != nil {
						return err
					}
				} else if _, err := tx.Exec(ctx, `DELETE FROM jornada_atletas WHERE competition_id = $1`, in.CID); err != nil {
					return err
				}
				for f, ids := range plan {
					n += len(ids)
					if err := insertarJornada(ctx, tx, in.CID, f, ids); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "horarios.generados", map[string]any{"atletas": n},
					events.Competition(in.CID.String()), events.ForPermission("horarios.publicar")))
			})
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("orden de salida generado", "competicion", in.CID, "atletas", n)
			return s.out(ctx, in.CID)
		})

	type atletasIn struct {
		CID     uuid.UUID `path:"cid"`
		Dia     string    `path:"dia" format:"date"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Atletas []uuid.UUID `json:"atletas" maxItems:"400" doc:"Atletas de la fecha en orden de salida (los que vengan de otra fecha se mueven; vacío y sin fecha = quitar)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-jornada-atletas", Method: http.MethodPut, Path: base + "/jornadas/{dia}/atletas", Summary: "Atletas de una fecha y su orden (mover entre fechas)", Tags: tagAdmin, Security: bearer},
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
			_, err = s.change(ctx, in.CID, in.IfMatch, "", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				existe := false
				for _, d := range cfg.Dias {
					existe = existe || d.Fecha == in.Dia
				}
				asig, err := loadJornadas(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if !existe && len(asig[in.Dia]) == 0 {
					return problem.NotFound("Esa fecha ya no existe.")
				}
				donde := map[uuid.UUID]string{}
				for f, ids := range asig {
					for _, id := range ids {
						donde[id] = f
					}
				}
				seen := map[uuid.UUID]bool{}
				var movidos []string
				for _, id := range in.Body.Atletas {
					if seen[id] {
						return problem.Unprocessable("ATLETA_REPETIDO", "Un atleta aparece dos veces en la fecha.")
					}
					seen[id] = true
					de, estaba := donde[id]
					aqui := estaba && de == in.Dia
					if _, ok := byID[id]; !ok && !aqui {
						return problem.Unprocessable("ATLETA_NO_CONFIRMADO", "Solo puedes asignar atletas confirmados.")
					}
					if !existe && !aqui {
						return problem.Unprocessable("FECHA_BORRADA", "Esa fecha ya no está en los ajustes: mueve a sus atletas a otra.")
					}
					if !aqui {
						if de == "" {
							de = "sin fecha"
						}
						movidos = append(movidos, fmt.Sprintf("movió a %s de %s a %s", byID[id].Nombre, de, in.Dia))
					}
				}
				quitados := 0
				for _, id := range asig[in.Dia] {
					if !seen[id] {
						quitados++
					}
				}
				switch {
				case len(movidos) == 1 && quitados == 0:
					accion = movidos[0]
				case len(movidos) > 1:
					accion = fmt.Sprintf("movió %d atletas al %s", len(movidos), in.Dia)
				case quitados > 0:
					accion = fmt.Sprintf("quitó %d atleta(s) del %s", quitados, in.Dia)
				default:
					accion = "reordenó el " + in.Dia
				}
				if _, err := tx.Exec(ctx, `DELETE FROM jornada_atletas WHERE competition_id = $1 AND (dia = $2 OR atleta_id = ANY($3))`, in.CID, in.Dia, in.Body.Atletas); err != nil {
					return err
				}
				if err := insertarJornada(ctx, tx, in.CID, in.Dia, in.Body.Atletas); err != nil {
					return err
				}
				// Keep the lots of the dates that lost someone consecutive.
				_, err = tx.Exec(ctx, `UPDATE jornada_atletas j SET orden = x.n FROM (
					SELECT atleta_id, row_number() OVER (PARTITION BY dia ORDER BY orden) AS n FROM jornada_atletas WHERE competition_id = $1) x
					WHERE j.competition_id = $1 AND j.atleta_id = x.atleta_id AND j.orden <> x.n`, in.CID)
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
			Items []AgendaItem `json:"items" maxItems:"60"`
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
		Dia  string    `path:"dia" format:"date"`
		Body Directo
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-jornada-directo", Method: http.MethodPut, Path: base + "/jornadas/{dia}/directo", Summary: "Estado en directo de una fecha publicada (en curso, retraso)", Tags: tagAdmin, Security: bearer},
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
			if err := s.setDirecto(ctx, in.CID, in.Dia, in.Body, "horarios"); err != nil {
				return nil, err
			}
			return &struct{ Body Directo }{in.Body}, nil
		})
}

func insertarJornada(ctx context.Context, tx pgx.Tx, cid uuid.UUID, dia string, ids []uuid.UUID) error {
	for i, id := range ids {
		if _, err := tx.Exec(ctx, `INSERT INTO jornada_atletas (competition_id, atleta_id, dia, orden) VALUES ($1,$2,$3,$4)
			ON CONFLICT (competition_id, atleta_id) DO UPDATE SET dia = EXCLUDED.dia, orden = EXCLUDED.orden`, cid, id, dia, i+1); err != nil {
			return err
		}
	}
	return nil
}

// setDirecto stores the live state of a published date and announces it (public: no personal data).
func (s *Svc) setDirecto(ctx context.Context, cid uuid.UUID, dia string, d Directo, origen string) error {
	v, err := s.versionPublicada(ctx, s.a.DB, cid)
	if err != nil {
		return err
	}
	var sd *SnapDia
	if v != nil {
		sd = v.Snapshot.dia(dia)
	}
	if sd == nil {
		return problem.NotFound("Esa fecha no está en los horarios publicados.")
	}
	loc := s.loc(ctx, cid)
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO directo_jornada (competition_id, dia, estado, retraso_min) VALUES ($1,$2,$3,$4)
			ON CONFLICT (competition_id, dia) DO UPDATE SET estado = EXCLUDED.estado, retraso_min = EXCLUDED.retraso_min, updated_at = now()`, cid, dia, d.Estado, d.RetrasoMin); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "horarios.jornada", map[string]any{"dia": dia, "estado": d.Estado,
			"retrasoMin": d.RetrasoMin, "inicioEstimado": hhmm(sd.Inicio.Add(time.Duration(d.RetrasoMin)*time.Minute), loc), "origen": origen},
			events.Competition(cid.String()), events.Audience(events.Public), events.Subject(dia)))
	})
	if err == nil {
		s.bump(ctx, cid)
		if e := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/jornadas/"+dia+"/retraso", map[string]int{"retrasoMin": d.RetrasoMin}, nil); e != nil {
			s.a.Log.Warn("retraso de la jornada en athletes", "dia", dia, "err", e)
		}
	}
	return err
}

// JornadaInfo is a date of the event for other services (juegos creates one matchday per date).
type JornadaInfo struct {
	Fecha     string      `json:"fecha" format:"date"`
	Orden     int         `json:"orden" doc:"1 = primera fecha"`
	Prueba    string      `json:"prueba" doc:"aep2, aep3 o vacío"`
	Inicio    time.Time   `json:"inicio"`
	Fin       time.Time   `json:"fin" doc:"Fin estimado"`
	Publicada bool        `json:"publicada" doc:"Los atletas vienen de la versión publicada (si no, del borrador)"`
	Atletas   []uuid.UUID `json:"atletas" doc:"En orden de salida"`
	Estado    string      `json:"estado" enum:"programado,en_curso,finalizado"`
}

// registerInternal: live and juegos read the published dates; live drives their live state.
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
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-jornadas", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/horarios/jornadas", Summary: "Fechas del evento con sus atletas (solo servicios)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *cidOnly) (*struct{ Body []JornadaInfo }, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			out, err := s.jornadas(ctx, in.CID)
			return &struct{ Body []JornadaInfo }{out}, err
		})
	type dirIn struct {
		CID  uuid.UUID `path:"cid"`
		Dia  string    `path:"dia" format:"date"`
		Body Directo
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-directo", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/horarios/jornadas/{dia}/directo", Summary: "Estado en directo de una fecha (solo live)", Tags: []string{"Interno"}, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *dirIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			return nil, s.setDirecto(ctx, in.CID, in.Dia, in.Body, "directo")
		})
}

// jornadas lists the configured dates with the athletes of the published version (or of the draft when that date
// is not published yet).
func (s *Svc) jornadas(ctx context.Context, cid uuid.UUID) ([]JornadaInfo, error) {
	if err := s.ensureConfig(ctx, cid); err != nil {
		return nil, err
	}
	cfg, _, _, _, err := loadConfig(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	asig, err := loadJornadas(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	dir, err := loadDirecto(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	v, err := s.versionPublicada(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	loc := s.loc(ctx, cid)
	out := []JornadaInfo{}
	for i, d := range cfg.Dias {
		j := JornadaInfo{Fecha: d.Fecha, Orden: i + 1, Prueba: pruebaDeDia(cfg.Dias, i), Atletas: asig[d.Fecha], Estado: "programado"}
		if v != nil {
			if sd := v.Snapshot.dia(d.Fecha); sd != nil && len(sd.Atletas) > 0 {
				j.Publicada, j.Atletas = true, make([]uuid.UUID, len(sd.Atletas))
				for k, a := range sd.Atletas {
					j.Atletas[k] = a.ID
				}
			}
		}
		if j.Atletas == nil {
			j.Atletas = []uuid.UUID{}
		}
		j.Inicio, j.Fin, _, _ = tiempos(cfg, loc, d, len(j.Atletas))
		if x, ok := dir[d.Fecha]; ok {
			j.Estado = x.Estado
		}
		out = append(out, j)
	}
	return out, nil
}

// validarDias checks the dates: valid, start before end, the break inside the day, no repeated dates.
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
