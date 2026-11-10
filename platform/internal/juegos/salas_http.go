// salas_http.go: the public endpoints of the fantasy rooms (BIZ-143): lobby, create, room detail, invitation link,
// join requests, host actions and palmarés. Writes need the fan session; the lobby and the palmarés are public.
package juegos

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// salaResumen is the room a fantasy view is scoped to.
type salaResumen struct {
	ID     uuid.UUID `json:"id"`
	Nombre string    `json:"nombre"`
	Estado string    `json:"estado" enum:"abierta,en_juego,cancelada,cerrada,finalizada"`
}

func resumenDe(sl *salaRow) *salaResumen {
	if sl == nil {
		return nil
	}
	return &salaResumen{ID: sl.ID, Nombre: sl.Nombre, Estado: sl.Estado}
}

// solicitudVista is one request in the host's tray.
type solicitudVista struct {
	ID        uuid.UUID `json:"id"`
	Alias     string    `json:"alias"`
	CreatedAt time.Time `json:"createdAt"`
}

// errEmpezada is the 409 of every room change once the first session of the day has started.
var errEmpezada = problem.Conflict("SALA_EMPEZADA", "La jornada ya ha empezado: no se pueden crear salas, entrar, salir ni cambiar jugadores.")

// atletasDelDia counts the athletes of the day (the scoreboard, or what was already synced if it is down).
func (s *Svc) atletasDelDia(ctx context.Context, cid uuid.UUID, j jornada) int {
	if m, err := s.marcador(ctx, cid, j.Dia); err == nil {
		return len(m.Atletas)
	}
	var n int
	_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM fantasy_atletas WHERE jornada_id = $1`, j.ID).Scan(&n)
	return n
}

// salaPublica reads a room of the competition with its jornada.
func (s *Svc) salaPublica(ctx context.Context, cid, salaID uuid.UUID) (*salaRow, *jornada, error) {
	sl, err := scanSala(s.a.DB.QueryRow(ctx, selSala+` WHERE s.id = $1 AND s.competition_id = $2`, salaID, cid))
	if db.IsNoRows(err) {
		return nil, nil, errSalaNoExiste
	}
	if err != nil {
		return nil, nil, err
	}
	j, err := scanJornada(s.a.DB.QueryRow(ctx, selJornada+" FROM jornadas WHERE id = $1", sl.JornadaID))
	return sl, &j, err
}

// salaPorCodigo resolves an invitation code to its room and the jornada of that room (not today's): the preview
// and the entry of a link must agree.
func (s *Svc) salaPorCodigo(ctx context.Context, cid uuid.UUID, codigo string) (*salaRow, *jornada, error) {
	var sid uuid.UUID
	err := s.a.DB.QueryRow(ctx, `SELECT id FROM salas WHERE codigo = upper($1) AND competition_id = $2`, codigo, cid).Scan(&sid)
	if db.IsNoRows(err) {
		return nil, nil, problem.NotFound("El enlace de invitación no es válido o ha caducado.")
	}
	if err != nil {
		return nil, nil, err
	}
	return s.salaPublica(ctx, cid, sid)
}

// salaVisible: a room that is not public («solo enlace») does not exist for whoever is not one of its members
// (the invitation link has its own preview). Returns the room or errSalaNoExiste.
func (s *Svc) salaVisible(ctx context.Context, sl *salaRow, fanID uuid.UUID) (*salaRow, error) {
	if sl.Publica {
		return sl, nil
	}
	var miembro bool
	if err := s.a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sala_miembros WHERE sala_id = $1 AND fan_id = $2)`, sl.ID, fanID).Scan(&miembro); err != nil {
		return nil, err
	}
	if !miembro {
		return nil, errSalaNoExiste
	}
	return sl, nil
}

// salaDeVista resolves the room of a fantasy view: the one asked for (?sala=, if the fan may see it) or the fan's
// own (nil = none).
func (s *Svc) salaDeVista(ctx context.Context, cid uuid.UUID, j jornada, salaID, fanID uuid.UUID) (*salaRow, error) {
	if salaID == uuid.Nil {
		return miSala(ctx, s.a.DB, j.ID, fanID)
	}
	sl, err := scanSala(s.a.DB.QueryRow(ctx, selSala+` WHERE s.id = $1 AND s.jornada_id = $2`, salaID, j.ID))
	if db.IsNoRows(err) {
		return nil, errSalaNoExiste
	}
	if err != nil {
		return nil, err
	}
	return s.salaVisible(ctx, sl, fanID)
}

