// Package crm owns the contacts of every competition (Figma page 61 · «Contactos»): who they are, where they came
// from, the proof of each consent (double opt-in for the news), unsubscribes and bounces, segments for campaigns
// (step 12) and the activity timeline. Other services publish `*.contacto` events (internal, never in the public
// stream); messaging publishes deliveries and bounces.
package crm

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func mustMigrations() fs.FS {
	m, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		panic(err)
	}
	return m
}

var bearer = []map[string][]string{{"bearer": {}}}

// Svc holds the service dependencies.
type Svc struct {
	a         *app.App
	comps     *compref.Resolver
	athletes  *svcclient.Client
	cms       *svcclient.Client
	ticketing *svcclient.Client
	messaging *svcclient.Client
	raffle    *svcclient.Client
	key       []byte
	webURL    string
}

// Service returns the crm service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "crm", Title: "GR Cup · crm", Migrations: mustMigrations(), NeedsDB: true, NeedsRedis: true, Setup: s.setup,
		Commands: map[string]func(context.Context, *app.App, []string) error{"seed-grcup": s.seedGRCup}}
}

func (s *Svc) init(a *app.App) {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "crm", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	s.athletes = svcclient.New(config.Str("UPSTREAM_ATHLETES", "http://athletes:8080"), "crm", "athletes", a.Cfg.InternalToken)
	s.cms = svcclient.New(config.Str("UPSTREAM_CMS", "http://cms:8080"), "crm", "cms", a.Cfg.InternalToken)
	s.ticketing = svcclient.New(config.Str("UPSTREAM_TICKETING", "http://ticketing:8080"), "crm", "ticketing", a.Cfg.InternalToken)
	s.messaging = svcclient.New(config.Str("UPSTREAM_MESSAGING", "http://messaging:8080"), "crm", "messaging", a.Cfg.InternalToken)
	s.raffle = svcclient.New(config.Str("UPSTREAM_RAFFLE", "http://raffle:8080"), "crm", "raffle", a.Cfg.InternalToken)
	m := hmac.New(sha256.New, []byte(a.Cfg.InternalToken))
	m.Write([]byte("grcup/crm/v1"))
	s.key = m.Sum(nil)
	s.webURL = strings.TrimRight(config.Str("PUBLIC_WEB_URL", "http://localhost:4200"), "/")
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.init(a)
	c := &events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: "crm", Start: "$", Handle: s.handle, Log: a.Log}
	a.Go(c.Run)
	a.Go(s.recordatorios)
	s.registerContactos()
	s.registerSegmentos()
	s.registerSupresiones()
	s.registerPublico()
	s.registerAudiencia()
	return nil
}

// ---- ingestion ----

// ConsentIn is a consent reported by the service that collected it.
type ConsentIn struct {
	Finalidad string `json:"finalidad"`
	Canal     string `json:"canal"`
	Estado    string `json:"estado"`
	Version   string `json:"version"`
	Hash      string `json:"hash"`
	Origen    string `json:"origen"`
	IP        string `json:"ip"`
	DOI       bool   `json:"doi"`
}

// ContactoIn is the payload of `*.contacto` events.
type ContactoIn struct {
	Email           string         `json:"email"`
	Telefono        string         `json:"telefono"`
	Nombre          string         `json:"nombre"`
	Origen          string         `json:"origen"`
	Relacion        map[string]any `json:"relacion"`
	Consentimientos []ConsentIn    `json:"consentimientos"`
	Revocar         []string       `json:"revocar" doc:"Finalidades que la persona retira"`
	Novedades       bool           `json:"novedades" doc:"Marcó la casilla de novedades: empieza el doble opt-in"`
	IP              string         `json:"ip"`
	Actividad       *struct {
		Tipo    string `json:"tipo"`
		Titulo  string `json:"titulo"`
		Detalle string `json:"detalle"`
	} `json:"actividad"`
}

