package crm

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Contactos"}

const baseC = "/api/admin/competiciones/{cid}"

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

type idIn struct {
	CID uuid.UUID `path:"cid"`
	ID  uuid.UUID `path:"id"`
}

// ContactoItem is a row of the list.
type ContactoItem struct {
	ID          uuid.UUID `json:"id"`
	Nombre      string    `json:"nombre"`
	Email       string    `json:"email"`
	Telefono    string    `json:"telefono" doc:"Enmascarado salvo con contactos.exportar"`
	Origen      string    `json:"origen"`
	EmailEstado string    `json:"emailEstado" enum:"confirmado,pendiente,no,revocado,rebotado,no_valido"`
	WAEstado    string    `json:"whatsappEstado" enum:"aceptado,no,baja,no_valido,"`
	Relacion    string    `json:"relacion"`
	Ultima      time.Time `json:"ultimaActividad"`
	Anonimizado bool      `json:"anonimizado"`
}

// Kpis of the list header.
type Kpis struct {
	Contactos  int     `json:"contactos"`
	Nuevos7d   int     `json:"nuevos7d"`
	Email      int     `json:"email" doc:"Novedades por email confirmadas (doble opt-in)"`
	EmailNuevo int     `json:"emailNuevos7d"`
	PctEmail   float64 `json:"pctEmail"`
	WhatsApp   int     `json:"whatsapp"`
	WANuevo    int     `json:"whatsappNuevos7d"`
	PctWA      float64 `json:"pctWhatsapp"`
	Bajas      int     `json:"bajas" doc:"Bajas y rebotes"`
	PctBajas   float64 `json:"pctBajas"`
	Serie      []int   `json:"serie" doc:"Contactos nuevos por día (14 días)"`
}

const selItem = `SELECT c.id, c.nombre, COALESCE(c.email::text, ''), COALESCE(c.telefono, ''), c.origen, c.relacion, c.actividad_at, c.anonimizado_at IS NOT NULL,
	COALESCE((SELECT estado FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = 'novedades_email'), ''),
	COALESCE((SELECT estado FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = 'avisos_whatsapp'), ''),
	COALESCE((SELECT tipo FROM supresiones x WHERE x.competition_id = c.competition_id AND x.canal = 'email' AND x.contacto_id = c.id ORDER BY created_at DESC LIMIT 1), ''),
	COALESCE((SELECT tipo FROM supresiones x WHERE x.competition_id = c.competition_id AND x.canal = 'whatsapp' AND x.contacto_id = c.id ORDER BY created_at DESC LIMIT 1), '')
	FROM contactos c`

func scanItem(r pgx.CollectableRow, verTel bool) (ContactoItem, error) {
	var it ContactoItem
	var rel map[string]any
	var em, wa, supE, supW string
	if err := r.Scan(&it.ID, &it.Nombre, &it.Email, &it.Telefono, &it.Origen, &rel, &it.Ultima, &it.Anonimizado, &em, &wa, &supE, &supW); err != nil {
		return it, err
	}
	switch {
	case supE == "rebote":
		it.EmailEstado = "rebotado"
	case supE == "email_invalido":
		it.EmailEstado = "no_valido"
	case em == "":
		it.EmailEstado = "no"
	default:
		it.EmailEstado = em
	}
	switch {
	case it.Telefono == "":
		it.WAEstado = ""
	case supW == "whatsapp_invalido":
		it.WAEstado = "no_valido"
	case supW == "baja" || wa == "revocado":
		it.WAEstado = "baja"
	case wa == "confirmado":
		it.WAEstado = "aceptado"
	default:
		it.WAEstado = "no"
	}
	if it.Telefono != "" && !verTel {
		it.Telefono = maskTel(it.Telefono)
	}
	it.Relacion = relacionTexto(rel)
	return it, nil
}

// relacionTexto: «Atleta · sigue a 3 · voluntario».
func relacionTexto(rel map[string]any) string {
	var p []string
	if rel["atleta"] == true {
		p = append(p, "Atleta")
	}
	if rel["reserva"] == true {
		p = append(p, "Lista de espera")
	}
	if v, ok := rel["entradas"].(float64); ok && v > 0 {
		if v == 1 {
			p = append(p, "Entrada")
		} else {
			p = append(p, fmt.Sprintf("%d entradas", int(v)))
		}
	}
	if v, ok := rel["boletos"].(float64); ok && v > 0 {
		p = append(p, fmt.Sprintf("%d boletos", int(v)))
	}
	if l, ok := rel["sigue"].([]any); ok && len(l) > 0 {
		if len(l) == 1 {
			p = append(p, fmt.Sprintf("sigue a %v", l[0]))
		} else {
			p = append(p, fmt.Sprintf("sigue a %d", len(l)))
		}
	}
	if rel["voluntario"] == true {
		p = append(p, "Voluntario")
	}
	if len(p) == 0 && rel["novedades"] == true {
		p = append(p, "Novedades")
	}
	return strings.Join(p, " · ")
}

