package crm

import (
	"context"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// nombreEvento is the human name of an «Avísame» event (the copy of the confirmation email and the backoffice tab).
func nombreEvento(evento string) string {
	if evento == "grscup-3" {
		return "GRS Cup 3"
	}
	return evento
}

// registerAvisosEvento: BIZ-165 «Avísame» (GRS Cup 3). Stores the email once per event (idempotent, always 202) and
// answers whether it was new, so the card can say «ya estabas en la lista». A new address gets a confirmation email;
// a repeated one gets nothing (GRS3-03).
// The backoffice reads and manages these rows through registerAvisosEventoAdmin (see avisos_evento_admin.go).
func (s *Svc) registerAvisosEvento() {
	type in struct {
		Body struct {
			Competicion string `json:"competicion" pattern:"^[a-z0-9-]{2,41}$"`
			Evento      string `json:"evento" pattern:"^[a-z0-9-]{2,40}$"`
			Email       string `json:"email" maxLength:"254"`
		}
	}
	type out struct {
		Body struct {
			Nuevo bool `json:"nuevo" doc:"true si el email no estaba apuntado todavía"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "avisos-evento-crear", Method: http.MethodPost, Path: "/api/avisos-evento", Summary: "Avísame cuando abra una próxima competición", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, i *in) (*out, error) {
			e := strings.ToLower(strings.TrimSpace(i.Body.Email))
			if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
				return nil, problem.Unprocessable("EMAIL_INVALIDO", "Escribe un email válido.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "aviso-evento", httpx.ClientIPFrom(ctx)), 10, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has hecho varios avisos seguidos. Inténtalo más tarde.")
			}
			c, err := s.comps.Public(ctx, i.Body.Competicion)
			if err != nil {
				return nil, err
			}
			o := &out{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var id string
				err := tx.QueryRow(ctx, `INSERT INTO avisos_evento (competicion_id, evento, email) VALUES ($1, $2, $3)
					ON CONFLICT (competicion_id, evento, email) DO NOTHING RETURNING id::text`, c.ID, i.Body.Evento, e).Scan(&id)
				if db.IsNoRows(err) {
					return nil // already on the list: same 202, no email
				}
				if err != nil {
					return err
				}
				o.Body.Nuevo = true
				return email(ctx, tx, c.ID, e, "aviso-evento-confirmado", map[string]string{"evento": nombreEvento(i.Body.Evento), "enlace": s.webURL})
			})
			if err != nil {
				return nil, err
			}
			return o, nil
		})
}
