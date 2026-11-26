package athletes

// «Editar mi perfil» del área de atleta: el atleta propone los datos de su ficha y el equipo los revisa antes de
// escribir nada. Reutiliza las solicitudes de atleta con el tipo «cambio_perfil»: la solicitud guarda solo los campos
// que cambian (antes / después), hay una sola abierta por atleta y aprobar (o rechazar) avisa al atleta. Las
// validaciones y la normalización son las del formulario público (/alta-atleta), no una copia.

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// DatoPerfil is the editable part of an athlete's record (the fields of the public form), as the area form sends it.
type DatoPerfil struct {
	Nombre          string   `json:"nombre"`
	Apellidos       string   `json:"apellidos"`
	Email           string   `json:"email"`
	Telefono        string   `json:"telefono"`
	Sexo            string   `json:"sexo"`
	FechaNacimiento string   `json:"fechaNacimiento,omitempty"`
	Club            string   `json:"club"`
	Ciudad          string   `json:"ciudad"`
	Entrenador      string   `json:"entrenador"`
	Frase           string   `json:"frase"`
	Bio             string   `json:"bio"`
	Instagram       string   `json:"instagram"`
	MarcaSQ         *float64 `json:"marcaSQ,omitempty"`
	MarcaBP         *float64 `json:"marcaBP,omitempty"`
	MarcaDL         *float64 `json:"marcaDL,omitempty"`
}

// camposPerfil are the editable fields, in the order of the alta form, with the label of the review panel.
var camposPerfil = []struct{ clave, campo string }{
	{"nombre", "Nombre"},
	{"apellidos", "Apellidos"},
	{"email", "Email"},
	{"telefono", "Teléfono"},
	{"sexo", "Sexo"},
	{"fechaNacimiento", "Fecha de nacimiento"},
	{"club", "Club"},
	{"ciudad", "Ciudad"},
	{"entrenador", "Entrenador/a"},
	{"frase", "Frase"},
	{"bio", "Sobre ti"},
	{"instagram", "Instagram"},
	{"marcaSQ", "Sentadilla"},
	{"marcaBP", "Press de banca"},
	{"marcaDL", "Peso muerto"},
}

// cambiosPerfil is the before/after snapshot stored in «solicitudes_atleta.cambios»: only the fields that change.
type cambiosPerfil struct {
	Claves  []string       `json:"claves"`
	Antes   map[string]any `json:"antes"`
	Despues map[string]any `json:"despues"`
}

// CambioPerfilCampo is one changed field, ready for the review panel (before → after).
type CambioPerfilCampo struct {
	Clave   string `json:"clave"`
	Campo   string `json:"campo"`
	Antes   string `json:"antes"`
	Despues string `json:"despues"`
}

// CambioPerfilPendiente is the change request the athlete is waiting for, as the area shows it.
type CambioPerfilPendiente struct {
	ID        uuid.UUID           `json:"id"`
	EnviadaAt time.Time           `json:"enviadaAt"`
	Cambios   []CambioPerfilCampo `json:"cambios"`
}

// PerfilEditar is what «Editar mi perfil» needs: the current data (prefilled), the chosen competition (read-only: it
// is changed in «Tu competición», with its own deadline) and the pending request, if any.
type PerfilEditar struct {
	Datos        DatoPerfil             `json:"datos"`
	Prueba       string                 `json:"prueba" doc:"aep2, aep3 o vacío: se cambia en «Tu competición»"`
	PruebaNombre string                 `json:"pruebaNombre"`
	Pendiente    *CambioPerfilPendiente `json:"pendiente,omitempty"`
}

// datoDeRow is the current data of the athlete.
func datoDeRow(r row) DatoPerfil {
	d := DatoPerfil{
		Nombre: r.Nombre, Apellidos: r.Apellidos, Telefono: r.Telefono, Sexo: r.Sexo, Club: r.Club, Ciudad: r.Ciudad,
		Entrenador: r.Entrenador, Frase: r.Frase, Bio: r.Bio, Instagram: r.Instagram,
		MarcaSQ: r.MarcaSQ, MarcaBP: r.MarcaBP, MarcaDL: r.MarcaDL,
	}
	if r.Email != nil {
		d.Email = *r.Email
	}
	if r.FechaNacimiento != nil {
		d.FechaNacimiento = r.FechaNacimiento.Format(time.DateOnly)
	}
	return d
}

