package fans

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// One account per email (Jaime 25-nov): when an athlete request is approved, athletes emits athletes.cuenta_atleta and
// the público account of that email becomes atleta: same row, alias, password, bets, fantasy team and notices.
// The reverse order (the athlete exists first) is covered on redemption: the account is created as atleta.

// convertirAtleta turns the account into atleta linked to atleta (idempotent) and records it in the audit log
// («perfil público convertido en atleta»). An empty phone takes the one of the request.
func (s *Svc) convertirAtleta(ctx context.Context, tx pgx.Tx, cid, fanID, atleta uuid.UUID, telefono string) (bool, error) {
	var alias, antes string
	err := tx.QueryRow(ctx, `UPDATE fans f SET tipo = 'atleta', atleta_id = $3, telefono = CASE WHEN f.telefono = '' THEN $4 ELSE f.telefono END, updated_at = now()
		FROM (SELECT id, tipo FROM fans WHERE id = $1 FOR UPDATE) v
		WHERE f.id = v.id AND f.competition_id = $2 AND (f.tipo <> 'atleta' OR f.atleta_id IS DISTINCT FROM $3)
		RETURNING f.alias::text, v.tipo`, fanID, cid, atleta, telefono).Scan(&alias, &antes)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	return true, events.Enqueue(ctx, tx, events.New(ctx, "fans.convertido_atleta", map[string]any{"fanId": fanID, "alias": alias, "atletaId": atleta, "antes": antes},
		events.Competition(cid.String()), events.ForPermission("directo.operar")))
}

func (s *Svc) handleCuentaAtleta(ctx context.Context, e events.Event) error {
	var d struct {
		Email    string    `json:"email"`
		AtletaID uuid.UUID `json:"atletaId"`
		Telefono string    `json:"telefono"`
	}
	cid, err := uuid.Parse(e.CompetitionID)
	if err != nil || json.Unmarshal(e.Data, &d) != nil || d.AtletaID == uuid.Nil || strings.TrimSpace(d.Email) == "" {
		return nil // poison message
	}
	tel, ok := normTelefono(d.Telefono)
	if !ok {
		tel = ""
	}
	var fanID uuid.UUID
	err = s.a.DB.QueryRow(ctx, `SELECT id FROM fans WHERE competition_id = $1 AND email_hash = $2`, cid, emailHash(d.Email)).Scan(&fanID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // no account with that email: it will be created as atleta on its first redemption
	} else if err != nil {
		return err
	}
	var cambio bool
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		cambio, err = s.convertirAtleta(ctx, tx, cid, fanID, d.AtletaID, tel)
		return err
	}); err != nil {
		return err
	}
	if cambio {
		// The session carries tipo and atleta: re-issued sessions show the athlete badge.
		_, err = s.bumpVersion(ctx, fanID)
	}
	return err
}

// registerCuentaAtleta: the consumer and the lookup athletes uses before approving (and for the request notice).
func (s *Svc) registerCuentaAtleta() {
	c := &events.Consumer{Redis: s.a.Redis, DB: s.a.DB, Stream: s.a.Stream(), Group: "fans-cuenta-atleta", Start: "$",
		Types: []string{"athletes.cuenta_atleta"}, Handle: s.handleCuentaAtleta, Log: s.a.Log}
	s.a.Go(c.Run)

	type in struct {
		CID   uuid.UUID `path:"cid"`
		Email string    `query:"email" maxLength:"254"`
	}
	type out struct {
		Body struct {
			ID           uuid.UUID `json:"id"`
			Alias        string    `json:"alias"`
			Tipo         string    `json:"tipo"`
			AtletaID     uuid.UUID `json:"atletaId"`
			Telefono     string    `json:"telefono"`
			PasswordHash string    `json:"passwordHash" doc:"Hash argon2id (el área de atleta entra con la misma contraseña)"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-fan-por-email", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/fans/por-email",
		Summary: "Cuenta de directo de un email (solo athletes)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			p, err := auth.RequireService(ctx)
			if err != nil {
				return nil, err
			}
			if p.Service != "athletes" {
				return nil, problem.Forbidden("Solo athletes.")
			}
			o := &out{}
			err = s.a.DB.QueryRow(ctx, `SELECT id, alias::text, tipo, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), telefono, password_hash FROM fans WHERE competition_id = $1 AND email_hash = $2`,
				in.CID, emailHash(in.Email)).Scan(&o.Body.ID, &o.Body.Alias, &o.Body.Tipo, &o.Body.AtletaID, &o.Body.Telefono, &o.Body.PasswordHash)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.NotFound("Sin cuenta con ese email.")
			}
			return o, err
		})
}

// atletaDeEmail is the athlete of an email for a público account (uuid.Nil when none or athletes is down).
func (s *Svc) atletaDeEmail(ctx context.Context, cid uuid.UUID, email string) uuid.UUID {
	aid, err := s.atletas.porEmail(ctx, cid, email)
	if err != nil {
		s.a.Log.Warn("athletes por-email no disponible", "err", err)
		return uuid.Nil
	}
	return aid
}
