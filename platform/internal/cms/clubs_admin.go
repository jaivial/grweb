package cms

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// registerClubsAdmin: Backoffice › Clubs (Figma page 67). A request from /clubs is approved (published in the directory,
// with its role and logo) or rejected with a reason; either way the person who sent it can be told by email. The rest of
// the directory (order, visibility, edits) goes through the generic «clubs» collection.
func (s *Svc) registerClubsAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/clubs/{id}"
	type pendiente struct {
		nombre, contactoNombre, contactoEmail, estado string
	}
	// leer locks the request; only «pendiente» and «rechazado» can be reviewed (a published club is edited, not approved)
	leer := func(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID) (pendiente, error) {
		var p pendiente
		err := tx.QueryRow(ctx, `SELECT nombre, contacto_nombre, contacto_email, estado FROM clubs WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id).
			Scan(&p.nombre, &p.contactoNombre, &p.contactoEmail, &p.estado)
		if err == pgx.ErrNoRows {
			return p, problem.NotFound("Esa solicitud no existe.")
		}
		if err == nil && p.estado != "pendiente" && p.estado != "rechazado" {
			return p, problem.Conflict("YA_REVISADA", "Ese club ya está en el directorio: edítalo en «Clubs asociados».")
		}
		return p, err
	}
	saludo := func(p pendiente) string {
		if n := strings.Fields(p.contactoNombre); len(n) > 0 {
			return n[0]
		}
		return p.nombre
	}

	type aprobarIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Rol     string `json:"rol" enum:"organizador,colaborador,club" default:"club"`
			LogoURL string `json:"logoUrl,omitempty" maxLength:"500"`
			Avisar  bool   `json:"avisar" doc:"Enviar «Tu club ya está en el directorio» a quien lo solicitó"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "clubs-aprobar", Method: http.MethodPost, Path: base + "/aprobar", Summary: "Aprobar una solicitud de club y publicarlo en /clubs", Tags: []string{"Web y contenidos"}, Security: bearer},
		func(ctx context.Context, in *aprobarIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "web.editar")
			if err != nil {
				return nil, err
			}
			logo := strings.TrimSpace(in.Body.LogoURL)
			if logo != "" && !strings.HasPrefix(logo, "https://") && !strings.HasPrefix(logo, "/api/medios/") {
				return nil, problem.Unprocessable("URL_NO_VALIDA", "El logo debe ser una imagen de la biblioteca o un enlace https.")
			}
			var p pendiente
			var nombre string
			_ = s.a.DB.QueryRow(ctx, `SELECT nombre FROM clubs WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&nombre)
			err = s.change(ctx, in.CID, "cms.club_aprobado", map[string]any{"id": in.ID, "nombre": nombre, "rol": in.Body.Rol, "avisar": in.Body.Avisar}, func(tx pgx.Tx) error {
				if p, err = leer(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE clubs SET estado = 'publicado', rol = $3, logo_url = CASE WHEN $4 <> '' THEN $4 ELSE logo_url END, motivo_rechazo = '',
					revisado_at = now(), revisado_por = $5, orden = (SELECT COALESCE(max(orden), 0) + 1 FROM clubs WHERE competition_id = $1 AND estado IN ('publicado', 'oculto')), updated_at = now()
					WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, in.Body.Rol, logo, pr.Name); err != nil {
					return err
				}
				if !in.Body.Avisar || p.contactoEmail == "" {
					return nil
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "cms.email_solicitado", map[string]any{"para": p.contactoEmail, "plantilla": "club-aprobado",
					"vars": map[string]string{"nombre": saludo(p), "club": p.nombre, "enlace": s.webURL + "/clubs"}}, events.Competition(in.CID.String()), events.Audience(events.Internal)))
			})
			return nil, err
		})

	type rechazarIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Motivo string `json:"motivo" minLength:"3" maxLength:"400" doc:"Se guarda; si se avisa, va en el email"`
			Avisar bool   `json:"avisar"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "clubs-rechazar", Method: http.MethodPost, Path: base + "/rechazar", Summary: "Rechazar una solicitud de club con un motivo", Tags: []string{"Web y contenidos"}, Security: bearer},
		func(ctx context.Context, in *rechazarIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "web.editar")
			if err != nil {
				return nil, err
			}
			motivo := strings.TrimSpace(in.Body.Motivo)
			if len([]rune(motivo)) < 3 {
				return nil, problem.Unprocessable("MOTIVO_OBLIGATORIO", "Escribe el motivo del rechazo.")
			}
			var p pendiente
			var nombre string
			_ = s.a.DB.QueryRow(ctx, `SELECT nombre FROM clubs WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&nombre)
			err = s.change(ctx, in.CID, "cms.club_rechazado", map[string]any{"id": in.ID, "nombre": nombre, "avisar": in.Body.Avisar}, func(tx pgx.Tx) error {
				if p, err = leer(ctx, tx, in.CID, in.ID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE clubs SET estado = 'rechazado', motivo_rechazo = $3, revisado_at = now(), revisado_por = $4, updated_at = now()
					WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, motivo, pr.Name); err != nil {
					return err
				}
				if !in.Body.Avisar || p.contactoEmail == "" {
					return nil
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "cms.email_solicitado", map[string]any{"para": p.contactoEmail, "plantilla": "club-rechazado",
					"vars": map[string]string{"nombre": saludo(p), "club": p.nombre, "motivo": motivo}}, events.Competition(in.CID.String()), events.Audience(events.Internal)))
			})
			return nil, err
		})

	// abrir: the first time someone of the team opens a pending request it goes from «Nueva» to «En revisión».
	type abrirIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "clubs-abrir", Method: http.MethodPost, Path: base + "/abrir", Summary: "Marcar una solicitud de club como «En revisión»", Tags: []string{"Web y contenidos"}, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *abrirIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "web.editar")
			if err != nil {
				return nil, err
			}
			var nombre string
			err = s.a.DB.QueryRow(ctx, `UPDATE clubs SET abierta_at = now(), abierta_por = $3 WHERE competition_id = $1 AND id = $2 AND estado = 'pendiente' AND abierta_at IS NULL RETURNING nombre`,
				in.CID, in.ID, pr.Name).Scan(&nombre)
			if err == pgx.ErrNoRows {
				return nil, nil // already in review, reviewed or gone: nothing to do
			}
			if err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "cms.club_en_revision", map[string]any{"id": in.ID, "nombre": nombre}, func(pgx.Tx) error { return nil })
		})
}
