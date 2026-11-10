// http.go: the public endpoints of juegos (contract §6.6), behind the fan session (cookie grcup_fan or the
// X-GrCup-Fan header for the load test) when they touch a wallet, and public otherwise.
package juegos

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagJuegos = []string{"Juegos"}

// sesionFan reads and verifies the fan session of a request (contract §3).
type sesionFan struct {
	Session string `cookie:"grcup_fan" maxLength:"4096"`
	Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
}

func (s *Svc) fan(ctx context.Context, cid uuid.UUID, in *sesionFan) (fanauth.Fan, error) {
	tok := in.Session
	if tok == "" {
		tok = in.Header
	}
	f, err := s.fans.Verify(ctx, tok)
	if err != nil {
		return fanauth.Fan{}, fanauth.Problem(err)
	}
	if f.CompetitionID != cid {
		return fanauth.Fan{}, problem.Forbidden("Tu sesión de directo no es de esta competición.")
	}
	return f, nil
}

// fanOpcional returns the fan when a valid session travels with the request (uuid.Nil otherwise), so public
// views show «mi puesto» and «es mío» to logged fans without blocking anonymous readers.
func (s *Svc) fanOpcional(ctx context.Context, cid uuid.UUID, in *sesionFan) (uuid.UUID, error) {
	tok := in.Session
	if tok == "" {
		tok = in.Header
	}
	if tok == "" {
		return uuid.Nil, nil
	}
	f, err := s.fans.Verify(ctx, tok)
	if err != nil {
		return uuid.Nil, fanauth.Problem(err)
	}
	if f.CompetitionID != cid {
		return uuid.Nil, problem.Forbidden("Tu sesión de directo no es de esta competición.")
	}
	return f.ID, nil
}

// requireAny follows the pattern of the other services (live, schedule).
func requireAny(ctx context.Context, cid uuid.UUID, msg string, perms ...string) (*auth.Principal, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return nil, err
	}
	for _, k := range perms {
		if p.Can(cid.String(), k) {
			return p, nil
		}
	}
	return nil, problem.Forbidden(msg)
}

