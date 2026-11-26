package crm

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
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

// AvisoEvento is a row of the «Avísame» list (GRS Cup 3 · «Contactos» › «GRS Cup 3»).
type AvisoEvento struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Nombre    string    `json:"nombre"`
	CreadoAt  time.Time `json:"creadoAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const selAviso = `SELECT id, email, nombre, creado_at, updated_at FROM avisos_evento`

// validarEmail normalises the address and rejects anything that is not a plain email (same rule as /api/avisos-evento).
func validarEmail(raw string) (string, error) {
	e := strings.ToLower(strings.TrimSpace(raw))
	if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
		return "", problem.Unprocessable("EMAIL_INVALIDO", "Escribe un email válido.")
	}
	return e, nil
}

// registerAvisosEventoAdmin manages the contacts of «Avísame» from the backoffice: list them with search, add one by
// hand, correct its email or name and remove it. The public form keeps writing to the same table.
func (s *Svc) registerAvisosEventoAdmin() {
	api := s.a.API
	type listaIn struct {
		CID    uuid.UUID `path:"cid"`
		Evento string    `query:"evento" default:"grscup-3" pattern:"^[a-z0-9-]{2,40}$"`
		Q      string    `query:"q" maxLength:"100"`
		Pagina int       `query:"pagina" minimum:"1" default:"1"`
		Por    int       `query:"por" minimum:"1" maximum:"200" default:"25"`
	}
	type listaOut struct {
		Body struct {
			Items  []AvisoEvento `json:"items"`
			Total  int           `json:"total"`
			Pagina int           `json:"pagina"`
			Por    int           `json:"por"`
			Evento string        `json:"evento"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "avisos-evento-list", Method: http.MethodGet, Path: baseC + "/avisos-evento", Summary: "Contactos avisados de un evento (GRS Cup 3)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.ver"); err != nil {
				return nil, err
			}
			where, args := `competicion_id = $1 AND evento = $2`, []any{in.CID, in.Evento}
			if q := strings.TrimSpace(in.Q); q != "" {
				args = append(args, "%"+strings.ToLower(q)+"%")
				where += ` AND (lower(nombre) LIKE $3 OR email LIKE $3)`
			}
			o := &listaOut{}
			o.Body.Pagina, o.Body.Por, o.Body.Evento = in.Pagina, in.Por, in.Evento
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM avisos_evento WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selAviso+` WHERE `+where+fmt.Sprintf(` ORDER BY creado_at DESC, id LIMIT %d OFFSET %d`, o.Body.Por, (in.Pagina-1)*o.Body.Por), args...)
			if err != nil {
				return nil, err
			}
			if o.Body.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[AvisoEvento]); err != nil {
				return nil, err
			}
			return o, nil
		})

	type crearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Evento string `json:"evento,omitempty" maxLength:"40"`
			Email  string `json:"email" maxLength:"254"`
			Nombre string `json:"nombre,omitempty" maxLength:"120"`
		}
	}
	type avisoOut struct {
		Body AvisoEvento
	}
	huma.Register(api, huma.Operation{OperationID: "avisos-evento-admin-crear", Method: http.MethodPost, Path: baseC + "/avisos-evento", Summary: "Añadir un contacto avisado a mano", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *crearIn) (*avisoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			em, err := validarEmail(in.Body.Email)
			if err != nil {
				return nil, err
			}
			evento := strings.TrimSpace(in.Body.Evento)
			if evento == "" {
				evento = "grscup-3"
			}
			o := &avisoOut{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				err := tx.QueryRow(ctx, `INSERT INTO avisos_evento (competicion_id, evento, email, nombre) VALUES ($1,$2,$3,$4)
					ON CONFLICT (competicion_id, evento, email) DO NOTHING
					RETURNING id, email, nombre, creado_at, updated_at`,
					in.CID, evento, em, strings.TrimSpace(in.Body.Nombre)).Scan(&o.Body.ID, &o.Body.Email, &o.Body.Nombre, &o.Body.CreadoAt, &o.Body.UpdatedAt)
				if db.IsNoRows(err) {
					return problem.Conflict("AVISO_DUPLICADO", "Ese email ya está apuntado a este aviso.")
				}
				if err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.aviso_evento_creado", map[string]any{"id": o.Body.ID, "evento": evento},
					events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
			if err != nil {
				return nil, err
			}
			return o, nil
		})

	type editarIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Email  *string `json:"email,omitempty" maxLength:"254"`
			Nombre *string `json:"nombre,omitempty" maxLength:"120"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "avisos-evento-admin-editar", Method: http.MethodPatch, Path: baseC + "/avisos-evento/{id}", Summary: "Corregir el email o el nombre de un contacto avisado", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *editarIn) (*avisoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			var em *string
			if in.Body.Email != nil {
				e, err := validarEmail(*in.Body.Email)
				if err != nil {
					return nil, err
				}
				em = &e
			}
			var nombre *string
			if in.Body.Nombre != nil {
				n := strings.TrimSpace(*in.Body.Nombre)
				nombre = &n
			}
			o := &avisoOut{}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				err := tx.QueryRow(ctx, `UPDATE avisos_evento SET email = COALESCE($3, email), nombre = COALESCE($4, nombre), updated_at = now()
					WHERE competicion_id = $1 AND id = $2 RETURNING id, email, nombre, creado_at, updated_at`,
					in.CID, in.ID, em, nombre).Scan(&o.Body.ID, &o.Body.Email, &o.Body.Nombre, &o.Body.CreadoAt, &o.Body.UpdatedAt)
				if db.IsNoRows(err) {
					return problem.NotFound("Ese contacto avisado no existe.")
				}
				if db.IsUniqueViolation(err, "") {
					return problem.Conflict("AVISO_DUPLICADO", "Ese email ya está apuntado a este aviso.")
				}
				if err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.aviso_evento_editado", map[string]any{"id": o.Body.ID},
					events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
			if err != nil {
				return nil, err
			}
			return o, nil
		})

	huma.Register(api, huma.Operation{OperationID: "avisos-evento-admin-borrar", Method: http.MethodDelete, Path: baseC + "/avisos-evento/{id}", Summary: "Quitar un contacto avisado", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var em string
				err := tx.QueryRow(ctx, `DELETE FROM avisos_evento WHERE competicion_id = $1 AND id = $2 RETURNING email`, in.CID, in.ID).Scan(&em)
				if db.IsNoRows(err) {
					return problem.NotFound("Ese contacto avisado no existe.")
				}
				if err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.aviso_evento_borrado", map[string]any{"id": in.ID},
					events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
		})
}