// datoDeAlta is the normalised data of the form (the same fields, after validation).
func datoDeAlta(d DatosAlta) DatoPerfil {
	return DatoPerfil{
		Nombre: d.Nombre, Apellidos: d.Apellidos, Email: d.Email, Telefono: d.Telefono, Sexo: d.Sexo,
		FechaNacimiento: d.FechaNacimiento, Club: d.Club, Ciudad: d.Ciudad, Entrenador: d.Entrenador,
		Frase: d.Frase, Bio: d.Bio, Instagram: d.Instagram, MarcaSQ: d.MarcaSQ, MarcaBP: d.MarcaBP, MarcaDL: d.MarcaDL,
	}
}

// valor returns the raw value of a field (strings and numbers only: it is what the snapshot stores).
func (d DatoPerfil) valor(clave string) any {
	switch clave {
	case "nombre":
		return d.Nombre
	case "apellidos":
		return d.Apellidos
	case "email":
		return d.Email
	case "telefono":
		return d.Telefono
	case "sexo":
		return d.Sexo
	case "fechaNacimiento":
		return d.FechaNacimiento
	case "club":
		return d.Club
	case "ciudad":
		return d.Ciudad
	case "entrenador":
		return d.Entrenador
	case "frase":
		return d.Frase
	case "bio":
		return d.Bio
	case "instagram":
		return d.Instagram
	case "marcaSQ":
		return marcaValor(d.MarcaSQ)
	case "marcaBP":
		return marcaValor(d.MarcaBP)
	case "marcaDL":
		return marcaValor(d.MarcaDL)
	}
	return ""
}

// pon writes a value of the snapshot into the field (approval).
func (d *DatoPerfil) pon(clave string, v any) error {
	s, _ := v.(string)
	switch clave {
	case "nombre":
		d.Nombre = s
	case "apellidos":
		d.Apellidos = s
	case "email":
		d.Email = normEmail(s)
	case "telefono":
		d.Telefono = s
	case "sexo":
		if s != "F" && s != "M" {
			return problem.Unprocessable("VALIDACION", "El sexo del cambio no es válido.")
		}
		d.Sexo = s
	case "fechaNacimiento":
		d.FechaNacimiento = s
	case "club":
		d.Club = s
	case "ciudad":
		d.Ciudad = s
	case "entrenador":
		d.Entrenador = s
	case "frase":
		d.Frase = s
	case "bio":
		d.Bio = s
	case "instagram":
		d.Instagram = s
	case "marcaSQ":
		d.MarcaSQ = marcaPon(v)
	case "marcaBP":
		d.MarcaBP = marcaPon(v)
	case "marcaDL":
		d.MarcaDL = marcaPon(v)
	}
	return nil
}

func marcaValor(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

// marcaPon is a mark of the snapshot (nil clears it).
func marcaPon(v any) *float64 {
	n, ok := v.(float64)
	if !ok {
		return nil
	}
	return &n
}

// textoPerfil is how a field is read in the panel and the messages (empty when it has no value).
func textoPerfil(clave string, v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return kgES(x) + " kg"
	case string:
		switch clave {
		case "sexo":
			if x == "F" {
				return "Mujer"
			}
			if x == "M" {
				return "Hombre"
			}
		case "fechaNacimiento":
			if t, ok := ParseFecha(x); ok {
				return t.Format("02/01/2006")
			}
		}
		return x
	}
	return ""
}

// comparaPerfil returns the fields that change, with their before/after values.
func comparaPerfil(antes, despues DatoPerfil) cambiosPerfil {
	c := cambiosPerfil{Claves: []string{}, Antes: map[string]any{}, Despues: map[string]any{}}
	for _, f := range camposPerfil {
		a, d := antes.valor(f.clave), despues.valor(f.clave)
		if textoPerfil(f.clave, a) == textoPerfil(f.clave, d) {
			continue
		}
		c.Claves = append(c.Claves, f.clave)
		c.Antes[f.clave] = a
		c.Despues[f.clave] = d
	}
	return c
}

