package messaging

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// The campaign sender: every 5 s, for each campaign being sent, each channel takes its share of the pace (per
// minute / 12) with SKIP LOCKED, so several pods share the work without sending twice. Temporary errors back off
// (1, 2, 4, 8 min; failed after 5 tries), permanent ones (bounce, number not on WhatsApp) go to crm as suppressions.
// When nothing is pending the campaign is «enviada».

func (s *Svc) campanasWorker(ctx context.Context) {
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if err := s.campanasTick(ctx); err != nil && ctx.Err() == nil {
			s.a.Log.Warn("envío de campañas", "err", err)
		}
	}
}

type envioCamp struct {
	id, cid         uuid.UUID
	nombre, asunto  string
	html, waTexto   string
	waImagen        string
	diseno          []Bloque
	emailMin, waMin int
	preheader       string
}

func (s *Svc) campanasTick(ctx context.Context) error {
	// A pod that died mid-batch leaves rows «enviando»: back to the queue after 5 minutes (at-least-once).
	if _, err := s.a.DB.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'pendiente', updated_at = now() WHERE estado = 'enviando' AND updated_at < now() - interval '5 minutes'`); err != nil {
		return err
	}
	// Scheduled campaigns whose time has come.
	rows, err := s.a.DB.Query(ctx, `SELECT id, competition_id, canales, creada_por FROM campanas WHERE estado = 'programada' AND programada_at <= now() LIMIT 5`)
	if err != nil {
		return err
	}
	type prog struct {
		id, cid uuid.UUID
		canales []string
		por     string
	}
	var ps []prog
	for rows.Next() {
		var p prog
		if err := rows.Scan(&p.id, &p.cid, &p.canales, &p.por); err != nil {
			rows.Close()
			return err
		}
		ps = append(ps, p)
	}
	rows.Close()
	for _, p := range ps {
		// Several pods tick at once: one claims the start (the others skip it).
		if ok, err := s.a.Redis.SetNX(ctx, s.a.Keys.Of("messaging", "campana-inicio", p.id.String()), 1, 2*time.Minute).Result(); err != nil || !ok {
			continue
		}
		if _, err := s.iniciar(ctx, p.cid, p.id, p.canales, "Programada"); err != nil {
			var pe *problem.Error
			if errors.As(err, &pe) && pe.Code == "CAMPANA_YA_ENVIADA" {
				continue
			}
			s.a.Log.Warn("campaña programada", "campana", p.id, "err", err)
			// back to draft with the reason in the audit log, so it does not retry forever
			_ = s.tx(ctx, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE campanas SET estado = 'borrador', version = version + 1, updated_at = now() WHERE id = $1 AND estado = 'programada'`, p.id); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "campana.error", map[string]any{"campanaId": p.id, "error": err.Error()},
					events.Competition(p.cid.String()), events.ForPermission(perm), events.Subject("campana:"+p.id.String())))
			})
		}
	}

	rows, err = s.a.DB.Query(ctx, `SELECT id, competition_id, nombre, asunto, preheader, email_html, wa_texto, wa_imagen, diseno, email_por_min, wa_por_min FROM campanas WHERE estado = 'enviando'`)
	if err != nil {
		return err
	}
	var cs []envioCamp
	for rows.Next() {
		var c envioCamp
		if err := rows.Scan(&c.id, &c.cid, &c.nombre, &c.asunto, &c.preheader, &c.html, &c.waTexto, &c.waImagen, &c.diseno, &c.emailMin, &c.waMin); err != nil {
			rows.Close()
			return err
		}
		cs = append(cs, c)
	}
	rows.Close()
	for _, c := range cs {
		s.enviarLote(ctx, c, "email", c.emailMin)
		s.enviarLote(ctx, c, "whatsapp", c.waMin)
		s.cerrarSiTermino(ctx, c)
	}
	return nil
}

type pendienteCamp struct {
	id, contacto    uuid.UUID
	destino, nombre string
	baja            string
	intentos        int
}

