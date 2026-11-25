package athletes

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

// One account per email (Jaime 25-nov): a público fan account whose email sends an athlete request becomes the
// athlete's account when the request is approved. fans owns the account; athletes asks for it (password hash and
// phone) and, in the approval transaction, emits athletes.cuenta_atleta so fans turns that same account into atleta.

// cuentaFan is the fan account of an email, as fans answers it.
type cuentaFan struct {
	ID           uuid.UUID `json:"id"`
	Alias        string    `json:"alias"`
	Tipo         string    `json:"tipo"`
	AtletaID     uuid.UUID `json:"atletaId"`
	Telefono     string    `json:"telefono"`
	PasswordHash string    `json:"passwordHash"`
}

func normEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// cuentaFanDe returns the fan account of email (nil when there is none). An error means fans is unreachable.
func cuentaFanDe(ctx context.Context, c *svcclient.Client, cid uuid.UUID, email string) (*cuentaFan, error) {
	if email = normEmail(email); email == "" {
		return nil, nil
	}
	var out cuentaFan
	err := c.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/fans/por-email?email="+url.QueryEscape(email), nil, &out)
	if err != nil {
		var p *problem.Error
		if errors.As(err, &p) && p.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &out, nil
}

// unirCuentaFan links the approved athlete to the fan account of the request's email inside the approval
// transaction: the athlete area takes the fan's password (only when it has none) and phone (only when empty), the
// history records the conversion, and fans converts the account (idempotent consumer of athletes.cuenta_atleta).
func unirCuentaFan(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID, email, telefono string, cuenta *cuentaFan) error {
	email = normEmail(email)
	if email == "" {
		return nil
	}
	if cuenta != nil {
		if cuenta.PasswordHash != "" {
			if _, err := tx.Exec(ctx, `UPDATE atletas SET password_hash = $2, updated_at = now() WHERE id = $1 AND COALESCE(password_hash, '') = ''`, atleta, cuenta.PasswordHash); err != nil {
				return err
			}
		}
		if cuenta.Telefono != "" {
			if _, err := tx.Exec(ctx, `UPDATE atletas SET telefono = $2, updated_at = now() WHERE id = $1 AND telefono = ''`, atleta, cuenta.Telefono); err != nil {
				return err
			}
		}
		if cuenta.Tipo == "publico" {
			if err := hist(ctx, tx, atleta, "Perfil público convertido en atleta", "La cuenta del directo «"+cuenta.Alias+"» pasa a ser la del atleta"); err != nil {
				return err
			}
		}
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "athletes.cuenta_atleta", map[string]any{"email": email, "atletaId": atleta, "telefono": telefono},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}