// cambiaClave says if the request changes a field.
func cambiaClave(c cambiosPerfil, clave string) bool {
	for _, k := range c.Claves {
		if k == clave {
			return true
		}
	}
	return false
}

// leeCambios parses the snapshot of a request (empty when it has none).
func leeCambios(sol solicitud) cambiosPerfil {
	c := cambiosPerfil{Claves: []string{}, Antes: map[string]any{}, Despues: map[string]any{}}
	if strings.TrimSpace(sol.Cambios) != "" {
		_ = json.Unmarshal([]byte(sol.Cambios), &c)
	}
	return c
}

// camposCambio is the snapshot as the panel shows it: only the changed fields, in the order of the form.
func camposCambio(c cambiosPerfil) []CambioPerfilCampo {
	out := make([]CambioPerfilCampo, 0, len(c.Claves))
	for _, f := range camposPerfil {
		if _, ok := c.Despues[f.clave]; !ok {
			continue
		}
		out = append(out, CambioPerfilCampo{Clave: f.clave, Campo: f.campo,
			Antes: textoPerfil(f.clave, c.Antes[f.clave]), Despues: textoPerfil(f.clave, c.Despues[f.clave])})
	}
	return out
}

// cambiosDeSolicitud is the snapshot of a request for the review panel (empty for an alta).
func cambiosDeSolicitud(sol solicitud) []CambioPerfilCampo {
	if sol.Tipo != "cambio_perfil" {
		return []CambioPerfilCampo{}
	}
	return camposCambio(leeCambios(sol))
}

// textoCambios is the list of changes for the messages: one paragraph per field («**Club:** después (antes: X)»).
func textoCambios(c cambiosPerfil) (email, wa string) {
	var e, w []string
	for _, f := range camposCambio(c) {
		antes := f.Antes
		if antes == "" {
			antes = "vacío"
		}
		e = append(e, "**"+f.Campo+":** "+oVacio(f.Despues)+" (antes: "+antes+")")
		w = append(w, "• "+f.Campo+": *"+oVacio(f.Despues)+"* (antes: "+antes+")")
	}
	return strings.Join(e, "\n\n"), strings.Join(w, "\n")
}

func oVacio(s string) string {
	if s == "" {
		return "vacío"
	}
	return s
}

// detalleCambios is the one-line summary of the changes for the athlete's history.
func detalleCambios(c cambiosPerfil) string {
	var out []string
	for _, f := range camposCambio(c) {
		out = append(out, f.Campo+": "+oVacio(f.Antes)+" → "+oVacio(f.Despues))
	}
	return strings.Join(out, " · ")
}

// cambioPendiente returns the open change request of the athlete (nil when there is none).
func cambioPendiente(ctx context.Context, q querier, cid, atleta uuid.UUID) (*CambioPerfilPendiente, error) {
	rows, err := q.Query(ctx, selSolicitud+` WHERE competition_id = $1 AND tipo = 'cambio_perfil' AND match_atleta_id = $2
		AND estado IN ('pendiente','revision') ORDER BY created_at DESC LIMIT 1`, cid, atleta)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[solicitud])
	if err != nil || len(list) == 0 {
		return nil, err
	}
	sol := list[0]
	return &CambioPerfilPendiente{ID: sol.ID, EnviadaAt: sol.CreatedAt, Cambios: camposCambio(leeCambios(sol))}, nil
}

