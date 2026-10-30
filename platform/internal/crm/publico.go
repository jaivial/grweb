package crm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagPub = []string{"Web pública"}

// TextoNovedades is the consent text of the news form (footer, «Próximamente» pages). Its version and hash are
// stored with every subscription as the proof of what the person accepted.
const (
	TextoNovedades   = "Quiero recibir novedades de GRStrength. Te enviaremos un email para confirmarlo y puedes darte de baja en 1 clic."
	VersionNovedades = "novedades-2026-10"
)

var hashNovedades = func() string { h := sha256.Sum256([]byte(TextoNovedades)); return hex.EncodeToString(h[:]) }()

func (s *Svc) enlacesNovedades(contacto uuid.UUID, token string) map[string]string {
	baja := s.bajaToken(contacto, "novedades_email")
	return map[string]string{
		"enlace":   s.webURL + "/novedades/confirmar?t=" + token,
		"baja":     s.webURL + "/baja?t=" + baja,
		"bajaPost": s.webURL + "/api/baja/" + baja, // List-Unsubscribe one-click (RFC 8058)
	}
}

func (s *Svc) registerPublico() {
	api := s.a.API
	type subIn struct {
		Body struct {
			Competicion string `json:"competicion" pattern:"^[a-z0-9-]{2,41}$"`
			Email       string `json:"email" maxLength:"254"`
			Acepta      bool   `json:"acepta" doc:"Casilla sin marcar por defecto: obligatoria"`
			Origen      string `json:"origen,omitempty" maxLength:"80" doc:"Dónde se suscribió (ruta o campaña)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "suscripciones-crear", Method: http.MethodPost, Path: "/api/suscripciones", Summary: "Suscribirse a las novedades (doble opt-in)", Tags: tagPub, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *subIn) (*struct{}, error) {
			if !in.Body.Acepta {
				return nil, problem.Unprocessable("CONSENTIMIENTO_REQUERIDO", "Marca la casilla para recibir las novedades.")
			}
			e := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
				return nil, problem.Unprocessable("EMAIL_INVALIDO", "Escribe un email válido.")
			}
			ip := httpx.ClientIPFrom(ctx)
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "suscripcion", ip), 6, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has hecho varias suscripciones seguidas. Inténtalo más tarde.")
			}
			// Same answer whether the address was already subscribed or not; at most one email per address a day.
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "suscripcion-email", s.hashDestino(e)), 2, 24*time.Hour); !r.Allowed {
				return nil, nil
			}
			c, err := s.comps.Public(ctx, in.Body.Competicion)
			if err != nil {
				return nil, err
			}
			origen := strings.TrimSpace(in.Body.Origen)
			if origen == "" {
				origen = "web"
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				id, err := s.ingest(ctx, tx, c.ID, ContactoIn{Email: e, Origen: origen, Relacion: map[string]any{"novedades": true},
					Actividad: &struct {
						Tipo    string `json:"tipo"`
						Titulo  string `json:"titulo"`
						Detalle string `json:"detalle"`
					}{"novedades", "Se suscribió a las novedades", "Pendiente de confirmar (doble opt-in) · " + origen}}, time.Now())
				if err != nil {
					return err
				}
				return s.iniciarNovedades(ctx, tx, c.ID, id, e, origen, ip)
			})
		})

	type tokIn struct {
		Body struct {
			Token string `json:"token" minLength:"20" maxLength:"100"`
		}
	}
	type confOut struct {
		Body struct {
			Email string `json:"email" doc:"Enmascarado"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "suscripciones-confirmar", Method: http.MethodPost, Path: "/api/suscripciones/confirmar", Summary: "Confirmar la suscripción (enlace del email)", Tags: tagPub},
		func(ctx context.Context, in *tokIn) (*confOut, error) {
			o := &confOut{}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var contacto, cid uuid.UUID
				var correo string
				err := tx.QueryRow(ctx, `UPDATE consentimientos k SET estado = 'confirmado', doi_at = now(), token_hash = '' FROM contactos c
					WHERE k.token_hash = $1 AND k.finalidad = 'novedades_email' AND c.id = k.contacto_id AND k.aceptado_at > now() - interval '30 days'
					RETURNING c.id, c.competition_id, c.email::text`, hashToken(in.Body.Token)).Scan(&contacto, &cid, &correo)
				if db.IsNoRows(err) {
					return problem.NotFound("El enlace no es válido o ya se usó.")
				}
				if err != nil {
					return err
				}
				o.Body.Email = mascara("email", correo)
				// Confirming again after an unsubscribe re-allows sending.
				if _, err := tx.Exec(ctx, `DELETE FROM supresiones WHERE competition_id = $1 AND canal = 'email' AND destino_hash = $2 AND tipo = 'baja'`, cid, s.hashDestino(correo)); err != nil {
					return err
				}
				_, err = tx.Exec(ctx, `INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle) VALUES ($1,$2,'novedades','Confirmó las novedades','Doble opt-in')`, newID(), contacto)
				return err
			})
			return o, err
		})

	type bajaIn struct {
		Token string `path:"token" maxLength:"120"`
	}
	type bajaOut struct {
		Body struct {
			Destino   string `json:"destino"`
			Finalidad string `json:"finalidad"`
			Texto     string `json:"texto"`
			Baja      bool   `json:"baja" doc:"Ya estaba dado de baja"`
		}
	}
	textos := map[string]string{"novedades_email": "las novedades por email", "avisos_whatsapp": "los avisos por WhatsApp", "avisos_atleta": "los avisos de atletas"}
	info := func(ctx context.Context, tok string) (*bajaOut, uuid.UUID, uuid.UUID, string, error) {
		id, fin, ok := s.validBaja(tok)
		if !ok || textos[fin] == "" {
			return nil, uuid.Nil, uuid.Nil, "", problem.NotFound("El enlace no es válido.")
		}
		var cid uuid.UUID
		var correo *string
		var estado string
		err := s.a.DB.QueryRow(ctx, `SELECT c.competition_id, c.email::text, COALESCE(k.estado, '') FROM contactos c LEFT JOIN consentimientos k ON k.contacto_id = c.id AND k.finalidad = $2 WHERE c.id = $1`, id, fin).
			Scan(&cid, &correo, &estado)
		if err != nil || correo == nil {
			return nil, uuid.Nil, uuid.Nil, "", problem.NotFound("El enlace no es válido.")
		}
		o := &bajaOut{}
		o.Body.Destino, o.Body.Finalidad, o.Body.Texto, o.Body.Baja = mascara("email", *correo), fin, textos[fin], estado == "revocado"
		return o, id, cid, *correo, nil
	}
	huma.Register(api, huma.Operation{OperationID: "baja-info", Method: http.MethodGet, Path: "/api/baja/{token}", Summary: "Qué se da de baja con este enlace", Tags: tagPub},
		func(ctx context.Context, in *bajaIn) (*bajaOut, error) {
			o, _, _, _, err := info(ctx, in.Token)
			return o, err
		})
	huma.Register(api, huma.Operation{OperationID: "baja", Method: http.MethodPost, Path: "/api/baja/{token}", Summary: "Darse de baja en un clic (también List-Unsubscribe-Post)", Tags: tagPub},
		func(ctx context.Context, in *bajaIn) (*bajaOut, error) {
			o, id, cid, correo, err := info(ctx, in.Token)
			if err != nil {
				return nil, err
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE consentimientos SET estado = 'revocado', revocado_at = now(), revocado_motivo = 'Enlace de baja del email', token_hash = '' WHERE contacto_id = $1 AND finalidad = $2 AND estado <> 'revocado'`,
					id, o.Body.Finalidad); err != nil {
					return err
				}
				if o.Body.Finalidad != "novedades_email" {
					return nil
				}
				return s.suprimir(ctx, tx, cid, "email", correo, "baja", "Enlace de baja del email", "email")
			})
			o.Body.Baja = true
			return o, err
		})
}

// recordatorios re-sends the double opt-in once, 48 h after an unconfirmed subscription (within 7 days).
func (s *Svc) recordatorios(ctx context.Context) {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		rows, err := s.a.DB.Query(ctx, `SELECT k.contacto_id, c.competition_id, c.email::text FROM consentimientos k JOIN contactos c ON c.id = k.contacto_id
			WHERE k.finalidad = 'novedades_email' AND k.estado = 'pendiente' AND k.recordado_at IS NULL AND c.email IS NOT NULL
			AND k.aceptado_at < now() - interval '48 hours' AND k.aceptado_at > now() - interval '7 days' LIMIT 100`)
		if err != nil {
			continue
		}
		type r struct {
			id, cid uuid.UUID
			mail    string
		}
		var list []r
		for rows.Next() {
			var x r
			if rows.Scan(&x.id, &x.cid, &x.mail) == nil {
				list = append(list, x)
			}
		}
		rows.Close()
		for _, x := range list {
			tok := randomToken()
			_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE consentimientos SET recordado_at = now(), token_hash = $2 WHERE contacto_id = $1 AND finalidad = 'novedades_email'`, x.id, hashToken(tok)); err != nil {
					return err
				}
				return email(ctx, tx, x.cid, x.mail, "novedades-recordatorio", s.enlacesNovedades(x.id, tok))
			})
		}
	}
}

// iniciarNovedades starts the double opt-in of the news for a contact (pending consent with the exact text, token,
// confirmation email). Nothing to do when already confirmed.
func (s *Svc) iniciarNovedades(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, e, origen, ip string) error {
	var estado string
	err := tx.QueryRow(ctx, `SELECT estado FROM consentimientos WHERE contacto_id = $1 AND finalidad = 'novedades_email'`, id).Scan(&estado)
	if err == nil && estado == "confirmado" {
		return nil
	}
	tok := randomToken()
	if err := s.consentir(ctx, tx, id, ConsentIn{Finalidad: "novedades_email", Canal: "email", Estado: "pendiente", Version: VersionNovedades, Hash: hashNovedades,
		Origen: origen + " · casilla de novedades", IP: ip}, time.Now()); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE consentimientos SET token_hash = $2, recordado_at = NULL WHERE contacto_id = $1 AND finalidad = 'novedades_email'`, id, hashToken(tok)); err != nil {
		return err
	}
	return email(ctx, tx, cid, e, "novedades-confirmar", s.enlacesNovedades(id, tok))
}
