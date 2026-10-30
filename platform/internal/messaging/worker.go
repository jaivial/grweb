package messaging

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
)

const maxIntentos = 5

type pendiente struct {
	id       uuid.UUID
	cid      uuid.UUID
	clave    string
	destino  string
	vars     map[string]string
	prueba   bool
	intentos int
}

// worker sends due messages every 2 s and recovers messages left «enviando» by a pod that died.
func (s *Svc) worker(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	n := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if n++; n%30 == 0 {
			_, _ = s.a.DB.Exec(ctx, `UPDATE mensajes SET estado = 'reintentando', updated_at = now() WHERE estado = 'enviando' AND updated_at < now() - interval '5 minutes'`)
		}
		if err := s.tick(ctx); err != nil && ctx.Err() == nil {
			s.a.Log.Warn("envío de emails", "err", err)
		}
	}
}

func (s *Svc) tick(ctx context.Context) error {
	rows, err := s.a.DB.Query(ctx, `UPDATE mensajes SET estado = 'enviando', intentos = intentos + 1, updated_at = now() WHERE id IN (
		SELECT id FROM mensajes WHERE estado IN ('en_cola', 'reintentando') AND proximo_at <= now() ORDER BY proximo_at LIMIT 20 FOR UPDATE SKIP LOCKED)
		RETURNING id, competition_id, plantilla, destino::text, vars, prueba, intentos`)
	if err != nil {
		return err
	}
	lote, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pendiente, error) {
		var p pendiente
		err := r.Scan(&p.id, &p.cid, &p.clave, &p.destino, &p.vars, &p.prueba, &p.intentos)
		return p, err
	})
	if err != nil {
		return err
	}
	for _, p := range lote {
		s.procesar(ctx, p)
	}
	return nil
}

// fin updates a message and tells the backoffice (no personal data in the admin event).
func (s *Svc) fin(ctx context.Context, p pendiente, estado, detalle string, extra func(tx pgx.Tx) error, sets string, args ...any) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		q := `UPDATE mensajes SET estado = $2, detalle = $3, updated_at = now()` + sets + ` WHERE id = $1`
		if _, err := tx.Exec(ctx, q, append([]any{p.id, estado, detalle}, args...)...); err != nil {
			return err
		}
		if extra != nil {
			if err := extra(tx); err != nil {
				return err
			}
		}
		if p.cid == uuid.Nil {
			return nil
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "mensaje.estado", map[string]any{"id": p.id, "estado": estado, "plantilla": p.clave},
			events.Competition(p.cid.String()), events.ForPermission("campanas.enviar")))
	})
	if err != nil {
		s.a.Log.Error("actualizar mensaje", "id", p.id, "err", err)
	}
}

// devolver puts a message back in the queue without spending an attempt.
func (s *Svc) devolver(ctx context.Context, p pendiente, en time.Duration, detalle string) {
	_, _ = s.a.DB.Exec(ctx, `UPDATE mensajes SET estado = 'reintentando', intentos = intentos - 1, proximo_at = now() + $2::interval, detalle = $3, updated_at = now() WHERE id = $1`,
		p.id, fmt.Sprintf("%d seconds", int(en.Seconds())), detalle)
}