func (s *Svc) registerPerfilCambio() {
	api := s.a.API
	base := "/api/area-atleta/perfil-editar"

	// The area session travels in the cookie scoped to /api/area-atleta.
	type areaCookieIn struct {
		Session string `cookie:"gr_area"`
	}

	type datosOut struct{ Body PerfilEditar }
	huma.Register(api, huma.Operation{OperationID: "area-perfil-editar", Method: http.MethodGet, Path: base,
		Summary: "Mi ficha para editarla (datos actuales y cambios pendientes)", Tags: tagArea},
		func(ctx context.Context, in *areaCookieIn) (*datosOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			p := PerfilEditar{Datos: datoDeRow(r), Prueba: r.Prueba, PruebaNombre: pruebaTexto(r.Prueba)}
			if p.Pendiente, err = cambioPendiente(ctx, s.a.DB, r.CompetitionID, r.ID); err != nil {
				return nil, err
			}
			return &datosOut{Body: p}, nil
		})

	type pedirIn struct {
		Session string `cookie:"gr_area"`
		Body    DatoPerfil
	}
	type pedirOut struct{ Body CambioPerfilPendiente }
	huma.Register(api, huma.Operation{OperationID: "area-perfil-editar-pedir", Method: http.MethodPost, Path: base,
		Summary: "Pedir un cambio de mi ficha (queda pendiente de revisión)", Tags: tagArea, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *pedirIn) (*pedirOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if lim, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "perfil-editar", r.ID.String()), 12, time.Hour); !lim.Allowed {
				return nil, problem.TooMany("Has enviado varios cambios seguidos. Espera un rato antes de intentarlo otra vez.")
			}
			c, err := s.creaCambioPerfil(ctx, r, in.Body)
			if err != nil {
				return nil, err
			}
			return &pedirOut{Body: *c}, nil
		})

	type cancelarIn struct {
		Session string    `cookie:"gr_area"`
		ID      uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "area-perfil-editar-cancelar", Method: http.MethodDelete, Path: base + "/{id}",
		Summary: "Cancelar un cambio de perfil pendiente", Tags: tagArea, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *cancelarIn) (*struct{}, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			return nil, s.cancelaCambioPerfil(ctx, r, in.ID)
		})
}

