package fans

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Avisos al público (Jaime 15-nov): bienvenida al crear la cuenta, dos anuncios 40 minutos después (juegos y chat),
// horarios publicados, directo iniciado (cada día) y la víspera de la competición. Cada aviso sale UNA vez por cuenta
// (fan_avisos) y los que no son de la cuenta respetan la baja (avisos_baja_at).

const retrasoAnuncios = 40 * time.Minute

var (
	diasES  = []string{"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"}
	mesesES = []string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}
)

// diaLargo: «sábado 19 de diciembre».
func diaLargo(t time.Time) string {
	return diasES[t.Weekday()] + " " + strconv.Itoa(t.Day()) + " de " + mesesES[t.Month()-1]
}

func (s *Svc) bajaToken(fan uuid.UUID) string {
	m := hmac.New(sha256.New, []byte(s.a.Cfg.InternalToken+"|fans-avisos-baja"))
	m.Write(fan[:])
	return hex.EncodeToString(m.Sum(nil))[:32]
}

// varsDe are the variables every public notice can use.
func (s *Svc) varsDe(c compref.Comp, fan uuid.UUID, alias string) map[string]string {
	return map[string]string{
		"alias": alias, "competicion": c.Nombre,
		"enlace": s.webURL + "/en-directo", "area": s.webURL + "/area-atleta",
		"fantasy": s.webURL + "/fantasy", "porra": s.webURL + "/porra", "horarios": s.webURL + "/horarios", "entradas": s.webURL + "/entradas",
		"baja": s.webURL + "/api/competiciones/" + c.Slug + "/fans/avisos/baja?f=" + fan.String() + "&t=" + s.bajaToken(fan),
	}
}

// avisar records the notice and asks messaging for the email (and the WhatsApp, when the account gave a phone) in the
// same transaction: a second call with the same key sends nothing.
func (s *Svc) avisar(ctx context.Context, cid, fan uuid.UUID, para, tel, clave, plantilla string, vars map[string]string) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO fan_avisos (fan_id, clave) VALUES ($1, $2) ON CONFLICT DO NOTHING`, fan, clave)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		if err := emailSolicitado(ctx, tx, cid, para, plantilla, vars); err != nil {
			return err
		}
		if tel == "" {
			return nil
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "fans.whatsapp_solicitado", map[string]any{"para": tel, "plantilla": plantilla, "vars": vars},
			events.Competition(cid.String()), events.Audience(events.Internal)))
	})
}

type destinatario struct {
	id    uuid.UUID
	cid   uuid.UUID
	email string
	alias string
	tel   string
}

// publicoSin lists público accounts (not unsubscribed, not banned) created before «hasta» that have not had the
// notice yet; cid = uuid.Nil means every competition.
func (s *Svc) publicoSin(ctx context.Context, cid uuid.UUID, clave string, hasta time.Time, limite int) ([]destinatario, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT f.id, f.competition_id, f.email::text, f.alias::text, f.telefono FROM fans f
		WHERE ($1::uuid IS NULL OR f.competition_id = $1) AND f.tipo = 'publico' AND f.avisos_baja_at IS NULL
		AND (f.baneado_hasta IS NULL OR f.baneado_hasta < now())
		AND f.created_at <= $4 AND NOT EXISTS (SELECT 1 FROM fan_avisos a WHERE a.fan_id = f.id AND a.clave = $2) ORDER BY f.created_at LIMIT $3`, uuidOrNil(cid), clave, limite, hasta)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []destinatario
	for rows.Next() {
		var d destinatario
		if err := rows.Scan(&d.id, &d.cid, &d.email, &d.alias, &d.tel); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func uuidOrNil(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}

// enviarATodos sends a notice to every público account of the competition still without it (in batches).
func (s *Svc) enviarATodos(ctx context.Context, cid uuid.UUID, clave, plantilla string, extra map[string]string) error {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return err
	}
	for {
		ds, err := s.publicoSin(ctx, cid, clave, time.Now(), 200)
		if err != nil || len(ds) == 0 {
			return err
		}
		for _, d := range ds {
			v := s.varsDe(c, d.id, d.alias)
			for k, x := range extra {
				v[k] = x
			}
			if err := s.avisar(ctx, cid, d.id, d.email, d.tel, clave, plantilla, v); err != nil {
				return err
			}
		}
	}
}

