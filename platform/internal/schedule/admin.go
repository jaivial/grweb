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

func (s *Svc) registerAdmin() {
	api := s.a.API
	huma.Register(api, huma.Operation{OperationID: "horarios-get", Method: http.MethodGet, Path: base, Summary: "Planificador: flights, atletas sin flight, conflictos y versión publicada", Tags: tagAdmin, Security: bearer},
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
				_, err := tx.Exec(ctx, `UPDATE config SET max_por_flight = $2, plataformas = $3, orden = $4, separar_sexo = $5, min_por_atleta = $6, descanso_min = $7,
					pesaje_antes_min = $8, pesaje_duracion_min = $9, mesas_pesaje = $10, dias = $11 WHERE competition_id = $1`,
					in.CID, c.MaxPorFlight, c.Plataformas, c.Orden, c.SepararSexo, c.MinPorAtleta, c.DescansoMin, c.PesajeAntesMin, c.PesajeDuracionMin, c.MesasPesaje, c.Dias)
				return err
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
			MaxPorFlight int    `json:"maxPorFlight,omitempty" minimum:"2" maximum:"30"`
			Plataformas  int    `json:"plataformas,omitempty" minimum:"1" maximum:"4"`
			Orden        string `json:"orden,omitempty" enum:"total,categoria"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-generar", Method: http.MethodPost, Path: base + "/generar", Summary: "Generar los flights automáticamente (sustituye el borrador)", Tags: tagAdmin, Security: bearer},
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
			loc := s.loc(ctx, in.CID)
			n := 0
			_, err = s.change(ctx, in.CID, in.IfMatch, "generó los flights automáticamente", func(tx pgx.Tx) error {
				cfg, _, _, _, err := loadConfig(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if b := in.Body; b.MaxPorFlight > 0 || b.Plataformas > 0 || b.Orden != "" {
					if b.MaxPorFlight > 0 {
						cfg.MaxPorFlight = b.MaxPorFlight
					}
					if b.Plataformas > 0 {
						cfg.Plataformas = b.Plataformas
					}
					if b.Orden != "" {
						cfg.Orden = b.Orden
					}
					if _, err := tx.Exec(ctx, `UPDATE config SET max_por_flight = $2, plataformas = $3, orden = $4 WHERE competition_id = $1`, in.CID, cfg.MaxPorFlight, cfg.Plataformas, cfg.Orden); err != nil {
						return err
					}
				}
				plan := generar(cfg, loc, ats)
				n = len(plan)
				if err := s.reemplazar(ctx, tx, in.CID, cfg, plan); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "horarios.generados", map[string]any{"flights": len(plan), "atletas": len(ats)},
					events.Competition(in.CID.String()), events.ForPermission("horarios.publicar")))
			})
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("flights generados", "competicion", in.CID, "flights", n, "atletas", len(ats))
			return s.out(ctx, in.CID)
		})

	type flightIn struct {
		Dia          string `json:"dia,omitempty" format:"date"`
		Plataforma   int    `json:"plataforma,omitempty" minimum:"1" maximum:"4"`
		Inicio       string `json:"inicio,omitempty" pattern:"^[0-2][0-9]:[0-5][0-9]$" doc:"Hora local"`
		DuracionMin  int    `json:"duracionMin,omitempty" minimum:"10" maximum:"600"`
		PesajeInicio string `json:"pesajeInicio,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$" doc:"Hora local (mismo día)"`
		PesajeFin    string `json:"pesajeFin,omitempty" pattern:"^([0-2][0-9]:[0-5][0-9])?$"`
	}
	type crearIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    flightIn
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-flight-crear", Method: http.MethodPost, Path: base + "/flights", Summary: "Crear un flight vacío", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *crearIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			loc := s.loc(ctx, in.CID)
			_, err := s.change(ctx, in.CID, in.IfMatch, "creó un flight", func(tx pgx.Tx) error {
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
					// After the last flight of the day.
					var fin *time.Time
					if err := tx.QueryRow(ctx, `SELECT max(inicio + duracion_min * interval '1 minute') FROM flights WHERE competition_id = $1 AND dia = $2`, in.CID, b.Dia).Scan(&fin); err != nil {
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
				if b.Plataforma == 0 {
					b.Plataforma = 1
				}
				if b.DuracionMin == 0 {
					b.DuracionMin = cfg.MaxPorFlight * cfg.MinPorAtleta
				}
				pi, pf := pesaje(cfg, ini)
				_, err = tx.Exec(ctx, `INSERT INTO flights (id, competition_id, dia, codigo, plataforma, inicio, duracion_min, pesaje_inicio, pesaje_fin) VALUES ($1,$2,$3,'?',$4,$5,$6,$7,$8)`,
					newID(), in.CID, b.Dia, b.Plataforma, ini, b.DuracionMin, pi, pf)
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
		Body    flightIn
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-flight-editar", Method: http.MethodPatch, Path: base + "/flights/{id}", Summary: "Cambiar día, hora, plataforma, duración o pesaje de un flight", Tags: tagAdmin, Security: bearer},
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
				var f flightRow
				if err := tx.QueryRow(ctx, `SELECT id, codigo, dia, plataforma, duracion_min, inicio, pesaje_inicio, pesaje_fin FROM flights WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).
					Scan(&f.ID, &f.Codigo, &f.Dia, &f.Plataforma, &f.DuracionMin, &f.Inicio, &f.PesajeIni, &f.PesajeFn); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Ese flight ya no existe.")
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
					return problem.Unprocessable("PESAJE_INVALIDO", "El pesaje tiene que terminar después de empezar y antes de que salga el flight.")
				}
				if b.Plataforma > 0 {
					f.Plataforma = b.Plataforma
				}
				if b.DuracionMin > 0 {
					f.DuracionMin = b.DuracionMin
				}
				accion = "cambió el horario del flight " + f.Codigo
				_, err = tx.Exec(ctx, `UPDATE flights SET dia = $3, inicio = $4, plataforma = $5, duracion_min = $6, pesaje_inicio = $7, pesaje_fin = $8, updated_at = now()
					WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, dia, ini, f.Plataforma, f.DuracionMin, pi, pf)
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
	huma.Register(api, huma.Operation{OperationID: "horarios-flight-borrar", Method: http.MethodDelete, Path: base + "/flights/{id}", Summary: "Borrar un flight (sus atletas quedan sin flight)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *borrarIn) (*borradorOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "horarios.publicar"); err != nil {
				return nil, err
			}
			_, err := s.change(ctx, in.CID, in.IfMatch, "borró un flight", func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `DELETE FROM flights WHERE competition_id = $1 AND id = $2`, in.CID, in.ID)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("Ese flight ya no existe.")
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
			Atletas []uuid.UUID `json:"atletas" maxItems:"40" doc:"Atletas del flight en orden de lote (los que vengan de otro flight se mueven)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-flight-atletas", Method: http.MethodPut, Path: base + "/flights/{id}/atletas", Summary: "Atletas de un flight y su orden (mover entre flights)", Tags: tagAdmin, Security: bearer},
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
				var codigo string
				if err := tx.QueryRow(ctx, `SELECT codigo FROM flights WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&codigo); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Ese flight ya no existe.")
					}
					return err
				}
				// Where everyone is now (to describe the move and keep withdrawn athletes that were already here).
				rows, err := tx.Query(ctx, `SELECT fa.atleta_id, fa.flight_id, f.codigo FROM flight_atletas fa JOIN flights f ON f.id = fa.flight_id WHERE fa.competition_id = $1`, in.CID)
				if err != nil {
					return err
				}
				type pos struct {
					flight uuid.UUID
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
				for _, id := range in.Body.Atletas {
					if seen[id] {
						return problem.Unprocessable("ATLETA_REPETIDO", "Un atleta aparece dos veces en el flight.")
					}
					seen[id] = true
					p, aqui := donde[id]
					aqui = aqui && p.flight == in.ID
					if _, ok := byID[id]; !ok && !aqui {
						return problem.Unprocessable("ATLETA_NO_CONFIRMADO", "Solo puedes asignar atletas confirmados.")
					}
					if !aqui {
						de := "sin flight"
						if p.codigo != "" {
							de = p.codigo
						}
						movidos = append(movidos, fmt.Sprintf("movió a %s de %s a %s", byID[id].Nombre, de, codigo))
					}
				}
				quitados := 0
				for a, p := range donde {
					if p.flight == in.ID && !seen[a] {
						quitados++
					}
				}
				switch {
				case len(movidos) == 1 && quitados == 0:
					accion = movidos[0]
				case len(movidos) > 1:
					accion = fmt.Sprintf("movió %d atletas al flight %s", len(movidos), codigo)
				case quitados > 0:
					accion = fmt.Sprintf("quitó %d atleta(s) del flight %s", quitados, codigo)
				default:
					accion = "reordenó el flight " + codigo
				}
				if _, err := tx.Exec(ctx, `DELETE FROM flight_atletas WHERE competition_id = $1 AND (flight_id = $2 OR atleta_id = ANY($3))`, in.CID, in.ID, in.Body.Atletas); err != nil {
					return err
				}
				for i, id := range in.Body.Atletas {
					if _, err := tx.Exec(ctx, `INSERT INTO flight_atletas (flight_id, competition_id, atleta_id, orden) VALUES ($1,$2,$3,$4)`, in.ID, in.CID, id, i+1); err != nil {
						return err
					}
				}
				// Keep the lots of the flights that lost someone consecutive.
				_, err = tx.Exec(ctx, `UPDATE flight_atletas fa SET orden = x.n FROM (
					SELECT flight_id, atleta_id, row_number() OVER (PARTITION BY flight_id ORDER BY orden) AS n FROM flight_atletas WHERE competition_id = $1) x
					WHERE fa.flight_id = x.flight_id AND fa.atleta_id = x.atleta_id AND fa.orden <> x.n`, in.CID)
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
	huma.Register(api, huma.Operation{OperationID: "horarios-flight-directo", Method: http.MethodPut, Path: base + "/flights/{id}/directo", Summary: "Estado en directo de un flight publicado (en curso, retraso)", Tags: tagAdmin, Security: bearer},
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

// setDirecto stores the live state of a published flight and announces it (public: no personal data).
func (s *Svc) setDirecto(ctx context.Context, cid, id uuid.UUID, d Directo, origen string) error {
	v, err := s.versionPublicada(ctx, s.a.DB, cid)
	if err != nil {
		return err
	}
	var f *SnapFlight
	if v != nil {
		f = v.Snapshot.flight(id)
	}
	if f == nil {
		return problem.NotFound("Ese flight no está en los horarios publicados.")
	}
	loc := s.loc(ctx, cid)
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO directo (flight_id, competition_id, estado, retraso_min) VALUES ($1,$2,$3,$4)
			ON CONFLICT (flight_id) DO UPDATE SET estado = EXCLUDED.estado, retraso_min = EXCLUDED.retraso_min, updated_at = now()`, id, cid, d.Estado, d.RetrasoMin); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "horarios.flight", map[string]any{"flightId": id, "codigo": f.Codigo, "estado": d.Estado,
			"retrasoMin": d.RetrasoMin, "inicioEstimado": hhmm(f.Inicio.Add(time.Duration(d.RetrasoMin)*time.Minute), loc), "origen": origen},
			events.Competition(cid.String()), events.Audience(events.Public), events.Subject(f.Codigo)))
	})
	if err == nil {
		s.bump(ctx, cid)
		if e := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/flights/"+f.Codigo+"/retraso", map[string]int{"retrasoMin": d.RetrasoMin}, nil); e != nil {
			s.a.Log.Warn("retraso del flight en athletes", "flight", f.Codigo, "err", e)
		}
	}
	return err
}