// creaCambioPerfil stores the athlete's proposal: nothing is written to «atletas» or «perfiles» until the team
// approves it. A new submission replaces the pending one (one open request per athlete).
func (s *Svc) creaCambioPerfil(ctx context.Context, r row, b DatoPerfil) (*CambioPerfilPendiente, error) {
	// The same validation as the public form (it also normalises the phone, the email and the Instagram).
	d := s.normalizaDatos(DatosAlta{
		Nombre: b.Nombre, Apellidos: b.Apellidos, Email: b.Email, Telefono: b.Telefono, Sexo: b.Sexo,
		FechaNacimiento: b.FechaNacimiento, Club: b.Club, Ciudad: b.Ciudad, Entrenador: b.Entrenador,
		Frase: b.Frase, Bio: b.Bio, Instagram: b.Instagram, MarcaSQ: b.MarcaSQ, MarcaBP: b.MarcaBP, MarcaDL: b.MarcaDL,
	})
	if errs := s.validaDatos(d); len(errs) > 0 {
		return nil, validacion("Revisa los campos marcados.", errs...)
	}
	c := comparaPerfil(datoDeRow(r), datoDeAlta(d))
	if len(c.Claves) == 0 {
		return nil, problem.Conflict("SIN_CAMBIOS", "No has cambiado nada: tu ficha ya tiene esos datos.")
	}
	// One account per email: the new email cannot be the one of another athlete of the competition (the athlete
	// area logs in by email, two athletes with the same one is an ambiguity nobody can resolve).
	if nuevo := normEmail(d.Email); nuevo != "" && (r.Email == nil || normEmail(*r.Email) != nuevo) {
		var n int
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' AND id <> $3`,
			r.CompetitionID, nuevo, r.ID).Scan(&n); err != nil {
			return nil, err
		}
		if n > 0 {
			return nil, problem.Conflict("EMAIL_EN_USO", "Ese email ya es el de otro atleta: elige otro o escríbenos.")
		}
	}
	snap, _ := json.Marshal(c)
	cid := r.CompetitionID
	id := newID()
	// The boxes were signed in the alta: its proof travels with the request (with its own timestamp) so the notices
	// can use the WhatsApp consent without asking for it again.
	var cons string
	var consAt *time.Time
	if err := s.a.DB.QueryRow(ctx, `SELECT consentimientos::text, consentimiento_at FROM solicitudes_atleta
		WHERE competition_id = $1 AND match_atleta_id = $2 AND tipo = 'alta' AND estado = 'aprobada'
		ORDER BY revisado_at DESC NULLS LAST LIMIT 1`, cid, r.ID).Scan(&cons, &consAt); err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	if strings.TrimSpace(cons) == "" {
		cons = "{}"
	}
	equipo := s.equipoAdmins(ctx, cid)
	slug := ""
	if comp, err := s.comps.ByID(ctx, cid); err == nil {
		slug = comp.Slug
	}
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		// One open request: the pending one is replaced (never two).
		if _, err := tx.Exec(ctx, `DELETE FROM solicitudes_atleta WHERE competition_id = $1 AND tipo = 'cambio_perfil'
			AND match_atleta_id = $2 AND estado IN ('pendiente','revision')`, cid, r.ID); err != nil {
			return err
		}
		// prueba stays empty: a change request never holds a place of the event.
		_, err := tx.Exec(ctx, `INSERT INTO solicitudes_atleta (id, competition_id, tipo, cambios, match_atleta_id, match_tipo, nombre, apellidos,
			email, telefono, sexo, fecha_nacimiento, club, ciudad, frase, bio, instagram, entrenador, historial, marca_sq, marca_bp, marca_dl,
			focal_x, focal_y, es_menor, estado, consentimientos, consentimiento_at, ip, user_agent, prueba)
			VALUES ($1,$2,'cambio_perfil',$3,$4,'manual',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'',$17,$18,$19,$20,$21,false,'pendiente',$22,$23,$24,$25,'')`,
			id, cid, string(snap), r.ID, d.Nombre, d.Apellidos, d.Email, d.Telefono, d.Sexo, fecha(d.FechaNacimiento), d.Club, d.Ciudad,
			d.Frase, d.Bio, d.Instagram, d.Entrenador, d.MarcaSQ, d.MarcaBP, d.MarcaDL, r.FocalX, r.FocalY, cons, consAt,
			anonIP(httpx.ClientIPFrom(ctx)), userAgentDe(ctx))
		if err != nil {
			if db.IsUniqueViolation(err, "") {
				return problem.Conflict("SOLICITUD_EN_CURSO", "Ya tienes un cambio en revisión. Espera a que lo revisemos.")
			}
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_creada",
			map[string]any{"id": id, "nombre": d.Nombre, "esMenor": false, "match": "manual", "tipo": "cambio_perfil"},
			events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		// The team: the same channels and permissions as the rest of the requests.
		v := s.varsCambioNueva(d, c, slug)
		for _, m := range equipo {
			if err := email(ctx, tx, cid, m.Email, "atleta-cambio-perfil-nueva", v); err != nil {
				return err
			}
		}
		return whatsapp(ctx, tx, cid, "", true, "atleta-cambio-perfil-nueva", v, "")
	})
	if err != nil {
		return nil, err
	}
	s.a.Log.Info("cambio de perfil pedido", "id", id.String(), "atleta", r.ID.String(), "campos", len(c.Claves))
	return &CambioPerfilPendiente{ID: id, EnviadaAt: time.Now(), Cambios: camposCambio(c)}, nil
}

// cancelaCambioPerfil removes the athlete's own pending request: nothing was applied, so nothing has to be undone.
func (s *Svc) cancelaCambioPerfil(ctx context.Context, r row, id uuid.UUID) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		var estado string
		err := tx.QueryRow(ctx, `SELECT estado FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2 AND tipo = 'cambio_perfil'
			AND match_atleta_id = $3 FOR UPDATE`, r.CompetitionID, id, r.ID).Scan(&estado)
		if err == pgx.ErrNoRows {
			return problem.NotFound("Ese cambio no existe.")
		}
		if err != nil {
			return err
		}
		if estado != "pendiente" && estado != "revision" {
			return problem.Conflict("YA_REVISADA", "Ese cambio ya está revisado: no se puede cancelar.")
		}
		if _, err := tx.Exec(ctx, `DELETE FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2`, r.CompetitionID, id); err != nil {
			return err
		}
		if err := hist(ctx, tx, r.ID, "Cambios de perfil cancelados por el atleta", ""); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_actualizada",
			map[string]any{"id": id, "estado": "cancelada"}, events.Competition(r.CompetitionID.String()), events.ForPermission("atletas.editar")))
	})
}