func (s *Svc) registerSalas() {
	api := s.a.API
	base := "/api/competiciones/{slug}/juegos/fantasy"

	// antesDeEmpezar opens a room write of a jornada: the fan session, a playable jornada and a day not started.
	antesDeEmpezar := func(ctx context.Context, slug string, ses *sesionFan, jid, salaID uuid.UUID) (uuid.UUID, *jornada, fanauth.Fan, error) {
		c, err := s.comps.Public(ctx, slug)
		if err != nil {
			return uuid.Nil, nil, fanauth.Fan{}, err
		}
		f, err := s.fan(ctx, c.ID, ses)
		if err != nil {
			return uuid.Nil, nil, f, err
		}
		var j *jornada
		if salaID != uuid.Nil {
			_, j, err = s.salaPublica(ctx, c.ID, salaID)
		} else {
			j, err = s.jornadaPublica(ctx, c.ID, jid)
		}
		if err != nil {
			return uuid.Nil, nil, f, err
		}
		if !j.jugable() {
			return uuid.Nil, nil, f, problem.Conflict("JORNADA_NO_JUGABLE", "La jornada no está abierta para jugar.")
		}
		if s.horario(ctx, c.ID, j.Dia).empezado(*j, time.Now()) {
			return uuid.Nil, nil, f, errEmpezada
		}
		return c.ID, j, f, nil
	}

	// ---- lobby ----
	type lobbyIn struct {
		Session   string    `cookie:"grcup_fan" maxLength:"4096"`
		Header    string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
		Buscar    string    `query:"q" maxLength:"32" doc:"Busca por nombre de sala (sin tildes ni mayúsculas)"`
	}
	type lobbyOut struct {
		Body struct {
			Jornada   *jornadaOut `json:"jornada,omitempty"`
			Salas     []salaVista `json:"salas"`
			MiSala    *uuid.UUID  `json:"miSala,omitempty" doc:"Mi sala de hoy, si estoy en una"`
			Atletas   int         `json:"atletas" doc:"Atletas del día"`
			PlazasMax int         `json:"plazasMax" doc:"Plazas de una sala nueva: atletas ÷ 5, máximo 10"`
			// PuedeCrear is false when there are not enough athletes for a 2-player room or the day has started.
			PuedeCrear            bool `json:"puedeCrear"`
			Empezada              bool `json:"empezada" doc:"La primera sesión del día ya empezó"`
			SolicitudesMax        int  `json:"solicitudesMax"`
			SolicitudesPendientes int  `json:"solicitudesPendientes"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-salas", Method: http.MethodGet, Path: base + "/salas",
		Summary: "Lobby: salas de la jornada con quién va ganando y su alineación", Tags: tagJuegos, Description: descSesionFanOpcional},
		func(ctx context.Context, in *lobbyIn) (*lobbyOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			fanID, err := s.fanOpcional(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			o := &lobbyOut{}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			if o.Body.Salas, err = s.lobby(ctx, c.ID, *j, fanID, in.Buscar); err != nil {
				return nil, err
			}
			if mia, err := miSala(ctx, s.a.DB, j.ID, fanID); err != nil {
				return nil, err
			} else if mia != nil {
				o.Body.MiSala = &mia.ID
			}
			o.Body.Atletas = s.atletasDelDia(ctx, c.ID, *j)
			var hayPlazas bool
			o.Body.PlazasMax, hayPlazas = plazasSala(o.Body.Atletas, cfg.PlantillaMax)
			o.Body.Empezada = s.horario(ctx, c.ID, j.Dia).empezado(*j, time.Now())
			o.Body.PuedeCrear = hayPlazas && !o.Body.Empezada && j.jugable()
			o.Body.SolicitudesMax = maxSolicitudes
			if fanID != uuid.Nil {
				_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM sala_solicitudes WHERE jornada_id = $1 AND fan_id = $2 AND estado = 'pendiente'`, j.ID, fanID).Scan(&o.Body.SolicitudesPendientes)
			}
			return o, nil
		})

	// ---- crear ----
	type crearIn struct {
		Session string `cookie:"grcup_fan" maxLength:"4096"`
		Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body    struct {
			Nombre  string    `json:"nombre" minLength:"3" maxLength:"64"`
			Publica *bool     `json:"publica,omitempty" doc:"Por defecto true; false = solo con enlace"`
			Jornada uuid.UUID `json:"jornada,omitempty"`
		}
	}
	type salaIDOut struct {
		Body struct {
			SalaID uuid.UUID `json:"salaId"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-sala-crear", Method: http.MethodPost, Path: base + "/salas",
		Summary: "Crear una sala (quien la crea es el anfitrión)", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *crearIn) (*salaIDOut, error) {
			cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, in.Body.Jornada, uuid.Nil)
			if err != nil {
				return nil, err
			}
			nombre, err := validarNombreSala(in.Body.Nombre)
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, cid)
			if err != nil {
				return nil, err
			}
			atletas := s.atletasDelDia(ctx, cid, *j)
			plazas, ok := plazasSala(atletas, cfg.PlantillaMax)
			if !ok {
				return nil, problem.Conflict("ATLETAS_INSUFICIENTES", "Hoy no hay atletas suficientes para una sala: hay "+itoa(atletas)+" y hacen falta al menos "+itoa(2*cfg.PlantillaMax)+".")
			}
			o := &salaIDOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				sl, err := crearSalaTx(ctx, tx, cid, *j, f.ID, f.Alias, nombre, in.Body.Publica == nil || *in.Body.Publica, plazas)
				if err != nil {
					return err
				}
				o.Body.SalaID = sl.ID
				return nil
			})
			return o, err
		})

	// ---- detalle ----
	type salaIn struct {
		Session string    `cookie:"grcup_fan" maxLength:"4096"`
		Header  string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		SID     uuid.UUID `path:"sid"`
	}
	type salaOut struct {
		Body struct {
			Jornada jornadaOut `json:"jornada"`
			Sala    salaVista  `json:"sala"`
			Filas   []filaSala `json:"filas" doc:"Clasificación de la sala con las alineaciones"`
			// Codigo is the invitation code (only for the members): the link is /fantasy/unirse/{codigo}.
			Codigo      string           `json:"codigo,omitempty"`
			Solicitudes []solicitudVista `json:"solicitudes" doc:"Solicitudes pendientes (solo las ve el anfitrión)"`
			Clausulazo  clausulazoVista  `json:"clausulazo"`
			Empezada    bool             `json:"empezada"`
			PlazasMax   int              `json:"plazasMax"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-sala", Method: http.MethodGet, Path: base + "/salas/{sid}",
		Summary: "Una sala: jugadores, clasificación, alineaciones, invitación y solicitudes", Tags: tagJuegos, Description: descSesionFanOpcional},
		func(ctx context.Context, in *salaIn) (*salaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			fanID, err := s.fanOpcional(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			sl, j, err := s.salaPublica(ctx, c.ID, in.SID)
			if err != nil {
				return nil, err
			}
			if _, err := s.salaVisible(ctx, sl, fanID); err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			clas, err := s.clasificarSalas(ctx, s.a.DB, c.ID, *j, []*salaRow{sl}, fanID)
			if err != nil {
				return nil, err
			}
			sols, err := misSolicitudes(ctx, s.a.DB, j.ID, fanID)
			if err != nil {
				return nil, err
			}
			o := &salaOut{}
			o.Body.Jornada = jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Filas = clas[sl.ID]
			if o.Body.Filas == nil {
				o.Body.Filas = []filaSala{}
			}
			miembro := false
			for _, f := range o.Body.Filas {
				miembro = miembro || f.EsYo
			}
			o.Body.Sala = vistaDe(sl, o.Body.Filas, miembro, sols[sl.ID])
			if miembro {
				o.Body.Codigo = sl.Codigo
			}
			o.Body.Solicitudes = []solicitudVista{}
			if fanID != uuid.Nil && fanID == sl.Anfitrion {
				rows, err := s.a.DB.Query(ctx, `SELECT id, alias, created_at FROM sala_solicitudes WHERE sala_id = $1 AND estado = 'pendiente' ORDER BY created_at`, sl.ID)
				if err != nil {
					return nil, err
				}
				defer rows.Close()
				for rows.Next() {
					var v solicitudVista
					if err := rows.Scan(&v.ID, &v.Alias, &v.CreatedAt); err != nil {
						return nil, err
					}
					o.Body.Solicitudes = append(o.Body.Solicitudes, v)
				}
				if err := rows.Err(); err != nil {
					return nil, err
				}
			}
			h := s.horario(ctx, c.ID, j.Dia)
			o.Body.Clausulazo = h.clausulazo(time.Now())
			o.Body.Empezada = h.empezado(*j, time.Now())
			o.Body.PlazasMax, _ = plazasSala(s.atletasDelDia(ctx, c.ID, *j), cfg.PlantillaMax)
			return o, nil
		})

	// ---- invitación: vista previa y entrada directa ----
	type codigoIn struct {
		Session string `cookie:"grcup_fan" maxLength:"4096"`
		Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Codigo  string `path:"codigo" pattern:"^[A-Za-z0-9]{6,16}$"`
	}
	type invitacionOut struct {
		Body struct {
			Jornada jornadaOut `json:"jornada"`
			Sala    salaVista  `json:"sala"`
			// Estado says what the link can do for this fan right now.
			Estado string `json:"estado" enum:"disponible,sin_sesion,ya_miembro,otra_sala,llena,empezada,cerrada,expulsado"`
			// SolicitudesPendientes are the requests of the fan that entering would cancel.
			SolicitudesPendientes int `json:"solicitudesPendientes"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-invitacion", Method: http.MethodGet, Path: base + "/invitaciones/{codigo}",
		Summary: "Vista previa de un enlace de invitación (404 si no es válido o se regeneró)", Tags: tagJuegos, Description: descSesionFanOpcional},
		func(ctx context.Context, in *codigoIn) (*invitacionOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			fanID, err := s.fanOpcional(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			sl, j, err := s.salaPorCodigo(ctx, c.ID, in.Codigo)
			if err != nil {
				return nil, err
			}
			clas, err := s.clasificarSalas(ctx, s.a.DB, c.ID, *j, []*salaRow{sl}, fanID)
			if err != nil {
				return nil, err
			}
			sols, err := misSolicitudes(ctx, s.a.DB, j.ID, fanID)
			if err != nil {
				return nil, err
			}
			o := &invitacionOut{}
			o.Body.Jornada = jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			miembro := false
			for _, f := range clas[sl.ID] {
				miembro = miembro || f.EsYo
			}
			o.Body.Sala = vistaDe(sl, clas[sl.ID], miembro, sols[sl.ID])
			for _, e := range sols {
				if e == "pendiente" {
					o.Body.SolicitudesPendientes++
				}
			}
			otra, err := miSala(ctx, s.a.DB, j.ID, fanID)
			if err != nil {
				return nil, err
			}
			switch {
			case miembro:
				o.Body.Estado = "ya_miembro"
			case sl.Estado == "cerrada" || sl.Estado == "cancelada" || sl.Estado == "finalizada" || j.Estado == "cerrada":
				o.Body.Estado = "cerrada"
			case sl.Estado == "en_juego" || s.horario(ctx, c.ID, j.Dia).empezado(*j, time.Now()):
				o.Body.Estado = "empezada"
			case sols[sl.ID] == "expulsada":
				o.Body.Estado = "expulsado"
			case len(clas[sl.ID]) >= sl.Plazas:
				o.Body.Estado = "llena"
			case fanID == uuid.Nil:
				o.Body.Estado = "sin_sesion"
			case otra != nil:
				o.Body.Estado = "otra_sala"
			default:
				o.Body.Estado = "disponible"
			}
			return o, nil
		})

	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-invitacion-entrar", Method: http.MethodPost, Path: base + "/invitaciones/{codigo}/entrar",
		Summary: "Entrar en una sala con el enlace del anfitrión (directo, sin aprobación)", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *codigoIn) (*salaIDOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			// The jornada is the one of the room of the code, like the preview: a link of another day still works.
			sala, _, err := s.salaPorCodigo(ctx, c.ID, in.Codigo)
			if err != nil {
				return nil, err
			}
			cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, uuid.Nil, sala.ID)
			if err != nil {
				return nil, err
			}
			o := &salaIDOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				sl, err := unirsePorCodigoTx(ctx, tx, cid, *j, f.ID, f.Alias, in.Codigo)
				if err != nil {
					return err
				}
				o.Body.SalaID = sl.ID
				return nil
			})
			return o, err
		})

	// ---- solicitudes ----
	type solicitudOut struct {
		Body struct {
			SolicitudID uuid.UUID `json:"solicitudId"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-sala-solicitar", Method: http.MethodPost, Path: base + "/salas/{sid}/solicitudes",
		Summary: "Solicitar unirse a una sala pública (la aprueba el anfitrión)", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *salaIn) (*solicitudOut, error) {
			cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, uuid.Nil, in.SID)
			if err != nil {
				return nil, err
			}
			o := &solicitudOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				o.Body.SolicitudID, err = solicitarTx(ctx, tx, cid, *j, in.SID, f.ID, f.Alias)
				return err
			})
			return o, err
		})

	// accion registers a 204 write on a room that runs before the day starts.
	accion := func(id, metodo, ruta, resumen string, fn func(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, f fanauth.Fan, in *salaIn) error) {
		huma.Register(api, huma.Operation{OperationID: id, Method: metodo, Path: base + ruta,
			Summary: resumen, Tags: tagJuegos, Description: descSesionFan, DefaultStatus: http.StatusNoContent},
			func(ctx context.Context, in *salaIn) (*struct{}, error) {
				cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, uuid.Nil, in.SID)
				if err != nil {
					return nil, err
				}
				return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return fn(ctx, tx, cid, *j, f, in) })
			})
	}
	accion("juegos-fantasy-sala-solicitud-cancelar", http.MethodDelete, "/salas/{sid}/solicitudes/mia", "Cancelar mi solicitud pendiente",
		func(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, f fanauth.Fan, in *salaIn) error {
			return cancelarSolicitudTx(ctx, tx, cid, j, in.SID, f.ID)
		})
	accion("juegos-fantasy-sala-salir", http.MethodPost, "/salas/{sid}/salir", "Salir de la sala (mis atletas vuelven al mercado; el anfitrión pasa al más antiguo)",
		func(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, f fanauth.Fan, in *salaIn) error {
			return salirTx(ctx, tx, cid, j, in.SID, f.ID)
		})
	accion("juegos-fantasy-sala-cerrar", http.MethodPost, "/salas/{sid}/cerrar", "Cerrar la sala (solo el anfitrión, antes de empezar)",
		func(ctx context.Context, tx pgx.Tx, cid uuid.UUID, j jornada, f fanauth.Fan, in *salaIn) error {
			sl, err := salaDeAnfitrionTx(ctx, tx, j, in.SID, f.ID)
			if err != nil {
				return err
			}
			return cerrarTx(ctx, tx, cid, j, sl, "cerrada", false)
		})

	type responderIn struct {
		Session string    `cookie:"grcup_fan" maxLength:"4096"`
		Header  string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		SID     uuid.UUID `path:"sid"`
		ID      uuid.UUID `path:"id"`
		Body    struct {
			Aceptar bool `json:"aceptar"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-sala-solicitud-responder", Method: http.MethodPost, Path: base + "/salas/{sid}/solicitudes/{id}",
		Summary: "Aceptar o rechazar una solicitud (solo el anfitrión)", Tags: tagJuegos, Description: descSesionFan, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *responderIn) (*struct{}, error) {
			cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, uuid.Nil, in.SID)
			if err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				return responderSolicitudTx(ctx, tx, cid, *j, in.SID, f.ID, in.ID, in.Body.Aceptar)
			})
		})

	type expulsarIn struct {
		Session string    `cookie:"grcup_fan" maxLength:"4096"`
		Header  string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		SID     uuid.UUID `path:"sid"`
		MID     uuid.UUID `path:"mid" doc:"miembroId del jugador"`
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-sala-expulsar", Method: http.MethodDelete, Path: base + "/salas/{sid}/miembros/{mid}",
		Summary: "Expulsar a un jugador (solo el anfitrión, antes de empezar; no puede volver)", Tags: tagJuegos, Description: descSesionFan, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *expulsarIn) (*struct{}, error) {
			cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, uuid.Nil, in.SID)
			if err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return expulsarTx(ctx, tx, cid, *j, in.SID, f.ID, in.MID) })
		})

	// ---- anfitrión: renombrar, ampliar plazas, visibilidad y regenerar el enlace ----
	type patchIn struct {
		Session string    `cookie:"grcup_fan" maxLength:"4096"`
		Header  string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		SID     uuid.UUID `path:"sid"`
		Body    struct {
			Nombre  *string `json:"nombre,omitempty" minLength:"3" maxLength:"64"`
			Plazas  *int    `json:"plazas,omitempty" minimum:"2" maximum:"10" doc:"Entre los jugadores actuales y el máximo del día"`
			Publica *bool   `json:"publica,omitempty"`
			// RegenerarEnlace invalidates the current invitation link and issues a new one.
			RegenerarEnlace bool `json:"regenerarEnlace,omitempty"`
		}
	}
	type patchOut struct {
		Body struct {
			Codigo string `json:"codigo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-sala-editar", Method: http.MethodPatch, Path: base + "/salas/{sid}",
		Summary: "Editar la sala: nombre, plazas, visibilidad o regenerar el enlace (solo el anfitrión)", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *patchIn) (*patchOut, error) {
			cid, j, f, err := antesDeEmpezar(ctx, in.Slug, &sesionFan{Session: in.Session, Header: in.Header}, uuid.Nil, in.SID)
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, cid)
			if err != nil {
				return nil, err
			}
			plazasMax, _ := plazasSala(s.atletasDelDia(ctx, cid, *j), cfg.PlantillaMax)
			o := &patchOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				sl, err := salaDeAnfitrionTx(ctx, tx, *j, in.SID, f.ID)
				if err != nil {
					return err
				}
				b := in.Body
				if b.Nombre != nil {
					if sl.Nombre, err = validarNombreSala(*b.Nombre); err != nil {
						return err
					}
				}
				if b.Plazas != nil {
					var miembros int
					if err := tx.QueryRow(ctx, `SELECT count(*) FROM sala_miembros WHERE sala_id = $1`, sl.ID).Scan(&miembros); err != nil {
						return err
					}
					if *b.Plazas < miembros || *b.Plazas > plazasMax {
						return problem.Unprocessable("PLAZAS_NO_VALIDAS", "Las plazas deben estar entre los jugadores actuales ("+itoa(miembros)+") y el máximo de hoy ("+itoa(plazasMax)+").")
					}
					sl.Plazas = *b.Plazas
				}
				if b.Publica != nil {
					sl.Publica = *b.Publica
				}
				if b.RegenerarEnlace {
					sl.Codigo = nuevoCodigo()
				}
				if _, err := tx.Exec(ctx, `UPDATE salas SET nombre = $2, nombre_norm = $3, plazas = $4, publica = $5, codigo = $6, version = version + 1, updated_at = now() WHERE id = $1`,
					sl.ID, sl.Nombre, normalizarNombre(sl.Nombre), sl.Plazas, sl.Publica, sl.Codigo); err != nil {
					if esUnico(err, "salas_nombre") {
						return problem.Conflict("NOMBRE_OCUPADO", "Ya hay una sala con ese nombre hoy. Elige otro.")
					}
					return err
				}
				o.Body.Codigo = sl.Codigo
				return eventoSala(ctx, tx, cid, j.ID, sl.ID, "editada")
			})
			return o, err
		})

	// ---- palmarés ----
	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type palmaresOut struct {
		Body struct {
			Dias []diaPalmares `json:"dias"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-palmares", Method: http.MethodGet, Path: base + "/palmares",
		Summary: "Palmarés: ganadores de cada sala en las jornadas cerradas", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*palmaresOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			o := &palmaresOut{}
			o.Body.Dias, err = s.palmares(ctx, c.ID)
			return o, err
		})

	type palmaresSalaIn struct {
		Slug string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		SID  uuid.UUID `path:"sid"`
	}
	type palmaresSalaOut struct {
		Body struct {
			Jornada jornadaOut     `json:"jornada"`
			Sala    salaResumen    `json:"sala"`
			Filas   []filaPalmares `json:"filas" doc:"Clasificación final con la alineación y el desglose de cada nota"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-palmares-sala", Method: http.MethodGet, Path: base + "/palmares/{sid}",
		Summary: "Palmarés de una sala: clasificación final, alineaciones y detalle de las notas", Tags: tagJuegos},
		func(ctx context.Context, in *palmaresSalaIn) (*palmaresSalaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			sl, j, err := s.salaPublica(ctx, c.ID, in.SID)
			if err != nil {
				return nil, err
			}
			filas, err := filasPalmares(ctx, s.a.DB, []uuid.UUID{sl.ID}, false)
			if err != nil {
				return nil, err
			}
			o := &palmaresSalaOut{}
			o.Body.Jornada = jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Sala = *resumenDe(sl)
			o.Body.Filas = filas[sl.ID]
			if o.Body.Filas == nil {
				o.Body.Filas = []filaPalmares{}
			}
			return o, nil
		})
}
