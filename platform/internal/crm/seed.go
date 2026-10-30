package crm

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

// seedGRCup creates «Datos de ejemplo» contacts for the GR Cup 2026: the five people of the Figma list (Laura
// confirmed, Pablo without consent, Marta pending, Iván bounced, Elena revoked) plus 140 synthetic ones with the
// origins of the current site, consents with their proof, suppressions and four segments. Emails use the reserved
// .test domain. Idempotent.
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "crm", "competition", a.Cfg.InternalToken)
	var c compref.Comp
	deadline := time.Now().Add(3 * time.Minute)
	for {
		err := comp.Do(ctx, http.MethodGet, "/internal/competiciones/slug/grcup", nil, &c)
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			return err
		}
		time.Sleep(5 * time.Second)
	}
	var hay bool
	if err := a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM contactos WHERE competition_id = $1)`, c.ID).Scan(&hay); err != nil || hay {
		return err
	}
	r := rand.New(rand.NewPCG(2026, 61))
	now := time.Now()
	ip := func() string { return fmt.Sprintf("83.45.%d.%d", r.IntN(250), r.IntN(250)) }
	type persona struct {
		nombre, email, tel, origen string
		rel                        map[string]any
		email_, wa                 string // consent states: confirmado / pendiente / revocado / ""
		sup                        [2]string
		hace                       time.Duration
	}
	figma := []persona{
		{"Laura Gómez Ruiz", "laura.gomez@ejemplo.test", "+34600111412", "ig_story", map[string]any{"entradas": 1, "boletos": 2, "sigue": []any{"Marta Ruiz Soler", "Carlos Sánchez", "Pablo Romero"}}, "confirmado", "confirmado", [2]string{}, 2 * time.Hour},
		{"Pablo Romero", "pablo.r@ejemplo.test", "", "directo", map[string]any{"entradas": 1, "boletos": 10}, "", "", [2]string{}, 26 * time.Hour},
		{"Marta Ruiz", "marta.ruiz@ejemplo.test", "+34600222088", "club", map[string]any{"entradas": 1}, "pendiente", "confirmado", [2]string{}, 40 * time.Hour},
		{"Iván Soler", "ivan.soler@ejemplo.test", "+34600333412", "voluntarios", map[string]any{"voluntario": true}, "confirmado", "", [2]string{"email:rebote", "whatsapp:whatsapp_invalido"}, 70 * time.Hour},
		{"Elena Castillo", "elena.c@ejemplo.test", "+34600444731", "avisame", map[string]any{"reserva": true}, "revocado", "revocado", [2]string{"whatsapp:baja"}, 120 * time.Hour},
	}
	nombres := []string{"Lucía", "Hugo", "Paula", "Álvaro", "Carmen", "Sergio", "Irene", "Adrián", "Alba", "Daniel", "Nerea", "Jorge", "Claudia", "Rubén", "Sara", "Víctor", "Julia", "Mario", "Noelia", "Iker"}
	apellidos := []string{"García", "Martínez", "López", "Navarro", "Torres", "Ramos", "Gil", "Serrano", "Molina", "Ortega", "Vidal", "Soler", "Puig", "Ferrer", "Ribes", "Climent"}
	origenes := []string{"ig_story", "ig_story", "ig_reel", "directo", "club", "avisame", "novedades", "inscripcion", "voluntarios", "web"}
	ppl := append([]persona(nil), figma...)
	for i := 0; i < 140; i++ {
		n := nombres[r.IntN(len(nombres))] + " " + apellidos[r.IntN(len(apellidos))]
		p := persona{nombre: n, email: fmt.Sprintf("%s.%d@ejemplo.test", sinAcentos.Replace(strings.ToLower(strings.Fields(n)[0])), i), origen: origenes[r.IntN(len(origenes))], rel: map[string]any{},
			hace: time.Duration(r.IntN(60*24)) * time.Hour}
		switch p.origen {
		case "avisame":
			p.rel["sigue"] = []any{[]string{"Laura Gómez Ruiz", "Carlos Sánchez", "Marta Ruiz Soler"}[r.IntN(3)]}
		case "voluntarios":
			p.rel["voluntario"] = true
		case "inscripcion":
			p.rel["atleta"] = true
		case "novedades":
			p.rel["novedades"] = true
		default:
			if r.IntN(3) > 0 {
				p.rel["entradas"] = 1 + r.IntN(3)
			}
		}
		switch x := r.IntN(10); {
		case x < 5:
			p.email_ = "confirmado"
		case x < 7:
			p.email_ = "pendiente"
		case x < 8:
			p.email_ = "revocado"
		}
		if r.IntN(10) < 4 {
			p.tel = fmt.Sprintf("+346%08d", r.IntN(100000000))
			if r.IntN(3) > 0 {
				p.wa = "confirmado"
			}
		}
		if p.email_ == "revocado" {
			p.sup[0] = "email:baja"
		} else if r.IntN(25) == 0 {
			p.sup[0] = "email:rebote"
		}
		ppl = append(ppl, p)
	}
	err := db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for _, p := range ppl {
			at := now.Add(-p.hace)
			id, err := s.ingest(ctx, tx, c.ID, ContactoIn{Email: p.email, Telefono: p.tel, Nombre: p.nombre, Origen: p.origen, Relacion: p.rel}, at)
			if err != nil {
				return err
			}
			if err := s.consentir(ctx, tx, id, ConsentIn{Finalidad: "privacidad", Estado: "confirmado", Version: "privacidad-v2026-10", Hash: "9f3a…c1", Origen: "/entradas · formulario de reserva", IP: ip()}, at); err != nil {
				return err
			}
			if p.email_ != "" {
				est := p.email_
				if est == "revocado" {
					est = "confirmado" // confirmed first, revoked below
				}
				if err := s.consentir(ctx, tx, id, ConsentIn{Finalidad: "novedades_email", Canal: "email", Estado: est,
					Version: VersionNovedades, Hash: hashNovedades, Origen: "/ · formulario de novedades", IP: ip(), DOI: p.email_ != "pendiente"}, at); err != nil {
					return err
				}
			}
			if p.wa != "" {
				if err := s.consentir(ctx, tx, id, ConsentIn{Finalidad: "avisos_whatsapp", Canal: "whatsapp", Estado: "confirmado", Version: "whatsapp-v2026-10", Hash: "4c1d…aa",
					Origen: "/entradas · casilla «Avisos por WhatsApp»", IP: ip()}, at); err != nil {
					return err
				}
			}
			if p.email_ == "pendiente" {
				// Example data: no real person to remind (the 48 h reminder only goes to real subscriptions).
				if _, err := tx.Exec(ctx, `UPDATE consentimientos SET recordado_at = now() WHERE contacto_id = $1 AND finalidad = 'novedades_email'`, id); err != nil {
					return err
				}
			}
			for f, st := range map[string]string{"novedades_email": p.email_, "avisos_whatsapp": p.wa} {
				if st != "revocado" {
					continue
				}
				if _, err := tx.Exec(ctx, `UPDATE consentimientos SET estado = 'revocado', revocado_at = $3, revocado_motivo = 'Enlace de baja' WHERE contacto_id = $1 AND finalidad = $2`, id, f, at.Add(48*time.Hour)); err != nil {
					return err
				}
			}
			for _, sp := range p.sup {
				if sp == "" {
					continue
				}
				canal, tipo, _ := strings.Cut(sp, ":")
				dest := p.email
				if canal == "whatsapp" {
					dest = p.tel
				}
				motivo := map[string]string{"rebote": "550 mailbox unavailable", "whatsapp_invalido": "El número no tiene WhatsApp (Meta 131026)", "baja": "Botón «Darme de baja»"}[tipo]
				if err := s.suprimir(ctx, tx, c.ID, canal, dest, tipo, motivo, "ejemplo"); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle, at) VALUES ($1,$2,'alta',$3,$4,$5)`, newID(), id, "Primer contacto", "Origen: "+p.origen, at); err != nil {
				return err
			}
		}
		for _, g := range []struct {
			n  string
			cs []Condicion
		}{
			{"Novedades confirmadas", nil},
			{"Público de Instagram", []Condicion{{Campo: "origen", Operador: "es", Valor: "ig_story,ig_reel"}}},
			{"Seguidores de atletas", []Condicion{{Campo: "relacion", Operador: "es", Valor: "seguidor"}}},
			{"Voluntarios", []Condicion{{Campo: "relacion", Operador: "es", Valor: "voluntario"}}},
		} {
			if g.cs == nil {
				g.cs = []Condicion{}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO segmentos (id, competition_id, nombre, condiciones) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, uuid.Must(uuid.NewV7()), c.ID, g.n, g.cs); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return errors.Join(errors.New("sembrar contactos"), err)
	}
	a.Log.Info("contactos de ejemplo", "n", len(ppl))
	return nil
}

var sinAcentos = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ñ", "n", "ü", "u")