func (s *Svc) handle(ctx context.Context, e events.Event) error {
	cid, err := uuid.Parse(e.CompetitionID)
	if err != nil {
		return nil
	}
	switch {
	case strings.HasSuffix(e.Type, ".contacto"):
		var in ContactoIn
		if json.Unmarshal(e.Data, &in) != nil {
			return nil
		}
		return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			_, err := s.ingest(ctx, tx, cid, in, e.OccurredAt)
			return err
		})
	case e.Type == "messaging.enviado":
		var d struct{ Para, Plantilla, Asunto, Canal string }
		if json.Unmarshal(e.Data, &d) != nil {
			return nil
		}
		col, tipo, det := "email", "email", "Email · enviado"
		if d.Canal == "whatsapp" {
			col, tipo, det, d.Para = "telefono", "whatsapp", "WhatsApp · enviado", normTel(d.Para)
		}
		_, err := s.a.DB.Exec(ctx, `WITH c AS (UPDATE contactos SET actividad_at = $4 WHERE competition_id = $1 AND `+col+` = $2 RETURNING id)
			INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle, at) SELECT $5, id, $6, $3, $7, $4 FROM c`,
			cid, d.Para, "Recibió «"+d.Asunto+"»", e.OccurredAt, newID(), tipo, det)
		return err
	case e.Type == "messaging.rebote":
		var d struct{ Para, Tipo, Motivo, Canal string }
		if json.Unmarshal(e.Data, &d) != nil {
			return nil
		}
		if d.Canal == "" {
			d.Canal = "email"
		}
		return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			return s.suprimir(ctx, tx, cid, d.Canal, d.Para, d.Tipo, d.Motivo, "messaging")
		})
	case e.Type == "messaging.baja":
		// «BAJA» answered on WhatsApp: suppression + the WhatsApp consent revoked (proof kept in the activity).
		var d struct{ Para, Motivo, Canal string }
		if json.Unmarshal(e.Data, &d) != nil || d.Canal != "whatsapp" {
			return nil
		}
		return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			if err := s.suprimir(ctx, tx, cid, "whatsapp", d.Para, "baja", d.Motivo, "whatsapp"); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `UPDATE consentimientos k SET estado = 'revocado', revocado_at = now() FROM contactos c
				WHERE k.contacto_id = c.id AND c.competition_id = $1 AND c.telefono = $2 AND k.finalidad = 'avisos_whatsapp' AND k.estado <> 'revocado'`, cid, normTel(d.Para))
			return err
		})
	}
	return nil
}

// ingest creates or updates a contact (by email, else phone) and merges relation, consents and activity.
func (s *Svc) ingest(ctx context.Context, tx pgx.Tx, cid uuid.UUID, in ContactoIn, at time.Time) (uuid.UUID, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email != "" {
		if a, err := mail.ParseAddress(email); err != nil || a.Address != email {
			email = ""
		}
	}
	tel := normTel(in.Telefono)
	if email == "" && tel == "" {
		return uuid.Nil, nil
	}
	var id uuid.UUID
	var rel map[string]any
	err := tx.QueryRow(ctx, `SELECT id, relacion FROM contactos WHERE competition_id = $1 AND ((email = $2 AND $2 <> '') OR (telefono = $3 AND $3 <> '')) AND anonimizado_at IS NULL
		ORDER BY (email = $2) DESC LIMIT 1 FOR UPDATE`, cid, email, tel).Scan(&id, &rel)
	if db.IsNoRows(err) {
		id, rel = newID(), map[string]any{}
		origen := in.Origen
		if origen == "" {
			origen = "web"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO contactos (id, competition_id, email, telefono, nombre, origen, created_at, actividad_at) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$7)`,
			id, cid, email, tel, strings.TrimSpace(in.Nombre), origen, at); err != nil {
			return id, err
		}
	} else if err != nil {
		return id, err
	}
	for k, v := range in.Relacion {
		if k == "sigue" {
			// Followed athletes accumulate.
			var list []string
			if old, ok := rel["sigue"].([]any); ok {
				for _, o := range old {
					if x, ok := o.(string); ok {
						list = append(list, x)
					}
				}
			}
			var nuevos []string
			switch x := v.(type) {
			case string:
				nuevos = []string{x}
			case []any:
				for _, o := range x {
					if s, ok := o.(string); ok {
						nuevos = append(nuevos, s)
					}
				}
			}
			for _, x := range nuevos {
				if x != "" && !slices.Contains(list, x) {
					list = append(list, x)
				}
			}
			if len(list) > 0 {
				rel["sigue"] = list
			}
			continue
		}
		rel[k] = v
	}
	if _, err := tx.Exec(ctx, `UPDATE contactos SET relacion = $2, nombre = CASE WHEN nombre = '' THEN $3 ELSE nombre END,
		email = COALESCE(email, NULLIF($4,'')), telefono = COALESCE(telefono, NULLIF($5,'')), actividad_at = GREATEST(actividad_at, $6) WHERE id = $1`,
		id, rel, strings.TrimSpace(in.Nombre), email, tel, at); err != nil {
		return id, err
	}
	if err := s.vincular(ctx, tx, cid, id, email, tel); err != nil {
		return id, err
	}
	for _, c := range in.Consentimientos {
		if err := s.consentir(ctx, tx, id, c, at); err != nil {
			return id, err
		}
	}
	for _, f := range in.Revocar {
		if _, err := tx.Exec(ctx, `UPDATE consentimientos SET estado = 'revocado', revocado_at = $3, revocado_motivo = 'Retirado por la persona' WHERE contacto_id = $1 AND finalidad = $2 AND estado <> 'revocado'`, id, f, at); err != nil {
			return id, err
		}
	}
	if in.Novedades && email != "" {
		if err := s.iniciarNovedades(ctx, tx, cid, id, email, in.Origen, in.IP); err != nil {
			return id, err
		}
	}
	if a := in.Actividad; a != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle, at) VALUES ($1,$2,$3,$4,$5,$6)`, newID(), id, a.Tipo, a.Titulo, a.Detalle, at); err != nil {
			return id, err
		}
	}
	return id, nil
}

