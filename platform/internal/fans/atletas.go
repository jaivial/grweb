package fans

import (
	"context"
	"errors"
	"net/http"
	"net/url"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

// athleteRef is all fans needs from athletes: the id of the athlete whose registration email matches.
// athletes does not expose that lookup yet (only the full confirmed list, without emails), so the call
// sits behind this interface and the proposed route below is pending assignment to the athletes owner:
//
//	GET /internal/competiciones/{cid}/atletas/por-email?email=…   → 200 {"id":"<uuid>"} · 404 si no coincide
//
// Until that route exists, tipo=atleta answers ATLETA_NO_ENCONTRADO (see porEmail).
type athleteRef interface {
	porEmail(ctx context.Context, cid uuid.UUID, email string) (uuid.UUID, error)
}

type athletesClient struct{ c *svcclient.Client }

// porEmail returns the athlete id, uuid.Nil when athletes has no match (404), and an error only when the
// service itself is unreachable.
func (a athletesClient) porEmail(ctx context.Context, cid uuid.UUID, email string) (uuid.UUID, error) {
	var out struct {
		ID uuid.UUID `json:"id"`
	}
	err := a.c.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/atletas/por-email?email="+url.QueryEscape(email), nil, &out)
	if err != nil {
		var p *problem.Error
		if errors.As(err, &p) && p.Status == http.StatusNotFound {
			return uuid.Nil, nil
		}
		return uuid.Nil, err
	}
	return out.ID, nil
}