// bienvenida: the email of a new account (público or atleta).
func (s *Svc) bienvenida(ctx context.Context, row fanRow) {
	c, err := s.comps.ByID(ctx, row.CompetitionID)
	if err != nil {
		s.a.Log.Warn("bienvenida: competición no disponible", "err", err)
		return
	}
	plantilla := "publico-cuenta-creada"
	if row.Tipo == "atleta" {
		plantilla = "atleta-cuenta-creada"
	}
	if err := s.avisar(ctx, row.CompetitionID, row.ID, row.Email, row.Telefono, "bienvenida", plantilla, s.varsDe(c, row.ID, row.Alias)); err != nil {
		s.a.Log.Warn("bienvenida no enviada", "err", err)
	}
}

// avisosWorker sends the announcements (40 min after the account) and the eve of the competition.
func (s *Svc) avisosWorker(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		if err := s.anuncios(ctx); err != nil {
			s.a.Log.Warn("anuncios del público", "err", err)
		}
		if err := s.vispera(ctx); err != nil {
			s.a.Log.Warn("aviso de la víspera", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (s *Svc) anuncios(ctx context.Context) error {
	for _, a := range []struct{ clave, plantilla string }{{"anuncio-juegos", "publico-anuncio-juegos"}, {"anuncio-chat", "publico-anuncio-chat"}} {
		ds, err := s.publicoSin(ctx, uuid.Nil, a.clave, time.Now().Add(-retrasoAnuncios), 200)
		if err != nil {
			return err
		}
		comps := map[uuid.UUID]compref.Comp{}
		for _, d := range ds {
			c, ok := comps[d.cid]
			if !ok {
				if c, err = s.comps.ByID(ctx, d.cid); err != nil {
					return err
				}
				comps[d.cid] = c
			}
			if err := s.avisar(ctx, d.cid, d.id, d.email, d.tel, a.clave, a.plantilla, s.varsDe(c, d.id, d.alias)); err != nil {
				return err
			}
		}
	}
	return nil
}

// vispera: «La competición se acerca» from 10:00 of the day before the first day until the competition starts.
func (s *Svc) vispera(ctx context.Context) error {
	rows, err := s.a.DB.Query(ctx, `SELECT DISTINCT competition_id FROM fans WHERE tipo = 'publico'`)
	if err != nil {
		return err
	}
	cids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return err
	}
	for _, cid := range cids {
		c, err := s.comps.ByID(ctx, cid)
		if err != nil || c.FechaInicio == "" {
			continue
		}
		loc := madrid
		if l, err := time.LoadLocation(c.ZonaHoraria); err == nil && c.ZonaHoraria != "" {
			loc = l
		}
		dia, err := time.ParseInLocation("2006-01-02", c.FechaInicio[:min(10, len(c.FechaInicio))], loc)
		if err != nil {
			continue
		}
		desde, ahora := dia.Add(-14*time.Hour), time.Now() // the day before at 10:00
		if ahora.Before(desde) || !ahora.Before(dia) {
			continue
		}
		lugar := c.Sede.Nombre
		if c.Sede.Ciudad != "" && !strings.Contains(lugar, c.Sede.Ciudad) {
			lugar = strings.TrimPrefix(lugar+", "+c.Sede.Ciudad, ", ")
		}
		if err := s.enviarATodos(ctx, cid, "competicion-cerca", "publico-competicion-cerca", map[string]string{"dia": diaLargo(dia), "lugar": lugar}); err != nil {
			return err
		}
	}
	return nil
}

// registerAvisos: the consumer (horarios, directo), the worker and the unsubscribe link.
func (s *Svc) registerAvisos() {
	c := &events.Consumer{Redis: s.a.Redis, DB: s.a.DB, Stream: s.a.Stream(), Group: "fans-avisos", Start: "$",
		Types: []string{"horarios.publicados", "directo.retransmision"}, Handle: s.handleAviso, Log: s.a.Log}
	s.a.Go(c.Run)
	s.a.Go(s.avisosWorker)

	type bajaIn struct {
		Slug string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		F    uuid.UUID `query:"f"`
		T    string    `query:"t" maxLength:"64"`
	}
	type bajaOut struct {
		Location string `header:"Location"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "fans-avisos-baja", Method: http.MethodGet, Path: "/api/competiciones/{slug}/fans/avisos/baja",
		Summary: "Darse de baja de los avisos del directo (enlace del email)", Tags: tagFans, DefaultStatus: http.StatusSeeOther},
		func(ctx context.Context, in *bajaIn) (*bajaOut, error) {
			if hmac.Equal([]byte(in.T), []byte(s.bajaToken(in.F))) {
				if _, err := s.a.DB.Exec(ctx, `UPDATE fans SET avisos_baja_at = COALESCE(avisos_baja_at, now()) WHERE id = $1`, in.F); err != nil {
					return nil, err
				}
			}
			return &bajaOut{Location: s.webURL + "/en-directo?avisos=baja"}, nil
		})
}

func (s *Svc) handleAviso(ctx context.Context, e events.Event) error {
	cid, err := uuid.Parse(e.CompetitionID)
	if err != nil {
		return nil
	}
	switch e.Type {
	case "horarios.publicados":
		var d struct {
			Version int `json:"version"`
		}
		if json.Unmarshal(e.Data, &d) != nil || d.Version != 1 {
			return nil // only the first publication: later versions only reach the athletes affected
		}
		return s.enviarATodos(ctx, cid, "horarios-publicados", "publico-horarios-publicados", nil)
	case "directo.retransmision":
		type estado struct {
			StreamURL string `json:"streamUrl"`
			Visible   bool   `json:"visible"`
		}
		var d struct {
			Antes   estado `json:"antes"`
			Despues estado `json:"despues"`
		}
		if json.Unmarshal(e.Data, &d) != nil {
			return nil
		}
		empieza := d.Despues.Visible && d.Despues.StreamURL != ""
		yaEstaba := d.Antes.Visible && d.Antes.StreamURL != ""
		if !empieza || yaEstaba {
			return nil
		}
		hoy := time.Now().In(madrid)
		return s.enviarATodos(ctx, cid, "directo-"+hoy.Format("2006-01-02"), "publico-directo-iniciado", map[string]string{"dia": diaLargo(hoy)})
	}
	return nil
}

// normTelefono keeps the digits of an optional phone with its country prefix (Spain by default for 9 digits):
// «+34 600 123 456» → «34600123456». Empty is valid (no phone).
func normTelefono(t string) (string, bool) {
	t = strings.TrimSpace(t)
	if t == "" {
		return "", true
	}
	var b strings.Builder
	for _, r := range t {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		} else if !strings.ContainsRune(" +-.()", r) {
			return "", false
		}
	}
	d := strings.TrimPrefix(b.String(), "00")
	if len(d) == 9 && (d[0] == '6' || d[0] == '7') {
		d = "34" + d
	}
	if len(d) < 10 || len(d) > 15 {
		return "", false
	}
	return d, true
}

// registerTelefono: PUT /fans/yo/telefono sets or removes (empty) the optional phone of the session.
func (s *Svc) registerTelefono() {
	type in struct {
		SesionIn
		SlugIn
		Body struct {
			Telefono string `json:"telefono" maxLength:"30" doc:"Móvil con prefijo; vacío = quitarlo"`
		}
	}
	type out struct{ Body Yo }
	huma.Register(s.a.API, huma.Operation{OperationID: "fans-yo-telefono", Method: http.MethodPut, Path: "/api/competiciones/{slug}/fans/yo/telefono",
		Summary: "Guardar o quitar mi teléfono (avisos por WhatsApp, opcional)", Tags: tagFans},
		func(ctx context.Context, i *in) (*out, error) {
			cid, err := s.comps.ID(ctx, i.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.sesion(ctx, cid, i.Session, i.Header)
			if err != nil {
				return nil, err
			}
			tel, ok := normTelefono(i.Body.Telefono)
			if !ok {
				return nil, problem.Unprocessable("TELEFONO_NO_VALIDO", "El teléfono no es válido. Escríbelo con prefijo, p. ej. +34 600 123 456, o déjalo vacío.")
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, `UPDATE fans SET telefono = $3, updated_at = now() WHERE id = $1 AND competition_id = $2
				RETURNING id, competition_id, email::text, tipo, alias::text, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), baneado_hasta, baneado_motivo, version, created_at, telefono`, f.ID, cid, tel))
			if err != nil {
				return nil, err
			}
			return &out{Body: s.yoDe(row)}, nil
		})
}