// consentir records a consent; a confirmed one is never downgraded to pending by a repeated form.
func (s *Svc) consentir(ctx context.Context, tx pgx.Tx, contacto uuid.UUID, c ConsentIn, at time.Time) error {
	if c.Estado == "" {
		c.Estado = "confirmado"
	}
	var doi *time.Time
	if c.DOI && c.Estado == "confirmado" {
		doi = &at
	}
	_, err := tx.Exec(ctx, `INSERT INTO consentimientos (id, contacto_id, finalidad, canal, estado, texto_version, texto_hash, origen, ip, aceptado_at, doi_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (contacto_id, finalidad) DO UPDATE SET
			estado = CASE WHEN consentimientos.estado = 'confirmado' AND EXCLUDED.estado = 'pendiente' THEN 'confirmado' ELSE EXCLUDED.estado END,
			texto_version = EXCLUDED.texto_version, texto_hash = EXCLUDED.texto_hash, origen = EXCLUDED.origen, ip = EXCLUDED.ip,
			aceptado_at = CASE WHEN consentimientos.estado = 'confirmado' AND EXCLUDED.estado = 'pendiente' THEN consentimientos.aceptado_at ELSE EXCLUDED.aceptado_at END,
			doi_at = COALESCE(EXCLUDED.doi_at, consentimientos.doi_at), revocado_at = NULL, revocado_motivo = ''`,
		newID(), contacto, c.Finalidad, c.Canal, c.Estado, c.Version, c.Hash, c.Origen, anonIP(c.IP), at, doi)
	return err
}

// suprimir adds a destination to the do-not-send list (idempotent) and notes it on the contact.
func (s *Svc) suprimir(ctx context.Context, tx pgx.Tx, cid uuid.UUID, canal, destino, tipo, motivo, origen string) error {
	destino = strings.ToLower(strings.TrimSpace(destino))
	if destino == "" {
		return nil
	}
	var contacto *uuid.UUID
	var id uuid.UUID
	col := "email"
	if canal == "whatsapp" {
		col, destino = "telefono", normTel(destino)
	}
	if err := tx.QueryRow(ctx, `SELECT id FROM contactos WHERE competition_id = $1 AND `+col+` = $2`, cid, destino).Scan(&id); err == nil {
		contacto = &id
	}
	tag, err := tx.Exec(ctx, `INSERT INTO supresiones (id, competition_id, canal, destino_hash, destino_mascara, contacto_id, tipo, motivo, origen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (competition_id, canal, destino_hash) DO NOTHING`, newID(), cid, canal, s.hashDestino(destino), mascara(canal, destino), contacto, tipo, motivo, origen)
	if err != nil || tag.RowsAffected() == 0 || contacto == nil {
		return err
	}
	titulo := map[string]string{"baja": "Se dio de baja", "rebote": "Su email rebotó", "email_invalido": "Email no válido", "whatsapp_invalido": "WhatsApp no válido"}[tipo]
	_, err = tx.Exec(ctx, `INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle) VALUES ($1,$2,'supresion',$3,$4)`, newID(), *contacto, titulo, motivo)
	return err
}