type listaIn struct {
	CID    uuid.UUID `path:"cid"`
	Q      string    `query:"q" maxLength:"100"`
	Origen string    `query:"origen" maxLength:"40"`
	Canal  string    `query:"canal" enum:",email,whatsapp"`
	Estado string    `query:"estado" enum:",confirmado,pendiente,revocado,rebotado,no"`
	Rel    string    `query:"relacion" enum:",atleta,seguidor,voluntario,reserva,novedades"`
	Pagina int       `query:"pagina" minimum:"1" default:"1"`
	Por    int       `query:"por" minimum:"1" maximum:"5000" default:"25"`
}

// filtro builds the WHERE of the list (also used by the CSV export).
func filtro(in listaIn) (string, []any) {
	w := []string{"c.competition_id = $1"}
	args := []any{in.CID}
	add := func(cond string, v any) {
		args = append(args, v)
		w = append(w, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if q := strings.TrimSpace(in.Q); q != "" {
		add(`(lower(c.nombre) LIKE ? OR c.email::text LIKE ? OR c.telefono LIKE ?)`, "%"+strings.ToLower(q)+"%")
	}
	if in.Origen != "" {
		add(`c.origen = ?`, in.Origen)
	}
	fin := map[string]string{"email": "novedades_email", "whatsapp": "avisos_whatsapp"}[in.Canal]
	if fin == "" {
		fin = "novedades_email"
	}
	switch in.Estado {
	case "confirmado", "pendiente", "revocado":
		args = append(args, fin, in.Estado)
		w = append(w, fmt.Sprintf(`EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = $%d AND k.estado = $%d)`, len(args)-1, len(args)))
	case "rebotado":
		w = append(w, `EXISTS (SELECT 1 FROM supresiones x WHERE x.contacto_id = c.id AND x.tipo IN ('rebote', 'email_invalido', 'whatsapp_invalido'))`)
	case "no":
		add(`NOT EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = ?)`, fin)
	}
	if in.Canal == "whatsapp" && in.Estado == "" {
		w = append(w, `c.telefono IS NOT NULL`)
	}
	switch in.Rel {
	case "atleta", "voluntario", "reserva", "novedades":
		add(`(c.relacion ->> ?) = 'true'`, in.Rel)
	case "seguidor":
		w = append(w, `jsonb_typeof(c.relacion -> 'sigue') = 'array' AND jsonb_array_length(c.relacion -> 'sigue') > 0`)
	}
	return strings.Join(w, " AND "), args
}

func (s *Svc) kpis(ctx context.Context, cid uuid.UUID) (Kpis, error) {
	var k Kpis
	err := s.a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE anonimizado_at IS NULL), count(*) FILTER (WHERE created_at > now() - interval '7 days' AND anonimizado_at IS NULL),
		(SELECT count(*) FROM consentimientos k JOIN contactos c2 ON c2.id = k.contacto_id WHERE c2.competition_id = $1 AND k.finalidad = 'novedades_email' AND k.estado = 'confirmado'),
		(SELECT count(*) FROM consentimientos k JOIN contactos c2 ON c2.id = k.contacto_id WHERE c2.competition_id = $1 AND k.finalidad = 'novedades_email' AND k.estado = 'confirmado' AND k.doi_at > now() - interval '7 days'),
		(SELECT count(*) FROM consentimientos k JOIN contactos c2 ON c2.id = k.contacto_id WHERE c2.competition_id = $1 AND k.finalidad = 'avisos_whatsapp' AND k.estado = 'confirmado'),
		(SELECT count(*) FROM consentimientos k JOIN contactos c2 ON c2.id = k.contacto_id WHERE c2.competition_id = $1 AND k.finalidad = 'avisos_whatsapp' AND k.estado = 'confirmado' AND k.aceptado_at > now() - interval '7 days'),
		(SELECT count(*) FROM supresiones WHERE competition_id = $1)
		FROM contactos WHERE competition_id = $1`, cid).Scan(&k.Contactos, &k.Nuevos7d, &k.Email, &k.EmailNuevo, &k.WhatsApp, &k.WANuevo, &k.Bajas)
	if err != nil {
		return k, err
	}
	pct := func(a, b int) float64 {
		if b == 0 {
			return 0
		}
		return float64(int(float64(a)/float64(b)*1000)) / 10
	}
	k.PctEmail, k.PctWA, k.PctBajas = pct(k.Email, k.Contactos), pct(k.WhatsApp, k.Contactos), pct(k.Bajas, k.Contactos+k.Bajas)
	k.Serie = make([]int, 14)
	rows, err := s.a.DB.Query(ctx, `SELECT (now()::date - created_at::date), count(*) FROM contactos WHERE competition_id = $1 AND created_at > now() - interval '14 days' GROUP BY 1`, cid)
	if err == nil {
		for rows.Next() {
			var d, n int
			if rows.Scan(&d, &n) == nil && d >= 0 && d < 14 {
				k.Serie[13-d] = n
			}
		}
		rows.Close()
	}
	return k, nil
}

// Consentimiento is a consent with its proof (record view).
type Consentimiento struct {
	Finalidad  string     `json:"finalidad"`
	Canal      string     `json:"canal"`
	Estado     string     `json:"estado"`
	Version    string     `json:"version"`
	Hash       string     `json:"hash"`
	Origen     string     `json:"origen"`
	IP         string     `json:"ip"`
	AceptadoAt time.Time  `json:"aceptadoAt"`
	DoiAt      *time.Time `json:"doiAt,omitempty"`
	RevocadoAt *time.Time `json:"revocadoAt,omitempty"`
	Motivo     string     `json:"motivo,omitempty"`
}

// Actividad is a line of the record timeline.
type Actividad struct {
	Tipo    string    `json:"tipo"`
	Titulo  string    `json:"titulo"`
	Detalle string    `json:"detalle"`
	At      time.Time `json:"at"`
}

// Ficha is the contact record (Figma 61 · «Contactos · ficha»).
type Ficha struct {
	ContactoItem
	Etiquetas       []string         `json:"etiquetas"`
	CreatedAt       time.Time        `json:"createdAt"`
	Consentimientos []Consentimiento `json:"consentimientos"`
	Actividad       []Actividad      `json:"actividad"`
	Supresiones     []Supresion      `json:"supresiones"`
	Version         int              `json:"version"`
}

func (s *Svc) ficha(ctx context.Context, cid, id uuid.UUID, verTel bool) (Ficha, error) {
	var f Ficha
	rows, err := s.a.DB.Query(ctx, selItem+` WHERE c.competition_id = $1 AND c.id = $2`, cid, id)
	if err != nil {
		return f, err
	}
	it, err := pgx.CollectExactlyOneRow(rows, func(r pgx.CollectableRow) (ContactoItem, error) { return scanItem(r, verTel) })
	if db.IsNoRows(err) {
		return f, problem.NotFound("Ese contacto no existe.")
	}
	if err != nil {
		return f, err
	}
	f.ContactoItem = it
	if err := s.a.DB.QueryRow(ctx, `SELECT etiquetas, created_at, version FROM contactos WHERE id = $1`, id).Scan(&f.Etiquetas, &f.CreatedAt, &f.Version); err != nil {
		return f, err
	}
	rows, err = s.a.DB.Query(ctx, `SELECT finalidad, canal, estado, texto_version, texto_hash, origen, ip, aceptado_at, doi_at, revocado_at, revocado_motivo FROM consentimientos WHERE contacto_id = $1
		ORDER BY array_position(ARRAY['privacidad','novedades_email','avisos_whatsapp','avisos_atleta','imagen'], finalidad)`, id)
	if err != nil {
		return f, err
	}
	if f.Consentimientos, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (Consentimiento, error) {
		var c Consentimiento
		err := r.Scan(&c.Finalidad, &c.Canal, &c.Estado, &c.Version, &c.Hash, &c.Origen, &c.IP, &c.AceptadoAt, &c.DoiAt, &c.RevocadoAt, &c.Motivo)
		return c, err
	}); err != nil {
		return f, err
	}
	rows, err = s.a.DB.Query(ctx, `SELECT tipo, titulo, detalle, at FROM actividad WHERE contacto_id = $1 ORDER BY at DESC LIMIT 50`, id)
	if err != nil {
		return f, err
	}
	if f.Actividad, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Actividad]); err != nil {
		return f, err
	}
	f.Supresiones, err = s.supresiones(ctx, cid, `contacto_id = $2`, id)
	return f, err
}

func (s *Svc) registerContactos() {
	api := s.a.API
	type listaOut struct {
		Body struct {
			Items    []ContactoItem `json:"items"`
			Total    int            `json:"total"`
			Pagina   int            `json:"pagina"`
			Por      int            `json:"por"`
			Kpis     Kpis           `json:"kpis"`
			Origenes []string       `json:"origenes"`
			Pestanas map[string]int `json:"pestanas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "contactos-list", Method: http.MethodGet, Path: baseC + "/contactos", Summary: "Contactos con filtros y KPIs (teléfonos enmascarados)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*listaOut, error) {
			p, err := auth.Require(ctx, in.CID.String(), "contactos.ver")
			if err != nil {
				return nil, err
			}
			verTel := p.Can(in.CID.String(), "contactos.exportar")
			where, args := filtro(*in)
			o := &listaOut{}
			o.Body.Pagina, o.Body.Por = in.Pagina, min(in.Por, 100)
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM contactos c WHERE `+where, args...).Scan(&o.Body.Total); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, selItem+` WHERE `+where+fmt.Sprintf(` ORDER BY c.actividad_at DESC LIMIT %d OFFSET %d`, o.Body.Por, (in.Pagina-1)*o.Body.Por), args...)
			if err != nil {
				return nil, err
			}
			if o.Body.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (ContactoItem, error) { return scanItem(r, verTel) }); err != nil {
				return nil, err
			}
			if o.Body.Kpis, err = s.kpis(ctx, in.CID); err != nil {
				return nil, err
			}
			rows, err = s.a.DB.Query(ctx, `SELECT DISTINCT origen FROM contactos WHERE competition_id = $1 ORDER BY 1`, in.CID)
			if err != nil {
				return nil, err
			}
			if o.Body.Origenes, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
				return nil, err
			}
			o.Body.Pestanas = map[string]int{"contactos": o.Body.Kpis.Contactos}
			var segs, sups int
			_ = s.a.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM segmentos WHERE competition_id = $1), (SELECT count(*) FROM supresiones WHERE competition_id = $1)`, in.CID).Scan(&segs, &sups)
			o.Body.Pestanas["segmentos"], o.Body.Pestanas["supresiones"] = segs, sups
			return o, nil
		})

	type fichaOut struct {
		ETag string `header:"ETag"`
		Body Ficha
	}
	huma.Register(api, huma.Operation{OperationID: "contactos-ficha", Method: http.MethodGet, Path: baseC + "/contactos/{id}", Summary: "Ficha: datos, consentimientos con su prueba y actividad", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*fichaOut, error) {
			p, err := auth.Require(ctx, in.CID.String(), "contactos.ver")
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID, p.Can(in.CID.String(), "contactos.exportar"))
			return &fichaOut{ETag: fmt.Sprintf(`W/"%d"`, f.Version), Body: f}, err
		})

	type rectIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Nombre    string   `json:"nombre" maxLength:"120"`
			Email     string   `json:"email,omitempty" maxLength:"254"`
			Telefono  string   `json:"telefono,omitempty" maxLength:"30"`
			Etiquetas []string `json:"etiquetas,omitempty" maxItems:"20"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "contactos-rectificar", Method: http.MethodPut, Path: baseC + "/contactos/{id}", Summary: "Rectificar datos (RGPD)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *rectIn) (*fichaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			b := in.Body
			em := strings.ToLower(strings.TrimSpace(b.Email))
			tel := normTel(b.Telefono)
			if b.Telefono != "" && tel == "" {
				return nil, problem.Unprocessable("TELEFONO_INVALIDO", "Revisa el teléfono (formato internacional, p. ej. +34 600 000 000).")
			}
			if b.Etiquetas == nil {
				b.Etiquetas = []string{}
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var ver int
				var anon bool
				if err := tx.QueryRow(ctx, `SELECT version, anonimizado_at IS NOT NULL FROM contactos WHERE competition_id = $1 AND id = $2 FOR UPDATE`, in.CID, in.ID).Scan(&ver, &anon); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Ese contacto no existe.")
					}
					return err
				}
				if anon {
					return problem.Conflict("CONTACTO_ANONIMIZADO", "Este contacto se suprimió: ya no tiene datos que rectificar.")
				}
				if in.IfMatch != "" && in.IfMatch != fmt.Sprintf(`W/"%d"`, ver) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado este contacto. Recarga para ver sus cambios.")
				}
				if em == "" && tel == "" {
					return problem.Unprocessable("SIN_CANAL", "Deja al menos un email o un teléfono.")
				}
				_, err := tx.Exec(ctx, `UPDATE contactos SET nombre = $3, email = NULLIF($4,''), telefono = NULLIF($5,''), etiquetas = $6, version = version + 1 WHERE competition_id = $1 AND id = $2`,
					in.CID, in.ID, strings.TrimSpace(b.Nombre), em, tel, b.Etiquetas)
				if db.IsUniqueViolation(err, "") {
					return problem.Conflict("CONTACTO_DUPLICADO", "Ya hay otro contacto con ese email o teléfono.")
				}
				if err != nil {
					return err
				}
				if err := s.vincular(ctx, tx, in.CID, in.ID, em, tel); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle) VALUES ($1,$2,'rgpd','Datos rectificados',$3)`, newID(), in.ID, "Por "+actor(ctx)); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.contacto_rectificado", map[string]any{"id": in.ID}, events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID, true)
			return &fichaOut{ETag: fmt.Sprintf(`W/"%d"`, f.Version), Body: f}, err
		})

	type accesoOut struct {
		Disposition string `header:"Content-Disposition"`
		Body        Ficha
	}
	huma.Register(api, huma.Operation{OperationID: "contactos-rgpd-acceso", Method: http.MethodGet, Path: baseC + "/contactos/{id}/rgpd/acceso", Summary: "Exportar sus datos (derecho de acceso, JSON)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*accesoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID, true)
			if err != nil {
				return nil, err
			}
			_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO actividad (id, contacto_id, tipo, titulo, detalle) VALUES ($1,$2,'rgpd','Exportación de sus datos (acceso)',$3)`, newID(), in.ID, "Por "+actor(ctx)); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.rgpd_acceso", map[string]any{"id": in.ID}, events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
			return &accesoOut{Disposition: `attachment; filename="contacto-` + in.ID.String()[:8] + `.json"`, Body: f}, nil
		})

	type supOut struct {
		Body struct {
			Seguimientos int  `json:"seguimientos" doc:"Avisos de atletas borrados (athletes)"`
			Voluntarios  int  `json:"voluntarios" doc:"Solicitudes de voluntariado borradas (cms)"`
			Entradas     int  `json:"entradas" doc:"Entradas anonimizadas (ticketing)"`
			Atleta       bool `json:"atleta" doc:"Es atleta inscrito: su ficha se gestiona en «Atletas»"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "contactos-rgpd-supresion", Method: http.MethodPost, Path: baseC + "/contactos/{id}/rgpd/supresion", Summary: "Suprimir (derecho de supresión): también en atletas y voluntarios; anonimiza y bloquea sus canales", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*supOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			o := &supOut{}
			var em0, tel0 *string
			if err := s.a.DB.QueryRow(ctx, `SELECT email::text, telefono FROM contactos WHERE competition_id = $1 AND id = $2 AND anonimizado_at IS NULL`, in.CID, in.ID).Scan(&em0, &tel0); err != nil {
				if db.IsNoRows(err) {
					return nil, problem.NotFound("Ese contacto no existe o ya se suprimió.")
				}
				return nil, err
			}
			// The services that collected the data erase it first; if one is down nothing changes (the request can be retried).
			body := map[string]string{}
			if em0 != nil {
				body["email"] = *em0
			}
			if tel0 != nil {
				body["telefono"] = *tel0
			}
			path := "/internal/competiciones/" + in.CID.String() + "/rgpd/supresion"
			if err := s.athletes.Do(ctx, http.MethodPost, path, body, &o.Body); err != nil {
				s.a.Log.Warn("supresión en athletes", "err", err)
				return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido borrar sus avisos de atletas. No se ha cambiado nada: inténtalo en unos segundos.")
			}
			var vol struct {
				Voluntarios int `json:"voluntarios"`
			}
			if err := s.cms.Do(ctx, http.MethodPost, path, body, &vol); err != nil {
				s.a.Log.Warn("supresión en cms", "err", err)
				return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido borrar su solicitud de voluntariado. Inténtalo en unos segundos.")
			}
			o.Body.Voluntarios = vol.Voluntarios
			var ent struct {
				Entradas int `json:"entradas"`
			}
			if err := s.ticketing.Do(ctx, http.MethodPost, path, body, &ent); err != nil {
				s.a.Log.Warn("supresión en ticketing", "err", err)
				return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido anonimizar sus entradas. Inténtalo en unos segundos.")
			}
			o.Body.Entradas = ent.Entradas
			if err := s.raffle.Do(ctx, http.MethodPost, path, body, nil); err != nil {
				s.a.Log.Warn("supresión en raffle", "err", err)
				return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido anonimizar sus compras del sorteo. Inténtalo en unos segundos.")
			}
			if err := s.messaging.Do(ctx, http.MethodPost, path, body, nil); err != nil {
				s.a.Log.Warn("supresión en messaging", "err", err)
				return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No hemos podido borrar sus envíos de campañas. Inténtalo en unos segundos.")
			}
			return o, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var em, tel *string
				if err := tx.QueryRow(ctx, `SELECT email::text, telefono FROM contactos WHERE competition_id = $1 AND id = $2 AND anonimizado_at IS NULL FOR UPDATE`, in.CID, in.ID).Scan(&em, &tel); err != nil {
					if db.IsNoRows(err) {
						return problem.NotFound("Ese contacto no existe o ya se suprimió.")
					}
					return err
				}
				// Keep only what proves we must not write again: the hashed destinations.
				if em != nil {
					if err := s.suprimir(ctx, tx, in.CID, "email", *em, "baja", "Supresión RGPD", "rgpd"); err != nil {
						return err
					}
				}
				if tel != nil {
					if err := s.suprimir(ctx, tx, in.CID, "whatsapp", *tel, "baja", "Supresión RGPD", "rgpd"); err != nil {
						return err
					}
				}
				for _, q := range []string{`DELETE FROM actividad WHERE contacto_id = $1`, `DELETE FROM consentimientos WHERE contacto_id = $1`,
					`UPDATE supresiones SET contacto_id = NULL WHERE contacto_id = $1`,
					`UPDATE contactos SET email = NULL, telefono = NULL, nombre = 'Contacto suprimido', etiquetas = '{}', relacion = '{}', anonimizado_at = now(), version = version + 1 WHERE id = $1`} {
					if _, err := tx.Exec(ctx, q, in.ID); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.rgpd_supresion", map[string]any{"id": in.ID, "seguimientos": o.Body.Seguimientos, "voluntarios": o.Body.Voluntarios},
					events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
		})

	type csvOut struct {
		ContentType string `header:"Content-Type"`
		Disposition string `header:"Content-Disposition"`
		Body        []byte
	}
	huma.Register(api, huma.Operation{OperationID: "contactos-export", Method: http.MethodGet, Path: baseC + "/contactos/export.csv", Summary: "Exportar CSV (con los filtros de la lista)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listaIn) (*csvOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "contactos.exportar"); err != nil {
				return nil, err
			}
			where, args := filtro(*in)
			rows, err := s.a.DB.Query(ctx, selItem+` WHERE `+where+` AND c.anonimizado_at IS NULL ORDER BY c.created_at LIMIT 50000`, args...)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (ContactoItem, error) { return scanItem(r, true) })
			if err != nil {
				return nil, err
			}
			var b bytes.Buffer
			b.WriteString("\ufeff")
			w := csv.NewWriter(&b)
			w.Comma = ';'
			_ = w.Write([]string{"nombre", "email", "telefono", "origen", "novedades_email", "whatsapp", "relacion", "ultima_actividad"})
			for _, it := range list {
				_ = w.Write([]string{csvSafe(it.Nombre), csvSafe(it.Email), csvSafe(it.Telefono), csvSafe(it.Origen), it.EmailEstado, it.WAEstado, csvSafe(it.Relacion), it.Ultima.Format(time.RFC3339)})
			}
			w.Flush()
			_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				return events.Enqueue(ctx, tx, events.New(ctx, "crm.exportado", map[string]any{"filas": len(list)}, events.Competition(in.CID.String()), events.ForPermission("contactos.exportar")))
			})
			return &csvOut{ContentType: "text/csv; charset=utf-8", Disposition: `attachment; filename="contactos.csv"`, Body: b.Bytes()}, nil
		})
}

// csvSafe neutralises spreadsheet formulas.
func csvSafe(v string) string {
	if v != "" && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
		return "'" + v
	}
	return v
}