func (s *Svc) procesar(ctx context.Context, p pendiente) {
	t, err := s.plantilla(ctx, p.cid, p.clave)
	if err != nil {
		s.fin(ctx, p, "fallido", "Plantilla desconocida", nil, "")
		return
	}
	if !p.prueba {
		if t.Estado == "pausada" {
			s.fin(ctx, p, "omitido", "Plantilla pausada", nil, "")
			return
		}
		if t.Estado == "error" {
			s.devolver(ctx, p, 5*time.Minute, "Plantilla con error: espera a que se corrija")
			return
		}
		if p.cid != uuid.Nil {
			var activa bool
			err := s.a.DB.QueryRow(ctx, `SELECT activa FROM automatizaciones WHERE competition_id = $1 AND clave = $2`, p.cid, t.Auto).Scan(&activa)
			if err == nil && !activa {
				s.fin(ctx, p, "omitido", "Automatización desactivada", nil, "")
				return
			}
			if !t.Esencial {
				var pausar bool
				if err := s.a.DB.QueryRow(ctx, `SELECT pausar_en_evento FROM ajustes WHERE competition_id = $1`, p.cid).Scan(&pausar); err != nil {
					pausar = true
				}
				if pausar {
					if ev, despues := s.enEvento(ctx, p.cid); ev {
						s.devolver(ctx, p, time.Until(despues), "Pausado durante el evento: sale al terminar")
						return
					}
				}
			}
		}
		var invalido string
		if err := s.a.DB.QueryRow(ctx, `SELECT tipo FROM destinos_invalidos WHERE destino = $1`, p.destino).Scan(&invalido); err == nil {
			s.fin(ctx, p, "omitido", "La dirección rebotó antes", nil, "")
			return
		}
	}
	r, err := renderizar(t.Contenido, p.vars, t.Variables, s.marca(ctx, p.cid), t.Esencial, t.QR)
	if err != nil {
		// A template edited with a variable the producer does not send: pause it, keep its messages queued.
		_, _ = s.a.DB.Exec(ctx, `INSERT INTO plantilla_estado (competition_id, clave, estado, error) VALUES ($1,$2,'error',$3)
			ON CONFLICT (competition_id, clave) DO UPDATE SET estado = 'error', error = EXCLUDED.error, updated_at = now()`, p.cid, p.clave, err.Error())
		s.devolver(ctx, p, 5*time.Minute, "Plantilla con error: "+err.Error())
		return
	}
	if p.prueba {
		r.Asunto = "[Prueba] " + r.Asunto
	}
	cfg := s.smtpDe(ctx, p.cid)
	// Circuit breaker: while the server is down, messages wait instead of burning attempts.
	var ok bool
	var cambiado time.Time
	if err := s.a.DB.QueryRow(ctx, `SELECT ok, cambiado_at FROM smtp_estado WHERE competition_id = $1`, p.cid).Scan(&ok, &cambiado); err == nil && !ok && time.Since(cambiado) < time.Minute {
		s.devolver(ctx, p, time.Minute-time.Since(cambiado)+time.Second, "SMTP caído: reintento automático")
		return
	}
	// Pace per competition (emails per minute).
	ritmo := 120
	_ = s.a.DB.QueryRow(ctx, `SELECT ritmo_minuto FROM ajustes WHERE competition_id = $1`, p.cid).Scan(&ritmo)
	key := s.a.Keys.Of("messaging", "ritmo", p.cid.String(), time.Now().UTC().Format("200601021504"))
	if n, err := s.a.Redis.Incr(ctx, key).Result(); err == nil {
		s.a.Redis.Expire(ctx, key, 2*time.Minute)
		if int(n) > ritmo {
			s.devolver(ctx, p, time.Duration(60-time.Now().Second()+1)*time.Second, "Ritmo máximo por minuto: en cola")
			return
		}
	}
	cab := map[string]string{"Auto-Submitted": "auto-generated"}
	// One-click unsubscribe (RFC 8058) when the producer gives the POST endpoint; the body link stays the web page.
	if b := p.vars["bajaPost"]; strings.HasPrefix(b, "https://") {
		cab["List-Unsubscribe"] = "<" + b + ">"
		cab["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
	} else if b := p.vars["baja"]; strings.HasPrefix(b, "https://") {
		cab["List-Unsubscribe"] = "<" + b + ">"
	}
	id, err := enviarSMTP(ctx, cfg, p.destino, r, cab)
	if err == nil {
		s.estadoSMTP(ctx, p.cid, cfg, true, "")
		s.fin(ctx, p, "enviado", "250 OK", func(tx pgx.Tx) error {
			if p.cid == uuid.Nil || p.prueba {
				return nil
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "messaging.enviado", map[string]any{"para": p.destino, "plantilla": p.clave, "asunto": r.Asunto},
				events.Competition(p.cid.String()), events.Audience(events.Internal)))
		}, ", asunto = $4, proveedor_id = $5, enviado_at = now()", r.Asunto, id)
		return
	}
	var ee *errEnvio
	if !errors.As(err, &ee) {
		ee = &errEnvio{servidor: true, msg: err.Error()}
	}
	if ee.servidor {
		s.estadoSMTP(ctx, p.cid, cfg, false, ee.msg)
	}
	if ee.permanente {
		s.fin(ctx, p, "rebotado", ee.msg, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `INSERT INTO destinos_invalidos (destino, tipo, motivo) VALUES ($1,'rebote',$2) ON CONFLICT DO NOTHING`, p.destino, ee.msg); err != nil {
				return err
			}
			if p.cid == uuid.Nil {
				return nil
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "messaging.rebote", map[string]any{"para": p.destino, "tipo": "rebote", "motivo": ee.msg},
				events.Competition(p.cid.String()), events.Audience(events.Internal)))
		}, ", asunto = $4", r.Asunto)
		return
	}
	if p.intentos >= maxIntentos {
		s.fin(ctx, p, "fallido", ee.msg, nil, ", asunto = $4", r.Asunto)
		return
	}
	espera := time.Duration(1<<(p.intentos-1)) * time.Minute // 1, 2, 4, 8 min
	s.fin(ctx, p, "reintentando", ee.msg, nil, ", asunto = $4, proximo_at = now() + $5::interval", r.Asunto, fmt.Sprintf("%d seconds", int(espera.Seconds())))
}

// estadoSMTP records a change of the server state (only transitions emit the backoffice event).
func (s *Svc) estadoSMTP(ctx context.Context, cid uuid.UUID, cfg smtpCfg, ok bool, msg string) {
	var antes bool
	err := s.a.DB.QueryRow(ctx, `SELECT ok FROM smtp_estado WHERE competition_id = $1`, cid).Scan(&antes)
	nuevo := errors.Is(err, pgx.ErrNoRows)
	if ok {
		_, _ = s.a.DB.Exec(ctx, `INSERT INTO smtp_estado (competition_id, ok, servidor, error, ultimo_envio) VALUES ($1, true, $2, '', now())
			ON CONFLICT (competition_id) DO UPDATE SET ok = true, servidor = EXCLUDED.servidor, error = '', ultimo_envio = now(),
			cambiado_at = CASE WHEN smtp_estado.ok THEN smtp_estado.cambiado_at ELSE now() END`, cid, cfg.servidor())
	} else {
		_, _ = s.a.DB.Exec(ctx, `INSERT INTO smtp_estado (competition_id, ok, servidor, error) VALUES ($1, false, $2, $3)
			ON CONFLICT (competition_id) DO UPDATE SET ok = false, servidor = EXCLUDED.servidor, error = EXCLUDED.error, cambiado_at = now()`, cid, cfg.servidor(), msg)
	}
	if cid == uuid.Nil || (!nuevo && antes == ok) || (nuevo && ok) {
		return
	}
	_ = s.tx(ctx, func(tx pgx.Tx) error {
		return events.Enqueue(ctx, tx, events.New(ctx, "smtp.estado", map[string]any{"ok": ok, "servidor": cfg.servidor(), "error": msg},
			events.Competition(cid.String()), events.ForPermission("campanas.enviar")))
	})
}
