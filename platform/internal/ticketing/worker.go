package ticketing

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// worker runs every minute: expired offers pass to the next person, free places are offered automatically,
// and tickets get their reminders a week and a day before.
func (s *Svc) worker(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		for _, f := range []func(context.Context) error{s.caducarOfertas, s.promocionar, s.recordatorios} {
			if err := f(ctx); err != nil && ctx.Err() == nil {
				s.a.Log.Warn("worker de entradas", "err", err)
			}
		}
	}
}

func (s *Svc) caducarOfertas(ctx context.Context) error {
	tag, err := s.a.DB.Exec(ctx, `UPDATE lista_espera SET estado = 'caducada', token_hash = '' WHERE estado = 'oferta' AND oferta_expira_at < now()`)
	if err == nil && tag.RowsAffected() > 0 {
		s.a.Log.Info("ofertas de lista de espera caducadas", "n", tag.RowsAffected())
	}
	return err
}

// promocionar offers the free places of each session to the waiting list, in order. Without «permitir parcial»
// a request that does not fit is skipped (the next one may fit); with it, it gets the places left.
func (s *Svc) promocionar(ctx context.Context) error {
	rows, err := s.a.DB.Query(ctx, `SELECT DISTINCT l.competition_id, l.sesion_id FROM lista_espera l JOIN sesiones s ON s.id = l.sesion_id
		LEFT JOIN ajustes a ON a.competition_id = l.competition_id
		WHERE l.estado = 'en_espera' AND COALESCE(a.auto_promocion, true) AND s.publicada AND s.lista_espera AND s.inicio > now()`)
	if err != nil {
		return err
	}
	type par struct{ cid, sid uuid.UUID }
	var ps []par
	for rows.Next() {
		var p par
		if rows.Scan(&p.cid, &p.sid) == nil {
			ps = append(ps, p)
		}
	}
	rows.Close()
	for _, p := range ps {
		err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			x, err := s.bloquearSesion(ctx, tx, p.cid, p.sid)
			if err != nil {
				return err
			}
			aj := s.ajustes(ctx, tx, p.cid)
			libres := x.Aforo - x.Usadas - x.Ofertas
			if libres <= 0 {
				return nil
			}
			cand, err := tx.Query(ctx, `SELECT id, personas FROM lista_espera WHERE sesion_id = $1 AND estado = 'en_espera' ORDER BY created_at`, p.sid)
			if err != nil {
				return err
			}
			type c struct {
				id       uuid.UUID
				personas int
			}
			var cs []c
			for cand.Next() {
				var x c
				if cand.Scan(&x.id, &x.personas) == nil {
					cs = append(cs, x)
				}
			}
			cand.Close()
			for _, k := range cs {
				if libres <= 0 {
					break
				}
				n := k.personas
				if n > libres {
					if !aj.PermitirParcial {
						continue
					}
					n = libres
				}
				if err := s.ofrecer(ctx, tx, p.cid, k.id, x, n, aj.PlazoHoras); err != nil {
					return err
				}
				libres -= n
			}
			return nil
		})
		if err != nil {
			return err
		}
		s.bump(ctx, p.cid)
	}
	return nil
}

// recordatorios: «faltan 7 días» and «mañana es el día» (once each, only for tickets still valid).
func (s *Svc) recordatorios(ctx context.Context) error {
	for _, r := range []struct {
		col, desde, hasta, cuando string
	}{
		{"recordado7_at", "6 days 22 hours", "7 days", "en una semana"},
		{"recordado1_at", "22 hours", "1 day", "mañana"},
	} {
		rows, err := s.a.DB.Query(ctx, fmt.Sprintf(`SELECT e.id, e.competition_id FROM entradas e JOIN sesiones s ON s.id = e.sesion_id
			WHERE e.estado = 'reservada' AND e.email IS NOT NULL AND e.%s IS NULL AND s.inicio BETWEEN now() + interval '%s' AND now() + interval '%s' LIMIT 500`, r.col, r.desde, r.hasta))
		if err != nil {
			return err
		}
		type par struct{ id, cid uuid.UUID }
		var ps []par
		for rows.Next() {
			var p par
			if rows.Scan(&p.id, &p.cid) == nil {
				ps = append(ps, p)
			}
		}
		rows.Close()
		for _, p := range ps {
			c, err := s.comps.ByID(ctx, p.cid)
			if err != nil {
				continue
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var cod, nombre, ape, mail string
				var personas int
				var sid uuid.UUID
				if err := tx.QueryRow(ctx, fmt.Sprintf(`UPDATE entradas SET %s = now() WHERE id = $1 AND %s IS NULL RETURNING codigo, nombre, apellidos, email::text, personas, sesion_id`, r.col, r.col), p.id).
					Scan(&cod, &nombre, &ape, &mail, &personas, &sid); err != nil {
					return nil // another pod took it
				}
				tok, err := s.enlaceEntrada(ctx, tx, p.id)
				if err != nil {
					return err
				}
				rs, err := tx.Query(ctx, selSesion+` WHERE s.id = $1`, sid)
				if err != nil {
					return err
				}
				x, err := pgx.CollectExactlyOneRow(rs, scanSesion)
				if err != nil {
					return err
				}
				v := s.varsEntrada(c, x, cod, tok, nombre, ape, personas)
				v["cuando"] = r.cuando
				return email(ctx, tx, p.cid, mail, "entrada-recordatorio", v)
			})
			if err != nil {
				return err
			}
		}
	}
	return nil
}

// registerRGPD: crm forwards the right to erasure; tickets of that address are anonymised (the counts stay for the
// capacity history, the QR stops working).
func (s *Svc) registerRGPD() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Email    string `json:"email,omitempty" maxLength:"254"`
			Telefono string `json:"telefono,omitempty" maxLength:"30"`
		}
	}
	type out struct {
		Body struct {
			Entradas int `json:"entradas"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-rgpd-supresion", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/rgpd/supresion", Summary: "Derecho de supresión (solo crm)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if e == "" {
				return o, nil
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE entradas SET nombre = 'Anonimizada', apellidos = '', email = NULL, telefono = '', nota = '', utm = '{}', consentimientos = '{}', token_hash = '',
					estado = CASE WHEN estado = 'reservada' THEN 'anulada' ELSE estado END, motivo = CASE WHEN estado = 'reservada' THEN 'Supresión RGPD' ELSE motivo END, updated_at = now()
					WHERE competition_id = $1 AND email = $2`, in.CID, e)
				if err != nil {
					return err
				}
				o.Body.Entradas = int(tag.RowsAffected())
				_, err = tx.Exec(ctx, `DELETE FROM lista_espera WHERE competition_id = $1 AND email = $2`, in.CID, e)
				return err
			})
			if err == nil {
				s.bump(ctx, in.CID)
			}
			return o, err
		})
}