// registerInternal: live reads the published flights (athletes in lot order) and drives their live state.
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
	type dirIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body Directo
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-horarios-directo", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/horarios/flights/{id}/directo", Summary: "Estado en directo de un flight (solo live)", Tags: []string{"Interno"}, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *dirIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			return nil, s.setDirecto(ctx, in.CID, in.ID, in.Body, "directo")
		})
}

// reemplazar swaps the whole draft for a generated plan (agenda and settings stay).
func (s *Svc) reemplazar(ctx context.Context, tx pgx.Tx, cid uuid.UUID, cfg Config, plan []planFlight) error {
	if _, err := tx.Exec(ctx, `DELETE FROM flights WHERE competition_id = $1`, cid); err != nil {
		return err
	}
	for _, p := range plan {
		id := newID()
		pi, pf := pesaje(cfg, p.Inicio)
		if _, err := tx.Exec(ctx, `INSERT INTO flights (id, competition_id, dia, codigo, plataforma, inicio, duracion_min, pesaje_inicio, pesaje_fin) VALUES ($1,$2,$3,'?',$4,$5,$6,$7,$8)`,
			id, cid, p.Dia, p.Plataforma, p.Inicio, p.Duracion, pi, pf); err != nil {
			return err
		}
		for i, a := range p.Atletas {
			if _, err := tx.Exec(ctx, `INSERT INTO flight_atletas (flight_id, competition_id, atleta_id, orden) VALUES ($1,$2,$3,$4)`, id, cid, a, i+1); err != nil {
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
