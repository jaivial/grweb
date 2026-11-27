package athletes

// «Handling gratis»: el atleta pide que el equipo de GR Strength le asigne un handler. Es una solicitud más
// («solicitudes_atleta», tipo «handling») enlazada al atleta: se pide desde el área, desde la casilla del alta
// (se crea al aprobarla) y el equipo la aprueba o la rechaza con un motivo desde el backoffice.

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// HandlingAtleta is the latest «handling gratis» request of an athlete (the column of the list and the ficha).
type HandlingAtleta struct {
	ID     uuid.UUID `json:"id"`
	Estado string    `json:"estado" enum:"pendiente,revision,aprobada,rechazada"`
	Fecha  time.Time `json:"fecha"`
	Motivo string    `json:"motivo,omitempty"`
}

// vivo: the request is still waiting for the team.
func (h HandlingAtleta) vivo() bool { return h.Estado == "pendiente" || h.Estado == "revision" }

// HandlingEstado is what the athlete area shows of their handling request.
type HandlingEstado struct {
	Estado      string     `json:"estado" enum:"ninguna,pendiente,revision,aprobada,rechazada"`
	Fecha       *time.Time `json:"fecha,omitempty"`
	SolicitudID *uuid.UUID `json:"solicitudId,omitempty"`
	Motivo      string     `json:"motivo,omitempty"`
}

const selHandling = `SELECT match_atleta_id, id, estado, created_at, motivo_rechazo FROM solicitudes_atleta
	WHERE competition_id = $1 AND tipo = 'handling'`

// handlingDe reads the latest handling request of an athlete (nil without one).
func handlingDe(ctx context.Context, q querier, cid, atleta uuid.UUID) *HandlingAtleta {
	rows, err := q.Query(ctx, selHandling+` AND match_atleta_id = $2 ORDER BY created_at DESC LIMIT 1`, cid, atleta)
	if err != nil {
		return nil
	}
	defer rows.Close()
	if !rows.Next() {
		return nil
	}
	return scanHandling(rows)
}

// handlingPor maps every athlete of the competition to their latest handling request.
func handlingPor(ctx context.Context, q querier, cid uuid.UUID) map[uuid.UUID]HandlingAtleta {
	out := map[uuid.UUID]HandlingAtleta{}
	rows, err := q.Query(ctx, selHandling+` AND match_atleta_id IS NOT NULL ORDER BY created_at DESC`, cid)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var atleta uuid.UUID
		var h HandlingAtleta
		if err := rows.Scan(&atleta, &h.ID, &h.Estado, &h.Fecha, &h.Motivo); err != nil {
			return out
		}
		if _, ok := out[atleta]; !ok { // newest first: the first one wins
			out[atleta] = h
		}
	}
	return out
}

// scanHandling reads a row of selHandling.
func scanHandling(rows pgx.Rows) *HandlingAtleta {
	var atleta uuid.UUID
	var h HandlingAtleta
	if err := rows.Scan(&atleta, &h.ID, &h.Estado, &h.Fecha, &h.Motivo); err != nil {
		return nil
	}
	return &h
}

// estadoHandling is the state the athlete area shows: none, waiting for the team, approved or rejected.
func (s *Svc) estadoHandling(ctx context.Context, cid, atleta uuid.UUID) HandlingEstado {
	e := HandlingEstado{Estado: "ninguna"}
	h := handlingDe(ctx, s.a.DB, cid, atleta)
	if h == nil {
		return e
	}
	e.Estado, e.Fecha, e.SolicitudID = h.Estado, &h.Fecha, &h.ID
	if h.Estado == "rechazada" {
		e.Motivo = h.Motivo
	}
	return e
}

