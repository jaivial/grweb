package juegos

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// avisoSolicitud tells the host of a GRS Fantasy room, by email and (if his account has a phone) by WhatsApp, that
// someone asked to join it. One notice per player and room (sala_solicitudes.anfitrion_avisado_at): asking again
// after cancelling does not repeat it. The host's contact comes from fans (internal call); an account that
// unsubscribed from the notices gets nothing. An error retries the event (the mark is written with the requests).
func (s *Svc) avisoSolicitud(ctx context.Context, cid uuid.UUID, data json.RawMessage) error {
	var d struct {
		SolicitudID uuid.UUID `json:"solicitudId"`
		Tipo        string    `json:"tipo"`
	}
	if json.Unmarshal(data, &d) != nil || d.Tipo != "pendiente" || d.SolicitudID == uuid.Nil {
		return nil
	}
	var salaID, anfitrion uuid.UUID
	var alias, nombre string
	err := s.a.DB.QueryRow(ctx, `SELECT s.id, s.anfitrion_fan_id, ss.alias, s.nombre FROM sala_solicitudes ss JOIN salas s ON s.id = ss.sala_id
		WHERE ss.id = $1 AND ss.estado = 'pendiente' AND ss.anfitrion_avisado_at IS NULL`, d.SolicitudID).Scan(&salaID, &anfitrion, &alias, &nombre)
	if db.IsNoRows(err) {
		return nil // already answered, cancelled or notified
	}
	if err != nil {
		return err
	}
	var c struct {
		Email    string `json:"email"`
		Telefono string `json:"telefono"`
		Avisos   bool   `json:"avisos"`
		Baja     string `json:"baja"`
	}
	if err := s.fansSv.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/fans/"+anfitrion.String()+"/contacto-avisos", nil, &c); err != nil {
		var p *problem.Error
		if errors.As(err, &p) && p.Status == http.StatusNotFound {
			return nil // the host's account no longer exists
		}
		return err
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE sala_solicitudes SET anfitrion_avisado_at = now() WHERE id = $1 AND estado = 'pendiente' AND anfitrion_avisado_at IS NULL`, d.SolicitudID)
		if err != nil || tag.RowsAffected() == 0 || !c.Avisos {
			return err
		}
		vars := map[string]string{"alias": alias, "sala": nombre, "enlace": s.webURL + "/fantasy/salas/" + salaID.String() + "#solicitudes", "baja": c.Baja}
		if c.Email != "" {
			if err := events.Enqueue(ctx, tx, events.New(ctx, "juegos.email_solicitado", map[string]any{"para": c.Email, "plantilla": plantillaSolicitud, "vars": vars},
				events.Competition(cid.String()), events.Audience(events.Internal))); err != nil {
				return err
			}
		}
		if c.Telefono == "" {
			return nil
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "juegos.whatsapp_solicitado", map[string]any{"para": c.Telefono, "plantilla": plantillaSolicitud, "vars": vars},
			events.Competition(cid.String()), events.Audience(events.Internal)))
	})
}

const plantillaSolicitud = "fantasy-sala-solicitud"