// ---- helpers ----

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func (s *Svc) hashDestino(d string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte("destino:" + strings.ToLower(strings.TrimSpace(d))))
	return hex.EncodeToString(m.Sum(nil))
}

// mascara: «l***@email.com», «+34 6•• ••• 412».
func mascara(canal, d string) string {
	if canal == "email" {
		at := strings.LastIndex(d, "@")
		if at <= 0 {
			return "***"
		}
		first := []rune(d[:at])[0] // by rune: the address may start with an accented letter
		return string(first) + "***" + d[at:]
	}
	return maskTel(d)
}

func maskTel(t string) string {
	if len(t) < 7 {
		return "•••"
	}
	return t[:3] + " " + t[3:4] + "•• ••• " + t[len(t)-3:]
}

func normTel(t string) string {
	var b strings.Builder
	for i, r := range strings.TrimSpace(t) {
		if (r >= '0' && r <= '9') || (r == '+' && i == 0) {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if out != "" && !strings.HasPrefix(out, "+") {
		if len(out) == 9 {
			out = "+34" + out // Spanish numbers without prefix
		} else {
			out = "+" + out
		}
	}
	if len(out) < 8 || len(out) > 16 {
		return ""
	}
	return out
}

// anonIP keeps the /24 (IPv4) or /48 (IPv6): enough as proof, not enough to identify.
func anonIP(ip string) string {
	if ip == "" {
		return ""
	}
	if strings.Contains(ip, ".") {
		p := strings.Split(ip, ".")
		if len(p) == 4 {
			return p[0] + "." + p[1] + "." + p[2] + ".x"
		}
	}
	p := strings.Split(ip, ":")
	if len(p) > 3 {
		return strings.Join(p[:3], ":") + "::x"
	}
	return ip
}

func randomToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }

// bajaToken is the stable one-click unsubscribe link of a consent: b.<contact>.<purpose>.<hmac>.
func (s *Svc) bajaToken(contacto uuid.UUID, finalidad string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte("baja:" + contacto.String() + ":" + finalidad))
	return contacto.String() + "." + finalidad + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

func (s *Svc) validBaja(tok string) (uuid.UUID, string, bool) {
	p := strings.Split(tok, ".")
	if len(p) != 3 {
		return uuid.Nil, "", false
	}
	id, err := uuid.Parse(p[0])
	if err != nil {
		return uuid.Nil, "", false
	}
	return id, p[1], hmac.Equal([]byte(s.bajaToken(id, p[1])), []byte(tok))
}

func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}

func requireAny(ctx context.Context, cid uuid.UUID, perms ...string) (*auth.Principal, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return nil, err
	}
	for _, k := range perms {
		if p.Can(cid.String(), k) {
			return p, nil
		}
	}
	return nil, problem.Forbidden("Tu rol no tiene acceso a los contactos de esta competición.")
}

// email asks messaging to send a template (outbox → messaging consumer).
func email(ctx context.Context, tx pgx.Tx, cid uuid.UUID, para, plantilla string, vars map[string]string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "crm.email_solicitado", map[string]any{"para": para, "plantilla": plantilla, "vars": vars},
		events.Competition(cid.String()), events.Audience(events.Internal)))
}

// vincular links the suppressions recorded for these destinations before the contact existed (a bounce, an earlier
// erasure…), so lists, records and segment audiences see them.
func (s *Svc) vincular(ctx context.Context, tx pgx.Tx, cid, contacto uuid.UUID, email, tel string) error {
	for canal, d := range map[string]string{"email": email, "whatsapp": tel} {
		if d == "" {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE supresiones SET contacto_id = $4 WHERE competition_id = $1 AND canal = $2 AND destino_hash = $3 AND contacto_id IS NULL`,
			cid, canal, s.hashDestino(d), contacto); err != nil {
			return err
		}
	}
	return nil
}
