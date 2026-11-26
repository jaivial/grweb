package crm

import (
	"context"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// registerAvisosEvento: BIZ-165 «Avísame» (GRS Cup 3). Stores the email once per event (idempotent, always 202).
// The backoffice reads and manages these rows through registerAvisosEventoAdmin (see avisos_evento_admin.go).
func (s *Svc) registerAvisosEvento() {
	type in struct {
		Body struct {
			Competicion string `json:"competicion" pattern:"^[a-z0-9-]{2,41}$"`
			Evento      string `json:"evento" pattern:"^[a-z0-9-]{2,40}$"`
			Email       string `json:"email" maxLength:"254"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "avisos-evento-crear", Method: http.MethodPost, Path: "/api/avisos-evento", Summary: "Avísame cuando abra una próxima competición", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, i *in) (*struct{}, error) {
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
			_, err = s.a.DB.Exec(ctx, `INSERT INTO avisos_evento (competicion_id, evento, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, c.ID, i.Body.Evento, e)
			return nil, err
		})
}