// creaHandling creates the pending handling request of an athlete and queues its notices: the athlete
// («handling-recibida») and the team («handler-solicitud», GRS Coaching). A live request is a 409.
func (s *Svc) creaHandling(ctx context.Context, tx pgx.Tx, cid uuid.UUID, r row, origen string) (uuid.UUID, error) {
	id := newID()
	para := emailDe(r)
	_, err := tx.Exec(ctx, `INSERT INTO solicitudes_atleta (id, competition_id, tipo, match_atleta_id, match_tipo, nombre, apellidos, email, telefono, sexo, fecha_nacimiento, estado)
		VALUES ($1,$2,'handling',$3,'manual',$4,$5,$6,$7,$8,$9,'pendiente')`, id, cid, r.ID, r.Nombre, r.Apellidos, para, r.Telefono, r.Sexo, r.FechaNacimiento)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return uuid.Nil, problem.Conflict("HANDLING_EN_CURSO", "Ya tienes una solicitud de handling en revisión. Te avisaremos por email.")
		}
		return uuid.Nil, err
	}
	if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_creada",
		map[string]any{"id": id, "nombre": r.Nombre, "tipo": "handling"},
		events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
		return uuid.Nil, err
	}
	v := map[string]string{"nombre": r.Nombre, "urlArea": s.webURL + "/area-atleta?vista=handling"}
	if para != "" {
		if err := email(ctx, tx, cid, para, "handling-recibida", v); err != nil {
			return uuid.Nil, err
		}
		if r.Telefono != "" && waAceptado(ctx, tx, cid, r.ID) {
			if err := whatsapp(ctx, tx, cid, r.Telefono, false, "handling-recibida", v, ""); err != nil {
				return uuid.Nil, err
			}
		}
	}
	// The team that assigns the handler (GRS Coaching), the same recipients as always.
	aviso := varsHandler(r, origen)
	if err := email(ctx, tx, cid, handlerEmail, "handler-solicitud", aviso); err != nil {
		return uuid.Nil, err
	}
	if err := whatsapp(ctx, tx, cid, handlerWhatsApp, false, "handler-solicitud", aviso, ""); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// apruebaHandling closes a handling request as approved and tells the athlete.
func (s *Svc) apruebaHandling(ctx context.Context, cid, id uuid.UUID, ifm string, avisarEmail, avisarWhatsApp bool, por string) (*AprobarOut, error) {
	out := &AprobarOut{}
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		if sol.MatchAtletaID == nil {
			return problem.Unprocessable("SIN_ATLETA", "La solicitud de handling no está enlazada a un atleta.")
		}
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET estado = 'aprobada', revisado_at = now(), revisado_por = $3,
			version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`, cid, id, por); err != nil {
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_aprobada",
			map[string]any{"id": id, "atletaId": *sol.MatchAtletaID, "nombre": sol.Nombre, "tipo": "handling"},
			events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		if err := hist(ctx, tx, *sol.MatchAtletaID, "Solicitud de handling aprobada", "revisado por "+por); err != nil {
			return err
		}
		out.Body.AtletaID = *sol.MatchAtletaID
		para, tel := contactoActual(ctx, tx, sol)
		v := map[string]string{"nombre": sol.Nombre, "urlArea": s.webURL + "/area-atleta?vista=handling"}
		if avisarEmail && para != "" {
			if err := email(ctx, tx, cid, para, "handling-aprobada", v); err != nil {
				return err
			}
		}
		if avisarWhatsApp && tel != "" && waAceptado(ctx, tx, cid, *sol.MatchAtletaID) {
			if err := whatsapp(ctx, tx, cid, tel, false, "handling-aprobada", v, ""); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.a.Log.Info("solicitud de handling aprobada", "id", id.String(), "revisor", por)
	return out, nil
}

// emailDe is the email of an athlete (its column is nullable).
func emailDe(r row) string {
	if r.Email == nil {
		return ""
	}
	return *r.Email
}

// registerAreaHandling is the «Handling gratis» tile of the athlete area: read its state and ask for it.
func (s *Svc) registerAreaHandling() {
	api := s.a.API
	base := "/api/area-atleta"
	type cookieIn struct {
		Session string `cookie:"gr_area"`
	}
	type handlingOut struct{ Body HandlingEstado }

	huma.Register(api, huma.Operation{OperationID: "area-handling", Method: http.MethodGet, Path: base + "/handling",
		Summary: "Mi solicitud de handling gratis", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*handlingOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			return &handlingOut{Body: s.estadoHandling(ctx, r.CompetitionID, r.ID)}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "area-handling-pedir", Method: http.MethodPost, Path: base + "/handling",
		Summary: "Pedir handling gratis (una sola solicitud viva)", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*handlingOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if l, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "handling", r.ID.String()), 5, 24*time.Hour); !l.Allowed {
				return nil, problem.TooMany("Has pedido handling varias veces hoy. Escríbenos si necesitas ayuda.")
			}
			if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				_, err := s.creaHandling(ctx, tx, r.CompetitionID, r, "Área de atleta · «Handling gratis»")
				return err
			}); err != nil {
				return nil, err
			}
			return &handlingOut{Body: s.estadoHandling(ctx, r.CompetitionID, r.ID)}, nil
		})
}
