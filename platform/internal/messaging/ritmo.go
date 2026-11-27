package messaging

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"math/rand/v2"
	"strings"
	"time"
	_ "time/tzdata" // the quiet hours need the competition's time zone in the distroless image

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The outbound pace. Every sender (a WhatsApp number, an SMTP account) has ONE turn, shared by the outbox, the
// campaigns and the test sends and kept in Postgres: it survives restarts and redeploys and holds with several pods.
// WhatsApp (an unofficial number is a person, not a mailbox; WhatsApp unlinked ours on 27/11/2026 after a burst of
// first-contact messages) sends one message every 30–60 s, at most 40 an hour and 150 a day, at most 15 an hour to
// numbers that never talked with us, warms up a number linked again (30 the first day, doubling) and keeps every
// message from 22:00 to 09:00. Email keeps the competition's pace per minute and 2000 a day per account.
const (
	waIntervaloMin  = 30 * time.Second
	waIntervaloMax  = 60 * time.Second
	waPorHora       = 40
	waPorDia        = 150
	waNuevosPorHora = 15
	waCalentamiento = 30
	emailPorDia     = 2000
	silencioDesde   = 22
	silencioHasta   = 9
	esperaCorta     = 3 * time.Second // an email turn this close is waited in place
	// A number that keeps answering «not connected» (unlinked, or blocked for a day by WhatsApp) is tried once a
	// minute; after 10 tries in a row, once an hour.
	pausasSeguidas = 10
	pausaLarga     = time.Hour
)

func intervaloWA() time.Duration {
	return waIntervaloMin + rand.N(waIntervaloMax-waIntervaloMin)
}

// remitenteWA is the sender key of a WhatsApp number (the instance; the competition in the simulated mode).
func remitenteWA(c waCfg, cid uuid.UUID) string {
	if c.Instancia != "" {
		return "wa:" + c.Instancia
	}
	return "wa:" + cid.String()
}

// remitenteEmail is the sender key of an SMTP account (the platform's is shared by every competition).
func remitenteEmail(c smtpCfg) string {
	return "email:" + c.servidor() + ":" + c.User
}

// huella is the keyed hash of a WhatsApp destination (only its digits): envio_contactos never keeps a phone.
func (s *Svc) huella(destino string) string {
	var b strings.Builder
	for _, r := range destino {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	m := hmac.New(sha256.New, []byte(s.a.Cfg.InternalToken))
	m.Write([]byte("grcup/contacto:" + b.String()))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:18])
}

// contacto records a number that wrote to us: it no longer counts as a first contact.
func (s *Svc) contacto(ctx context.Context, remitente, destino string) {
	_, _ = s.a.DB.Exec(ctx, `INSERT INTO envio_contactos (remitente, huella) VALUES ($1,$2) ON CONFLICT DO NOTHING`, remitente, s.huella(destino))
}