// enviarLote sends this tick's share of a channel: at most porMin in any 60 s window (counted in the database, so it
// holds with several pods), spread over the ticks of the minute. While the channel's server is down (SMTP or
// evo-weai) the competition's channel waits a minute and the recipients keep their tries.
func (s *Svc) enviarLote(ctx context.Context, c envioCamp, canal string, porMin int) {
	caido := s.a.Keys.Of("messaging", "canal-caido", c.cid.String(), canal)
	if n, _ := s.a.Redis.Exists(ctx, caido).Result(); n > 0 {
		return
	}
	var recientes int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM campana_destinatarios WHERE campana_id = $1 AND canal = $2 AND (estado = 'enviando' OR enviado_at > now() - interval '60 seconds')`, c.id, canal).Scan(&recientes); err != nil {
		return
	}
	n := min((porMin+11)/12, porMin-recientes)
	if n <= 0 {
		return
	}
	var lote []pendienteCamp
	err := s.tx(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, contacto_id, destino, nombre, baja_url, intentos FROM campana_destinatarios WHERE campana_id = $1 AND canal = $2 AND estado = 'pendiente' AND proximo_at <= now()
			ORDER BY proximo_at, id LIMIT $3 FOR UPDATE SKIP LOCKED`, c.id, canal, n)
		if err != nil {
			return err
		}
		for rows.Next() {
			var p pendienteCamp
			if err := rows.Scan(&p.id, &p.contacto, &p.destino, &p.nombre, &p.baja, &p.intentos); err != nil {
				rows.Close()
				return err
			}
			lote = append(lote, p)
		}
		rows.Close()
		for _, p := range lote {
			if _, err := tx.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'enviando', intentos = intentos + 1, updated_at = now() WHERE id = $1`, p.id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil || len(lote) == 0 {
		return
	}
	var wa waCfg
	var smtpc smtpCfg
	var texto string
	if canal == "whatsapp" {
		wa = s.waDe(ctx, c.cid)
	} else {
		smtpc = s.smtpDe(ctx, c.cid)
		texto = textoPlano(c.diseno, s.contexto(ctx, c.cid, c.asunto, c.preheader, c.diseno, "email", slugCampana(c.nombre)))
	}
	for i, p := range lote {
		baja, bajaPost, _ := strings.Cut(p.baja, "\n")
		nombre := strings.Fields(p.nombre)
		pila := ""
		if len(nombre) > 0 {
			pila = nombre[0]
		}
		var id string
		var err error
		if canal == "email" {
			r := Render{Asunto: personalizar(c.asunto, pila, baja, false), HTML: personalizar(c.html, pila, baja, true), Texto: personalizar(texto, pila, baja, false)}
			cab := map[string]string{"X-GRCup-Campana": c.id.String()}
			if bajaPost != "" {
				cab["List-Unsubscribe"] = "<" + bajaPost + ">"
				cab["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
			}
			id, err = enviarSMTP(ctx, smtpc, p.destino, r, cab)
		} else {
			id, err = s.enviarWA(ctx, wa, p.destino, WhatsApp{Texto: personalizar(c.waTexto, pila, baja, false), Imagen: c.waImagen})
		}
		var ee *errEnvio
		var ew *errWA
		if err != nil && ((errors.As(err, &ee) && ee.servidor) || (errors.As(err, &ew) && ew.servidor)) {
			_ = s.a.Redis.Set(ctx, caido, err.Error(), time.Minute).Err()
			rest := make([]uuid.UUID, 0, len(lote)-i)
			for _, q := range lote[i:] {
				rest = append(rest, q.id)
			}
			det := "Servidor de email no disponible: "
			if canal == "whatsapp" {
				det = "WhatsApp (evo-weai) no disponible: "
			}
			msg := err.Error()
			if len(msg) > 150 {
				msg = msg[:150]
			}
			_, _ = s.a.DB.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'pendiente', intentos = greatest(intentos - 1, 0), proximo_at = now() + interval '1 minute', detalle = $2, updated_at = now() WHERE id = ANY($1)`,
				rest, det+msg)
			s.a.Log.Warn("canal de campaña caído", "campana", c.id, "canal", canal, "err", err)
			return
		}
		s.resultado(ctx, c, canal, p, id, err, wa.Modo == "simulado")
	}
}