// jornadaPublica resolves the jornada of a request: the given id, else the active one.
func (s *Svc) jornadaPublica(ctx context.Context, cid, jid uuid.UUID) (*jornada, error) {
	if jid != uuid.Nil {
		j, err := scanJornada(s.a.DB.QueryRow(ctx, selJornada+" FROM jornadas WHERE id = $1 AND competition_id = $2", jid, cid))
		if db.IsNoRows(err) {
			return nil, problem.NotFound("Jornada no encontrada.")
		}
		return &j, err
	}
	j, err := s.jornadaActiva(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	if j == nil {
		return nil, problem.NotFound("No hay jornada activa hoy.")
	}
	return j, nil
}

// jornadaOut is one jornada of the list.
type jornadaOut struct {
	ID     uuid.UUID `json:"id"`
	Dia    string    `json:"dia"`
	Nombre string    `json:"nombre"`
	Estado string    `json:"estado" enum:"borrador,abierta,en_juego,cerrada"`
}

// apuestaVista is one bet of mis-apuestas.
type apuestaVista struct {
	ID        uuid.UUID `json:"id"`
	MercadoID uuid.UUID `json:"mercadoId"`
	Mercado   string    `json:"mercado"`
	AtletaID  uuid.UUID `json:"atletaId"`
	Atleta    string    `json:"atleta"`
	Importe   int64     `json:"importe"`
	Estado    string    `json:"estado" enum:"abierto,cerrado,liquidado"`
	// Devuelto está a true cuando el bote del mercado volvió a las apuestas (nadie acertó al ganador o el staff
	// anuló el mercado): la apuesta recuperó su importe (contract §6.2).
	Devuelto  bool   `json:"devuelto,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// carteraOut is the response of GET /juegos/cartera.
type carteraOut struct {
	Body struct {
		Porra   int64 `json:"porra"`
		Fantasy int64 `json:"fantasy"`
		// PendienteFantasy is what a refund could not take back (the wallet never goes below zero): the debt
		// stays noted and visible to the fan (contract §5 «si no, lo deja anotado»).
		PendienteFantasy int64             `json:"pendienteFantasy"`
		Movimientos      []movimientoVista `json:"movimientos"`
	}
}

type movimientoVista struct {
	Importe   int64  `json:"importe"`
	Motivo    string `json:"motivo"`
	Moneda    string `json:"moneda" enum:"porra,fantasy"`
	CreatedAt string `json:"createdAt"`
}

func (s *Svc) registerPublic() {
	api := s.a.API
	base := "/api/competiciones/{slug}/juegos"

	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type jornadaIn struct {
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
	}
	type jidIn struct {
		Slug string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JID  uuid.UUID `path:"jid"`
	}
	type fanJornadaIn struct {
		Session   string    `cookie:"grcup_fan" maxLength:"4096"`
		Header    string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
	}

	// ---- jornadas ----
	type jornadasOut struct {
		Body struct {
			Jornadas []jornadaOut `json:"jornadas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-jornadas", Method: http.MethodGet, Path: base + "/jornadas",
		Summary: "Jornadas de juegos (pasadas, activa y futuras)", Tags: tagJuegos},
		func(ctx context.Context, in *slugIn) (*jornadasOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT id, dia::text, nombre, estado FROM jornadas WHERE competition_id = $1 ORDER BY dia DESC`, c.ID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &jornadasOut{}
			o.Body.Jornadas = []jornadaOut{}
			for rows.Next() {
				var j jornadaOut
				if err := rows.Scan(&j.ID, &j.Dia, &j.Nombre, &j.Estado); err != nil {
					return nil, err
				}
				o.Body.Jornadas = append(o.Body.Jornadas, j)
			}
			return o, rows.Err()
		})

	// The jornada detail: estado and athletes with clause and owner (public alias, contract §6.6).
	type jornadaDetalleOut struct {
		Body struct {
			Jornada jornadaOut      `json:"jornada"`
			Atletas []atletaMercado `json:"atletas"`
			// Mejores: heaviest good lift of squat, bench and deadlift per sex + weight class (porra and bonuses).
			Mejores []mejoresCategoria `json:"mejores"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-jornada", Method: http.MethodGet, Path: base + "/jornadas/{jid}",
		Summary: "Una jornada: estado y atletas con cláusula y nota", Tags: tagJuegos},
		func(ctx context.Context, in *jidIn) (*jornadaDetalleOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			j, err := scanJornada(s.a.DB.QueryRow(ctx, selJornada+" FROM jornadas WHERE id = $1 AND competition_id = $2", in.JID, c.ID))
			if db.IsNoRows(err) {
				return nil, problem.NotFound("Jornada no encontrada.")
			}
			if err != nil {
				return nil, err
			}
			o := &jornadaDetalleOut{}
			o.Body.Jornada = jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Atletas, err = s.mercadoFantasy(ctx, c.ID, j, uuid.Nil, uuid.Nil)
			if err != nil {
				return nil, err
			}
			o.Body.Mejores = []mejoresCategoria{}
			if m, err := s.marcador(ctx, c.ID, j.Dia); err == nil { // cached 1 s, the market above just read it
				o.Body.Mejores = mejoresPorCategoria(m)
			}
			return o, nil
		})

	// ---- porra ----
	type mercadosOut struct {
		Body struct {
			Jornada  *jornadaOut    `json:"jornada,omitempty"`
			Mercados []mercadoVista `json:"mercados"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-porra-mercados", Method: http.MethodGet, Path: base + "/porra/mercados",
		Summary: "Mercados de la porra con bote y cuotas en vivo", Tags: tagJuegos},
		func(ctx context.Context, in *jornadaIn) (*mercadosOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			ms, err := s.mercadosVista(ctx, c.ID, j)
			if err != nil {
				return nil, err
			}
			o := &mercadosOut{}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Mercados = ms
			return o, nil
		})

	// POST apuestas (fan session; contract §6.2: open market, min and max, saldo, atomic spend).
	type apuestaIn struct {
		Session string `cookie:"grcup_fan" maxLength:"4096"`
		Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body    struct {
			MercadoID uuid.UUID `json:"mercadoId"`
			AtletaID  uuid.UUID `json:"atletaId"`
			Importe   int64     `json:"importe" minimum:"1" maximum:"1000000"`
			Jornada   uuid.UUID `json:"jornada,omitempty"`
		}
	}
	type apuestaOut struct {
		Body struct {
			ApuestaID uuid.UUID `json:"apuestaId"`
			Saldo     int64     `json:"saldo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-porra-apostar", Method: http.MethodPost, Path: base + "/porra/apuestas",
		Summary: "Apostar monedas de porra en un mercado", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *apuestaIn) (*apuestaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.Body.Jornada)
			if err != nil {
				return nil, err
			}
			cfg, err := configJuegos(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			o := &apuestaOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				aid, err := s.apostarTx(ctx, tx, c.ID, *j, cfg, f.ID, f.Alias, in.Body.MercadoID, in.Body.AtletaID, in.Body.Importe)
				if err != nil {
					return err
				}
				o.Body.ApuestaID = aid
				o.Body.Saldo, err = abrirCarteraTx(ctx, tx, *j, f.ID, Porra)
				return err
			})
			if err != nil {
				return nil, err
			}
			s.eventoClasificacion(ctx, c.ID, j.ID)
			return o, nil
		})

	// mis-apuestas (fan session).
	type misApuestasIn struct {
		Session   string    `cookie:"grcup_fan" maxLength:"4096"`
		Header    string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
	}
	type misApuestasOut struct {
		Body struct {
			Apuestas []apuestaVista `json:"apuestas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-porra-mis-apuestas", Method: http.MethodGet, Path: base + "/porra/mis-apuestas",
		Summary: "Mis apuestas de la jornada", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *misApuestasIn) (*misApuestasOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT a.id, a.mercado_id, m.titulo, a.atleta_id, COALESCE(fa.nombre_publico, ''),
				a.importe, m.estado,
				(m.estado = 'liquidado' AND COALESCE((SELECT sum(a2.importe) FROM apuestas a2
					WHERE a2.mercado_id = m.id AND a2.atleta_id = ANY(m.ganador)), 0) = 0),
				a.created_at::text
				FROM apuestas a JOIN mercados m ON m.id = a.mercado_id
				LEFT JOIN fantasy_atletas fa ON fa.jornada_id = a.jornada_id AND fa.atleta_id = a.atleta_id
				WHERE a.jornada_id = $1 AND a.fan_id = $2 ORDER BY a.created_at DESC LIMIT 100`, j.ID, f.ID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &misApuestasOut{}
			o.Body.Apuestas = []apuestaVista{}
			for rows.Next() {
				var v apuestaVista
				if err := rows.Scan(&v.ID, &v.MercadoID, &v.Mercado, &v.AtletaID, &v.Atleta, &v.Importe, &v.Estado, &v.Devuelto, &v.CreatedAt); err != nil {
					return nil, err
				}
				o.Body.Apuestas = append(o.Body.Apuestas, v)
			}
			return o, rows.Err()
		})

	// clasificación de la porra (contract §6.2: saldo, desempate por quién llegó antes; top 50 + mi puesto).
	type clasPorraIn struct {
		Session   string    `cookie:"grcup_fan" maxLength:"4096"`
		Header    string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
	}
	type clasPorraOut struct {
		Body struct {
			Jornada  *jornadaOut       `json:"jornada,omitempty"`
			Top      []filaPorraPublic `json:"top"`
			MiPuesto int               `json:"miPuesto"`
			MiSaldo  int64             `json:"miSaldo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-porra-clasificacion", Method: http.MethodGet, Path: base + "/porra/clasificacion",
		Summary: "Clasificación de la porra (top 50 y mi puesto)", Tags: tagJuegos, Description: descSesionFanOpcional},
		func(ctx context.Context, in *clasPorraIn) (*clasPorraOut, error) {
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
			o := &clasPorraOut{}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			top, miPuesto := s.rankingPorra(ctx, *j, fanID)
			o.Body.Top = publicaPorra(top)
			o.Body.MiPuesto = miPuesto
			if fanID != uuid.Nil {
				_ = s.a.DB.QueryRow(ctx, `SELECT saldo FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'porra'`, j.ID, fanID).Scan(&o.Body.MiSaldo)
			}
			return o, nil
		})

	// ---- fantasy (BIZ-143: todo dentro de una sala; la del fan o la de ?sala=) ----
	type fantasyIn struct {
		Session   string    `cookie:"grcup_fan" maxLength:"4096"`
		Header    string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
		SalaID    uuid.UUID `query:"sala" doc:"Sala que se quiere ver; por defecto, la mía de la jornada"`
	}
	type mercadoFantasyOut struct {
		Body struct {
			Jornada *jornadaOut `json:"jornada,omitempty"`
			// Sala is the room the owners belong to; without it (no session or no room) every athlete shows as free.
			Sala       *salaResumen    `json:"sala,omitempty"`
			Atletas    []atletaMercado `json:"atletas"`
			Clausulazo clausulazoVista `json:"clausulazo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-mercado", Method: http.MethodGet, Path: base + "/fantasy/mercado",
		Summary: "Mercado de GRS Fantasy de una sala: atletas, notas, cláusulas, dueños y protección", Tags: tagJuegos, Description: descSesionFanOpcional},
		func(ctx context.Context, in *fantasyIn) (*mercadoFantasyOut, error) {
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
			sl, err := s.salaDeVista(ctx, c.ID, *j, in.SalaID, fanID)
			if err != nil {
				return nil, err
			}
			o := &mercadoFantasyOut{}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Sala = resumenDe(sl)
			salaID := uuid.Nil
			if sl != nil {
				salaID = sl.ID
			}
			if o.Body.Atletas, err = s.mercadoFantasy(ctx, c.ID, *j, salaID, fanID); err != nil {
				return nil, err
			}
			o.Body.Clausulazo = s.horario(ctx, c.ID, j.Dia).clausulazo(time.Now())
			return o, nil
		})

	// mi-equipo (fan session): my lineup in my room, its grade, value, balance and clausulazos.
	type equipoOut struct {
		Body struct {
			Jornada *jornadaOut `json:"jornada,omitempty"`
			// Sala is missing while the fan is in no room: he has to create or join one to play.
			Sala        *salaResumen    `json:"sala,omitempty"`
			Atletas     []atletaMercado `json:"atletas"`
			Alineacion  int             `json:"alineacion" doc:"Tamaño de la alineación (5, sin suplentes)"`
			Nota        float64         `json:"nota" doc:"Media de la alineación"`
			ConNota     int             `json:"conNota" doc:"Atletas con nota: la media es provisional mientras sea menor que 5"`
			Valor       int64           `json:"valor"`
			Saldo       int64           `json:"saldo"`
			Clausulazos int             `json:"clausulazos"`
			Clausulazo  clausulazoVista `json:"clausulazo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-mi-equipo", Method: http.MethodGet, Path: base + "/fantasy/mi-equipo",
		Summary: "Mi equipo de fantasy: alineación, nota, valor, saldo y clausulazos gastados", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *fantasyIn) (*equipoOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
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
			sl, err := miSala(ctx, s.a.DB, j.ID, f.ID)
			if err != nil {
				return nil, err
			}
			o := &equipoOut{}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Sala = resumenDe(sl)
			o.Body.Atletas = []atletaMercado{}
			o.Body.Alineacion = cfg.PlantillaMax
			o.Body.Clausulazo = s.horario(ctx, c.ID, j.Dia).clausulazo(time.Now())
			_ = s.a.DB.QueryRow(ctx, `SELECT saldo FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'fantasy'`, j.ID, f.ID).Scan(&o.Body.Saldo)
			if sl == nil {
				return o, nil
			}
			// Only the clausulazos paid in this room (those of a room he left were undone with it).
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM fichajes WHERE sala_id = $1 AND a_fan = $2 AND tipo = 'clausulazo'`, sl.ID, f.ID).Scan(&o.Body.Clausulazos)
			ats, err := s.mercadoFantasy(ctx, c.ID, *j, sl.ID, f.ID)
			if err != nil {
				return nil, err
			}
			var notas []notaAtleta
			for _, a := range ats {
				if a.EsMio {
					o.Body.Atletas = append(o.Body.Atletas, a)
					o.Body.Valor += a.Clausula
					notas = append(notas, a.Nota)
				}
			}
			o.Body.Nota, o.Body.ConNota = notaAlineacion(notas, max(cfg.PlantillaMax-len(notas), 0), j.Estado == "cerrada")
			return o, nil
		})

	// comprar | vender | clausulazo (fan session, same shape): always in the fan's own room of the jornada.
	type fichajeIn struct {
		Session string `cookie:"grcup_fan" maxLength:"4096"`
		Header  string `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body    struct {
			AtletaID uuid.UUID `json:"atletaId"`
			Jornada  uuid.UUID `json:"jornada,omitempty"`
		}
	}
	type fichajeOut struct {
		Body struct {
			OK    bool  `json:"ok"`
			Saldo int64 `json:"saldo"`
		}
	}
	operar := func(op string) func(ctx context.Context, in *fichajeIn) (*fichajeOut, error) {
		return func(ctx context.Context, in *fichajeIn) (*fichajeOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.Body.Jornada)
			if err != nil {
				return nil, err
			}
			if !j.jugable() {
				return nil, problem.Conflict("JORNADA_NO_JUGABLE", "La jornada no está abierta para jugar.")
			}
			cfg, err := configJuegos(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			sl, err := miSala(ctx, s.a.DB, j.ID, f.ID)
			if err != nil {
				return nil, err
			}
			if sl == nil {
				return nil, problem.Conflict("SIN_SALA", "Crea una sala o entra en una para fichar atletas.")
			}
			o := &fichajeOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				switch op {
				case "comprar":
					err = s.comprarTx(ctx, tx, c.ID, *j, cfg, sl.ID, f.ID, f.Alias, in.Body.AtletaID)
				case "vender":
					err = s.venderTx(ctx, tx, c.ID, *j, cfg, sl.ID, f.ID, f.Alias, in.Body.AtletaID)
				default:
					err = s.clausulazoTx(ctx, tx, c.ID, *j, cfg, s.horario(ctx, c.ID, j.Dia).clausulazo(time.Now()), sl.ID, f.ID, f.Alias, in.Body.AtletaID)
				}
				if err != nil {
					return err
				}
				o.Body.Saldo, err = abrirCarteraTx(ctx, tx, *j, f.ID, Fantasy)
				return err
			})
			if err != nil {
				return nil, err
			}
			o.Body.OK = true
			s.eventoClasificacion(ctx, c.ID, j.ID)
			return o, nil
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-comprar", Method: http.MethodPost, Path: base + "/fantasy/comprar",
		Summary: "Comprar un atleta libre de mi sala por su cláusula", Tags: tagJuegos, Description: descSesionFan}, operar("comprar"))
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-vender", Method: http.MethodPost, Path: base + "/fantasy/vender",
		Summary: "Vender un atleta propio (vuelve al mercado de la sala; cobra precioVenta, la cláusula de la jornada sin la demanda de la sala)", Tags: tagJuegos, Description: descSesionFan}, operar("vender"))
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-clausulazo", Method: http.MethodPost, Path: base + "/fantasy/clausulazo",
		Summary: "Pagar la cláusula de un atleta de otro jugador de mi sala (cerrado desde la última sesión del día)", Tags: tagJuegos, Description: descSesionFan}, operar("clausulazo"))

	// clasificación fantasy de una sala (nota media; desempate valor de alineación → saldo → quién entró antes).
	type clasFantasyOut struct {
		Body struct {
			Jornada  *jornadaOut  `json:"jornada,omitempty"`
			Sala     *salaResumen `json:"sala,omitempty"`
			Filas    []filaSala   `json:"filas"`
			MiPuesto int          `json:"miPuesto"`
			MiNota   float64      `json:"miNota"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-clasificacion", Method: http.MethodGet, Path: base + "/fantasy/clasificacion",
		Summary: "Clasificación de fantasy de una sala (la mía o ?sala=)", Tags: tagJuegos, Description: descSesionFanOpcional},
		func(ctx context.Context, in *fantasyIn) (*clasFantasyOut, error) {
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
			sl, err := s.salaDeVista(ctx, c.ID, *j, in.SalaID, fanID)
			if err != nil {
				return nil, err
			}
			o := &clasFantasyOut{}
			o.Body.Jornada = &jornadaOut{ID: j.ID, Dia: j.Dia, Nombre: j.Nombre, Estado: j.Estado}
			o.Body.Sala = resumenDe(sl)
			o.Body.Filas = []filaSala{}
			if sl == nil {
				return o, nil
			}
			clas, err := s.clasificarSalas(ctx, s.a.DB, c.ID, *j, []*salaRow{sl}, fanID)
			if err != nil {
				return nil, err
			}
			if clas[sl.ID] != nil {
				o.Body.Filas = clas[sl.ID]
			}
			for _, f := range o.Body.Filas {
				if f.EsYo {
					o.Body.MiPuesto, o.Body.MiNota = f.Puesto, f.Nota
				}
			}
			return o, nil
		})

	// GET /fantasy/atletas/{aid}: grade breakdown, attempts and clause history of one athlete.
	type atletaIn struct {
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		AID       uuid.UUID `path:"aid"`
		JornadaID uuid.UUID `query:"jornada"`
	}
	type historialClausula struct {
		Clausula  int64  `json:"clausula"`
		Delta     int64  `json:"delta"`
		Motivo    string `json:"motivo"`
		CreatedAt string `json:"createdAt"`
	}
	type atletaOut struct {
		Body struct {
			Atleta *atletaMercado `json:"atleta" doc:"Con la nota y su desglose (sin dueño: el dueño depende de la sala)"`
			// Intentos are the attempts of the scoreboard by lift (sq, bp, dl): the live events of the grade.
			Intentos map[string][]MarcadorIntento `json:"intentos"`
			// Eventos are the judged attempts in order with their hour, the judges' lights (if the desk sent them)
			// and what each one did to the grade.
			Eventos   []eventoNota        `json:"eventos"`
			Clausulas []historialClausula `json:"clausulas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-fantasy-atleta", Method: http.MethodGet, Path: base + "/fantasy/atletas/{aid}",
		Summary: "Nota de un atleta con su desglose, sus intentos y el historial de la cláusula", Tags: tagJuegos},
		func(ctx context.Context, in *atletaIn) (*atletaOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			ats, err := s.mercadoFantasy(ctx, c.ID, *j, uuid.Nil, uuid.Nil)
			if err != nil {
				return nil, err
			}
			o := &atletaOut{}
			for i := range ats {
				if ats[i].AtletaID == in.AID {
					o.Body.Atleta = &ats[i]
					break
				}
			}
			if o.Body.Atleta == nil {
				return nil, problem.NotFound("Ese atleta no está en la jornada.")
			}
			o.Body.Intentos, o.Body.Eventos = map[string][]MarcadorIntento{}, []eventoNota{}
			if m, err := s.marcador(ctx, c.ID, j.Dia); err == nil {
				for i := range m.Atletas {
					if m.Atletas[i].AtletaID == in.AID && m.Atletas[i].Intentos != nil {
						o.Body.Intentos = m.Atletas[i].Intentos
						if cfg, err := configJuegos(ctx, s.a.DB, c.ID); err == nil {
							o.Body.Eventos = eventosNota(cfg.Puntos, &m.Atletas[i])
						}
					}
				}
			}
			rows, err := s.a.DB.Query(ctx, `SELECT clausula, delta, motivo, created_at::text FROM historial_clausulas
				WHERE jornada_id = $1 AND atleta_id = $2 ORDER BY created_at DESC LIMIT 100`, j.ID, in.AID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o.Body.Clausulas = []historialClausula{}
			for rows.Next() {
				var h historialClausula
				if err := rows.Scan(&h.Clausula, &h.Delta, &h.Motivo, &h.CreatedAt); err != nil {
					return nil, err
				}
				o.Body.Clausulas = append(o.Body.Clausulas, h)
			}
			return o, rows.Err()
		})

	// GET /juegos/cartera: both wallets and the last movements (fan session, contract §6.6).
	type carteraIn struct {
		Session   string    `cookie:"grcup_fan" maxLength:"4096"`
		Header    string    `header:"X-GrCup-Fan" maxLength:"4096"`
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-cartera", Method: http.MethodGet, Path: base + "/cartera",
		Summary: "Mi cartera: saldos de porra y fantasy y últimos movimientos", Tags: tagJuegos, Description: descSesionFan},
		func(ctx context.Context, in *carteraIn) (*carteraOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.fan(ctx, c.ID, &sesionFan{Session: in.Session, Header: in.Header})
			if err != nil {
				return nil, err
			}
			j, err := s.jornadaPublica(ctx, c.ID, in.JornadaID)
			if err != nil {
				return nil, err
			}
			o := &carteraOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if o.Body.Porra, err = abrirCarteraTx(ctx, tx, *j, f.ID, Porra); err != nil {
					return err
				}
				if o.Body.Fantasy, err = abrirCarteraTx(ctx, tx, *j, f.ID, Fantasy); err != nil {
					return err
				}
				// The pending debt of the refunds that could not take the fantasy reward back: it stays noted
				// (contract §5) and the fan can see it in his wallet.
				return tx.QueryRow(ctx, `SELECT COALESCE(sum(pendiente), 0) FROM movimientos
					WHERE jornada_id = $1 AND fan_id = $2 AND moneda = 'fantasy'`, j.ID, f.ID).Scan(&o.Body.PendienteFantasy)
			})
			if err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT importe, motivo, moneda, created_at::text FROM movimientos
				WHERE jornada_id = $1 AND fan_id = $2 ORDER BY created_at DESC LIMIT 50`, j.ID, f.ID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o.Body.Movimientos = []movimientoVista{}
			for rows.Next() {
				var mv movimientoVista
				if err := rows.Scan(&mv.Importe, &mv.Motivo, &mv.Moneda, &mv.CreatedAt); err != nil {
					return nil, err
				}
				o.Body.Movimientos = append(o.Body.Movimientos, mv)
			}
			return o, rows.Err()
		})

	// GET /juegos/premios (contract §6.5): visible prizes of the jornada (porra, fantasy and donantes).
	type premiosIn struct {
		Slug      string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		JornadaID uuid.UUID `query:"jornada"`
		Ranking   string    `query:"ranking" enum:"porra,fantasy,donantes" doc:"Filtra por clasificación"`
	}
	type premiosOut struct {
		Body struct {
			Premios []premioVista `json:"premios"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "juegos-premios", Method: http.MethodGet, Path: base + "/premios",
		Summary: "Premios de la jornada (porra, fantasy y donantes)", Tags: tagJuegos},
		func(ctx context.Context, in *premiosIn) (*premiosOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			var jid any
			if in.JornadaID != uuid.Nil {
				jid = in.JornadaID
			} else {
				j, err := s.jornadaActiva(ctx, s.a.DB, c.ID)
				if err != nil {
					return nil, err
				}
				if j != nil {
					jid = j.ID
				}
			}
			var rows pgx.Rows
			switch {
			case in.Ranking != "" && jid == nil:
				rows, err = s.a.DB.Query(ctx, `SELECT id, ranking, puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador
					FROM premios WHERE competition_id = $1 AND jornada_id IS NULL AND activo AND ranking = $2 ORDER BY ranking, orden`, c.ID, in.Ranking)
			case in.Ranking != "":
				rows, err = s.a.DB.Query(ctx, `SELECT id, ranking, puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador
					FROM premios WHERE competition_id = $1 AND (jornada_id = $2 OR jornada_id IS NULL) AND activo AND ranking = $3 ORDER BY ranking, orden`, c.ID, jid, in.Ranking)
			case jid == nil:
				rows, err = s.a.DB.Query(ctx, `SELECT id, ranking, puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador
					FROM premios WHERE competition_id = $1 AND jornada_id IS NULL AND activo ORDER BY ranking, orden`, c.ID)
			default:
				rows, err = s.a.DB.Query(ctx, `SELECT id, ranking, puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador
					FROM premios WHERE competition_id = $1 AND (jornada_id = $2 OR jornada_id IS NULL) AND activo ORDER BY ranking, orden`, c.ID, jid)
			}
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			o := &premiosOut{}
			o.Body.Premios = []premioVista{}
			for rows.Next() {
				var p premioVista
				if err := rows.Scan(&p.ID, &p.Ranking, &p.PuestoDesde, &p.PuestoHasta, &p.Titulo, &p.Descripcion, &p.ImagenURL, &p.ValorTexto, &p.Patrocinador); err != nil {
					return nil, err
				}
				o.Body.Premios = append(o.Body.Premios, p)
			}
			return o, rows.Err()
		})
}