// reservar gives the sender's turn to one message for destino. When it is not its time (the interval, a cap) it
// returns how long to wait and nothing is spent. forzar takes the turn anyway (a test the person is waiting for) but
// still pushes the next one. The caller calls anotar once the provider took the message.
func (s *Svc) reservar(ctx context.Context, remitente, destino string, wa, forzar bool, intervalo time.Duration) (time.Duration, error) {
	var espera time.Duration
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO envio_turnos (remitente) VALUES ($1) ON CONFLICT DO NOTHING`, remitente); err != nil {
			return err
		}
		// The row lock serialises the senders of every pod; the database clock is the only clock.
		var sig, desde, ahora time.Time
		if err := tx.QueryRow(ctx, `SELECT siguiente_at, calentamiento_desde, now() FROM envio_turnos WHERE remitente = $1 FOR UPDATE`, remitente).Scan(&sig, &desde, &ahora); err != nil {
			return err
		}
		nuevo := false
		if wa && !strings.HasSuffix(destino, "@g.us") {
			var conocido bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM envio_contactos WHERE remitente = $1 AND huella = $2)`, remitente, s.huella(destino)).Scan(&conocido); err != nil {
				return err
			}
			nuevo = !conocido
		}
		if !forzar {
			if d := sig.Sub(ahora); d > 0 {
				espera = d
				return nil
			}
			var hora, dia, nuevos int
			var hora0, dia0, nuevo0 *time.Time
			if err := tx.QueryRow(ctx, `SELECT count(*) FILTER (WHERE at > $2::timestamptz - interval '1 hour'), count(*), count(*) FILTER (WHERE nuevo AND at > $2::timestamptz - interval '1 hour'),
				min(at) FILTER (WHERE at > $2::timestamptz - interval '1 hour'), min(at), min(at) FILTER (WHERE nuevo AND at > $2::timestamptz - interval '1 hour')
				FROM envio_registro WHERE remitente = $1 AND at > $2::timestamptz - interval '24 hours'`, remitente, ahora).Scan(&hora, &dia, &nuevos, &hora0, &dia0, &nuevo0); err != nil {
				return err
			}
			// A full window frees a slot when its oldest message leaves it.
			libre := func(desde *time.Time, ventana time.Duration) time.Duration {
				if desde == nil {
					return time.Minute
				}
				return max(desde.Add(ventana).Sub(ahora), time.Second)
			}
			porDia := emailPorDia
			if wa {
				porDia = porDiaWA(desde, ahora)
			}
			switch {
			case dia >= porDia:
				espera = libre(dia0, 24*time.Hour)
			case wa && hora >= waPorHora:
				espera = libre(hora0, time.Hour)
			case nuevo && nuevos >= waNuevosPorHora:
				espera = libre(nuevo0, time.Hour)
			}
			if espera > 0 {
				return nil
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE envio_turnos SET siguiente_at = greatest(siguiente_at, now()) + $2::interval WHERE remitente = $1`,
			remitente, fmt.Sprintf("%d milliseconds", intervalo.Milliseconds())); err != nil {
			return err
		}
		return nil
	})
	return espera, err
}

// anotar counts a message that reached the provider (the caps) and remembers its WhatsApp number as a contact. A
// failure because the channel is paused is not counted: nothing reached WhatsApp.
func (s *Svc) anotar(ctx context.Context, remitente, destino string, wa bool) {
	nuevo := false
	if wa && !strings.HasSuffix(destino, "@g.us") {
		tag, err := s.a.DB.Exec(ctx, `INSERT INTO envio_contactos (remitente, huella) VALUES ($1,$2) ON CONFLICT DO NOTHING`, remitente, s.huella(destino))
		nuevo = err == nil && tag.RowsAffected() == 1
	}
	if _, err := s.a.DB.Exec(ctx, `INSERT INTO envio_registro (remitente, nuevo) VALUES ($1,$2)`, remitente, nuevo); err != nil {
		s.a.Log.Warn("registrar el envío en el ritmo", "remitente", remitente, "err", err)
	}
}

// turno is reservar for the workers: a short wait (the next email) is waited in place, a long one (WhatsApp, a cap)
// goes back to the caller, which puts the message back in the queue without spending a try.
func (s *Svc) turno(ctx context.Context, remitente, destino string, wa bool, intervalo time.Duration) (time.Duration, error) {
	for {
		espera, err := s.reservar(ctx, remitente, destino, wa, false, intervalo)
		if err != nil || espera == 0 || espera > esperaCorta {
			return espera, err
		}
		select {
		case <-ctx.Done():
			return espera, ctx.Err()
		case <-time.After(espera):
		}
	}
}

// enviarPruebaWA sends a test the person is waiting for: it takes the number's turn at once, but it is counted and
// pushes the next message of the queue.
func (s *Svc) enviarPruebaWA(ctx context.Context, cid uuid.UUID, c waCfg, numero string, w WhatsApp) (string, error) {
	rem := remitenteWA(c, cid)
	if _, err := s.reservar(ctx, rem, numero, true, true, intervaloWA()); err != nil {
		s.a.Log.Warn("turno de la prueba de WhatsApp", "err", err)
	}
	id, err := s.enviarWA(ctx, c, numero, w)
	var ew *errWA
	if err == nil || (errors.As(err, &ew) && !ew.pausa() && ew.codigo != 0) {
		s.anotar(ctx, rem, numero, true)
	}
	return id, err
}

// calentar restarts the warm-up of a number that is linked again (after a ban it starts at 30 a day).
func (s *Svc) calentar(ctx context.Context, remitente string) {
	_, _ = s.a.DB.Exec(ctx, `INSERT INTO envio_turnos (remitente) VALUES ($1) ON CONFLICT (remitente) DO UPDATE SET calentamiento_desde = now()`, remitente)
}

// zonaDe is the competition's time zone (Madrid by default).
func (s *Svc) zonaDe(ctx context.Context, cid uuid.UUID) *time.Location {
	if cid != uuid.Nil {
		if c, err := s.comps.ByID(ctx, cid); err == nil && c.ZonaHoraria != "" {
			if l, err := time.LoadLocation(c.ZonaHoraria); err == nil {
				return l
			}
		}
	}
	return horaMadrid()
}

// finSilencio is t, or the end of the quiet hours (22:00–09:00 in loc) when t falls in them.
func finSilencio(t time.Time, loc *time.Location) time.Time {
	l := t.In(loc)
	if l.Hour() >= silencioHasta && l.Hour() < silencioDesde {
		return t
	}
	fin := time.Date(l.Year(), l.Month(), l.Day(), silencioHasta, 0, 0, 0, loc)
	if l.Hour() >= silencioDesde {
		fin = fin.AddDate(0, 0, 1)
	}
	return fin
}

// silencio returns how long the quiet hours (22:00–09:00 in the competition's time zone, Madrid by default) still
// last; 0 outside them.
func (s *Svc) silencio(ctx context.Context, cid uuid.UUID) time.Duration {
	ahora := time.Now()
	return max(finSilencio(ahora, s.zonaDe(ctx, cid)).Sub(ahora), 0)
}

// porDiaWA is the daily cap of a number: 30 the first day after linking it, doubling every day, up to 150.
func porDiaWA(desde, ahora time.Time) int {
	return min(waPorDia, waCalentamiento<<min(int(ahora.Sub(desde)/(24*time.Hour)), 8))
}

// enCola is the outbox detail of a message waiting for its turn.
func enCola(motivo string, espera time.Duration) string {
	return motivo + ": sale hacia las " + time.Now().Add(espera).In(horaMadrid()).Format("15:04")
}

func horaMadrid() *time.Location {
	if l, err := time.LoadLocation("Europe/Madrid"); err == nil {
		return l
	}
	return time.UTC
}