// contactoActual returns the email and phone the athlete has today. The notices of a change request never go to the
// address or the number the request proposes: they are not verified yet.
func contactoActual(ctx context.Context, tx pgx.Tx, sol solicitud) (email, tel string) {
	if sol.MatchAtletaID == nil {
		return sol.Email, sol.Telefono
	}
	if err := tx.QueryRow(ctx, `SELECT COALESCE(email::text, ''), telefono FROM atletas WHERE id = $1`, *sol.MatchAtletaID).Scan(&email, &tel); err != nil {
		return sol.Email, sol.Telefono
	}
	if email == "" {
		email = sol.Email
	}
	return email, tel
}

// apruebaCambioPerfil applies the snapshot of a «cambio_perfil» request to the athlete and their profile, in one
// transaction, and tells the athlete. Only the changed fields are written; an email change keeps the one account per
// email rule (the directo account follows the athlete, another person's email is a conflict).
func (s *Svc) apruebaCambioPerfil(ctx context.Context, cid, id uuid.UUID, ifm string, avisarEmail, avisarWhatsApp bool, por string) (*AprobarOut, error) {
	out := &AprobarOut{}
	anio := time.Now().Year()
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		anio = c.Year()
	}
	var destino uuid.UUID
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		if sol.Tipo != "cambio_perfil" || sol.MatchAtletaID == nil {
			return problem.Conflict("TIPO_INVALIDO", "Esta solicitud no es un cambio de perfil enlazado a un atleta.")
		}
		destino = *sol.MatchAtletaID
		if _, err := tx.Exec(ctx, `SELECT 1 FROM atletas WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, destino); err != nil {
			return err
		}
		prev, err := getRow(ctx, tx, cid, destino)
		if err != nil {
			return err
		}
		if prev.Estado == "baja" {
			return problem.Conflict("ATLETA_DE_BAJA", "Ese atleta está de baja: el cambio ya no se puede aplicar. Recházalo.")
		}
		c := leeCambios(sol)
		next := datoDeRow(prev)
		for _, k := range c.Claves {
			if err := next.pon(k, c.Despues[k]); err != nil {
				return err
			}
		}
		// One account per email: the new email must not be another athlete's and, if it already has a directo
		// account of another person, the reviewer has to fix that first.
		viejo := ""
		if prev.Email != nil {
			viejo = normEmail(*prev.Email)
		}
		nuevo := normEmail(next.Email)
		var nota string
		if nuevo != "" && nuevo != viejo {
			var n int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' AND id <> $3`,
				cid, nuevo, destino).Scan(&n); err != nil {
				return err
			}
			if n > 0 {
				return problem.Conflict("EMAIL_EN_USO", "Ese email ya es el de otro atleta de la competición.")
			}
			cuenta, err := cuentaFanDe(ctx, s.fansSvc, cid, nuevo)
			if err != nil {
				s.a.Log.Warn("fans por-email no disponible al aprobar un cambio de perfil", "solicitud", id.String(), "err", err)
			} else if cuenta != nil && cuenta.AtletaID != uuid.Nil && cuenta.AtletaID != destino {
				return problem.Conflict("EMAIL_EN_USO", "Ese email ya tiene la cuenta del directo de otra persona.")
			}
			if nota, err = s.sigueLaCuentaFan(ctx, cid, destino, prev.Email, nuevo); err != nil {
				return err
			}
			if cuenta != nil && cuenta.Tipo == "publico" && cuenta.AtletaID != destino {
				if err := unirCuentaFan(ctx, tx, cid, destino, nuevo, next.Telefono, cuenta); err != nil {
					return err
				}
			}
		}
		fechaNac := fecha(next.FechaNacimiento)
		if fechaNac == nil {
			fechaNac = prev.FechaNacimiento // the birth date is required by the form: never wipe it
		}
		// The division only follows the birth date, and only when the athlete changed it: a bio change must not
		// overwrite a division the team set by hand.
		division := prev.Division
		if fechaNac != nil && cambiaClave(c, "fechaNacimiento") {
			division = DivisionPorEdad(*fechaNac, anio)
		}
		if _, err := tx.Exec(ctx, `UPDATE atletas SET nombre = $2, apellidos = $3, email = NULLIF($4,''), telefono = $5, sexo = $6,
			fecha_nacimiento = $7, division = $8, club = $9, ciudad = $10, version = version + 1, updated_at = now()
			WHERE competition_id = $1 AND id = $11`,
			cid, next.Nombre, next.Apellidos, nuevo, next.Telefono, next.Sexo, fechaNac, division, next.Club, next.Ciudad, destino); err != nil {
			if db.IsUniqueViolation(err, "") {
				return problem.Conflict("DATOS_DUPLICADOS", "Esos datos ya son los de otro atleta.")
			}
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE perfiles SET frase = $2, bio = $3, instagram = $4, entrenador = $5,
			marca_sq = $6, marca_bp = $7, marca_dl = $8, updated_at = now() WHERE atleta_id = $1`,
			destino, next.Frase, next.Bio, next.Instagram, next.Entrenador, next.MarcaSQ, next.MarcaBP, next.MarcaDL); err != nil {
			return err
		}
		// The account of the directo follows the athlete when the email changed (it is the same person).
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET estado = 'aprobada', revisado_at = now(), revisado_por = $3,
			version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`, cid, id, por); err != nil {
			return err
		}
		if err := hist(ctx, tx, destino, "Cambios de perfil aprobados desde una solicitud", strings.TrimSpace(strings.Join([]string{detalleCambios(c), nota}, " · "))); err != nil {
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_aprobada",
			map[string]any{"id": id, "atletaId": destino, "nombre": next.Nombre, "tipo": "cambio_perfil"},
			events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		var slug string
		var visible bool
		if err := tx.QueryRow(ctx, `SELECT slug, visible FROM perfiles WHERE atleta_id = $1`, destino).Scan(&slug, &visible); err != nil {
			return err
		}
		// The notices (optional): the same channels as the alta, with the consent recorded there. They go to the
		// contact the athlete has today (if the email changes, its new address is not verified yet).
		textoEmail, textoWA := textoCambios(c)
		urlArea := s.webURL + "/area-atleta"
		if avisarEmail && viejo != "" {
			if err := email(ctx, tx, cid, viejo, "atleta-cambio-perfil-aprobado", map[string]string{
				"nombre": next.Nombre, "cambios": textoEmail, "urlArea": urlArea}); err != nil {
				return err
			}
		}
		if avisarWhatsApp && prev.Telefono != "" && sol.consent("whatsapp").Aceptado {
			if err := whatsapp(ctx, tx, cid, prev.Telefono, false, "atleta-cambio-perfil-aprobado", map[string]string{
				"nombre": next.Nombre, "cambios": textoWA, "urlArea": urlArea}, ""); err != nil {
				return err
			}
		}
		out.Body.AtletaID, out.Body.Slug, out.Body.Publica = destino, slug, visible
		return nil
	})
	if err != nil {
		return nil, err
	}
	// The public list and the athlete pages changed.
	s.bump(ctx, cid)
	s.a.Log.Info("cambio de perfil aprobado", "id", id.String(), "atleta", destino.String(), "revisor", por)
	return out, nil
}

// varsCambioNueva are the variables of the email/WhatsApp to the team.
func (s *Svc) varsCambioNueva(d DatosAlta, c cambiosPerfil, slug string) map[string]string {
	textoEmail, textoWA := textoCambios(c)
	return map[string]string{
		"nombre": d.Nombre, "apellidos": d.Apellidos, "email": d.Email, "telefono": telTexto(d.Telefono), "club": d.Club,
		"cambios": textoEmail, "cambiosWA": textoWA, "urlRevisar": s.boURL + "/" + slug + "/atletas/solicitudes",
	}
}