// resultado records one delivery and tells crm (activity, or a suppression for permanent failures).
func (s *Svc) resultado(ctx context.Context, c envioCamp, canal string, p pendienteCamp, id string, err error, simulado bool) {
	_ = s.tx(ctx, func(tx pgx.Tx) error {
		if err == nil {
			estado, extra := "enviado", ""
			if simulado {
				estado, extra = "entregado", ", entregado_at = now()"
			}
			detalle := "Enviado"
			if simulado {
				detalle = "Simulado (WhatsApp sin número conectado)"
			}
			if _, err := tx.Exec(ctx, `UPDATE campana_destinatarios SET estado = $2, proveedor_id = $3, detalle = $4, enviado_at = now()`+extra+`, destino = mascara, updated_at = now() WHERE id = $1`,
				p.id, estado, id, detalle); err != nil {
				return err
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "messaging.enviado", map[string]any{"para": p.destino, "canal": canal, "asunto": c.nombre, "campana": c.id},
				events.Competition(c.cid.String()), events.Audience(events.Internal)))
		}
		perm, motivo := false, err.Error()
		var ee *errEnvio
		var ew *errWA
		switch {
		case errors.As(err, &ee):
			perm = ee.permanente
		case errors.As(err, &ew):
			perm = ew.permanente
		}
		if len(motivo) > 200 {
			motivo = motivo[:200]
		}
		if perm || p.intentos+1 >= 5 {
			estado, tipo := "fallido", ""
			if perm {
				estado, tipo = "rebotado", "rebote"
				if canal == "whatsapp" {
					tipo = "whatsapp_invalido"
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE campana_destinatarios SET estado = $2, detalle = $3, destino = mascara, updated_at = now() WHERE id = $1`, p.id, estado, motivo); err != nil {
				return err
			}
			if tipo == "" {
				return nil
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "messaging.rebote", map[string]any{"para": p.destino, "canal": canal, "tipo": tipo, "motivo": motivo},
				events.Competition(c.cid.String()), events.Audience(events.Internal)))
		}
		espera := time.Duration(1<<p.intentos) * time.Minute
		_, err := tx.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'pendiente', detalle = $2, proximo_at = now() + $3::interval, updated_at = now() WHERE id = $1`,
			p.id, "Reintento: "+motivo, espera.String())
		return err
	})
}

// cerrarSiTermino marks the campaign sent when nothing is pending or in flight, and reports progress.
func (s *Svc) cerrarSiTermino(ctx context.Context, c envioCamp) {
	p, err := s.progreso(ctx, s.a.DB, []uuid.UUID{c.id})
	if err != nil {
		return
	}
	pend := 0
	data := map[string]any{"campanaId": c.id}
	for k, v := range p[c.id] {
		pend += v.Pendientes
		data[k] = v
	}
	_ = s.tx(ctx, func(tx pgx.Tx) error {
		if pend > 0 {
			return events.Enqueue(ctx, tx, events.New(ctx, "campana.progreso", data, events.Competition(c.cid.String()), events.ForPermission(perm), events.Subject("campana:"+c.id.String())))
		}
		tag, err := tx.Exec(ctx, `UPDATE campanas SET estado = 'enviada', terminada_at = now(), version = version + 1, updated_at = now() WHERE id = $1 AND estado = 'enviando'`, c.id)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		data["nombre"] = c.nombre
		return events.Enqueue(ctx, tx, events.New(ctx, "campana.enviada", data, events.Competition(c.cid.String()), events.ForPermission(perm), events.Subject("campana:"+c.id.String())))
	})
}
