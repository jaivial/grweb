package athletes

// «Editar mi perfil» del área de atleta: el atleta propone los datos de su ficha y el equipo los revisa antes de
// escribir nada. Reutiliza las solicitudes de atleta con el tipo «cambio_perfil»: la solicitud guarda solo los campos
// que cambian (antes / después), hay una sola abierta por atleta y aprobar (o rechazar) avisa al atleta. Las
// validaciones y la normalización son las del formulario público (/alta-atleta), no una copia.

import (
	"context"
	"encoding/json"
	"errors"
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
	Prueba          string   `json:"prueba,omitempty"`
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
	{"prueba", "Competición"},
	{"club", "Club"},
	{"ciudad", "Ciudad"},
	{"entrenador", "Entrenador/a"},
	{"frase", "Frase"},
	{"bio", "Sobre ti"},
	{"instagram", "Instagram"},
	{"marcaSQ", "Sentadilla"},
	{"marcaBP", "Press de banca"},
	{"marcaDL", "Peso muerto"},
	// The photo uploaded from the area: its value is the URL of the new photo (it waits for the review).
	{"foto", "Foto"},
}

// camposRevisados need the team's review; every other field of «Editar mi perfil» is applied at once (the birth date
// too, unless it changes whether the athlete is a minor on competition day).
var camposRevisados = map[string]bool{"nombre": true, "apellidos": true, "email": true, "sexo": true, "prueba": true, "foto": true}

// partirCambios splits the changes in the ones applied at once and the ones the team reviews.
func partirCambios(c cambiosPerfil, revisa func(clave string) bool) (auto, revision cambiosPerfil) {
	auto = cambiosPerfil{Claves: []string{}, Antes: map[string]any{}, Despues: map[string]any{}}
	revision = cambiosPerfil{Claves: []string{}, Antes: map[string]any{}, Despues: map[string]any{}}
	for _, k := range c.Claves {
		dst := &auto
		if revisa(k) {
			dst = &revision
		}
		dst.Claves = append(dst.Claves, k)
		dst.Antes[k], dst.Despues[k] = c.Antes[k], c.Despues[k]
	}
	return auto, revision
}

// fusionaCambios is the new snapshot of the open request: the fields the caller owns come from nuevos (dropped when
// they no longer change) and the rest stay as they were in the open request.
func fusionaCambios(abierta *cambiosPerfil, nuevos cambiosPerfil, propia func(clave string) bool) cambiosPerfil {
	out := cambiosPerfil{Claves: []string{}, Antes: map[string]any{}, Despues: map[string]any{}}
	for _, f := range camposPerfil {
		src := &nuevos
		if !propia(f.clave) {
			if abierta == nil {
				continue
			}
			src = abierta
		}
		if d, ok := src.Despues[f.clave]; ok {
			out.Claves = append(out.Claves, f.clave)
			out.Antes[f.clave], out.Despues[f.clave] = src.Antes[f.clave], d
		}
	}
	return out
}

// mismosCambios: two snapshots ask for the same (the team does not need a new notice).
func mismosCambios(a, b cambiosPerfil) bool {
	x, _ := json.Marshal(map[string]any{"c": a.Claves, "d": a.Despues})
	y, _ := json.Marshal(map[string]any{"c": b.Claves, "d": b.Despues})
	return string(x) == string(y)
}

// fotoCambio is the URL of the new photo of a snapshot (empty when it does not change the photo).
func fotoCambio(c cambiosPerfil) string {
	u, _ := c.Despues["foto"].(string)
	return u
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

// CambioPerfilEnviado is the answer of «Editar mi perfil»: the fields applied at once and the request left for the
// team (null when nothing needs a review). id, enviadaAt and cambios repeat the pending request, as before.
type CambioPerfilEnviado struct {
	ID        *uuid.UUID             `json:"id,omitempty"`
	EnviadaAt *time.Time             `json:"enviadaAt,omitempty"`
	Cambios   []CambioPerfilCampo    `json:"cambios"`
	Aplicados []string               `json:"aplicados" doc:"Campos aplicados al momento (sin revisión)"`
	Pendiente *CambioPerfilPendiente `json:"pendiente" doc:"Cambios que esperan la revisión del equipo (null si no hay)"`
}

// CambioPerfilPendiente is the change request the athlete is waiting for, as the area shows it.
type CambioPerfilPendiente struct {
	ID        uuid.UUID           `json:"id"`
	EnviadaAt time.Time           `json:"enviadaAt"`
	Cambios   []CambioPerfilCampo `json:"cambios"`
}

// PerfilEditar is what «Editar mi perfil» needs: the current data (prefilled), the competitions the athlete can
// choose (AEP-2 / AEP-3, with their places) and the pending request, if any.
type PerfilEditar struct {
	Datos     DatoPerfil             `json:"datos"`
	Opciones  []PruebaAlta           `json:"opciones" doc:"AEP-2 y AEP-3, con su fecha y sus plazas"`
	Pendiente *CambioPerfilPendiente `json:"pendiente,omitempty"`
}

// datoDeRow is the current data of the athlete.
func datoDeRow(r row) DatoPerfil {
	d := DatoPerfil{
		Nombre: r.Nombre, Apellidos: r.Apellidos, Telefono: r.Telefono, Sexo: r.Sexo, Club: r.Club, Ciudad: r.Ciudad,
		Entrenador: r.Entrenador, Frase: r.Frase, Bio: r.Bio, Instagram: r.Instagram, Prueba: r.Prueba,
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
		FechaNacimiento: d.FechaNacimiento, Prueba: d.Prueba, Club: d.Club, Ciudad: d.Ciudad, Entrenador: d.Entrenador,
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
	case "prueba":
		return d.Prueba
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
	case "prueba":
		// Empty («Aún no lo sabe») is not offered by the form, but a snapshot must never hold an invented code.
		if !pruebaValida(s) {
			return problem.Unprocessable("VALIDACION", "La competición del cambio no es válida.")
		}
		d.Prueba = s
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
		case "prueba":
			// The label of the competition, and empty for «no choice»: the panel reads it as «vacío».
			if x == "" {
				return ""
			}
			return pruebaTexto(x)
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
		if f.Clave == "foto" {
			e = append(e, "**Foto:** foto nueva (revísala en el panel)")
			w = append(w, "• Foto: *foto nueva*")
			continue
		}
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
		if f.Clave == "foto" {
			out = append(out, "Foto nueva")
			continue
		}
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
			p := PerfilEditar{Datos: datoDeRow(r)}
			// The same options (and places) the public form offers: the athlete moves from one competition to the other.
			if c, err := s.comps.ByID(ctx, r.CompetitionID); err == nil {
				p.Opciones, _ = s.pruebas(ctx, c)
			}
			if p.Pendiente, err = cambioPendiente(ctx, s.a.DB, r.CompetitionID, r.ID); err != nil {
				return nil, err
			}
			return &datosOut{Body: p}, nil
		})

	type pedirIn struct {
		Session string `cookie:"gr_area"`
		Body    DatoPerfil
	}
	type pedirOut struct{ Body CambioPerfilEnviado }
	huma.Register(api, huma.Operation{OperationID: "area-perfil-editar-pedir", Method: http.MethodPost, Path: base,
		Summary: "Cambiar mi ficha (contacto, club, marcas y textos al momento; nombre, email, sexo, competición y foto quedan pendientes de revisión)", Tags: tagArea, DefaultStatus: http.StatusCreated},
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

// creaCambioPerfil saves the athlete's proposal: the contact, club, marks and texts (and the birth date when it does
// not change whether they are a minor) are applied at once; the name, email, sex, competition and photo wait for the
// team in a «cambio_perfil» request (one open request per athlete: a new submission is merged into it).
func (s *Svc) creaCambioPerfil(ctx context.Context, r row, b DatoPerfil) (*CambioPerfilEnviado, error) {
	// The same validation as the public form (it also normalises the phone, the email and the Instagram).
	d := s.normalizaDatos(DatosAlta{
		Nombre: b.Nombre, Apellidos: b.Apellidos, Email: b.Email, Telefono: b.Telefono, Sexo: b.Sexo,
		FechaNacimiento: b.FechaNacimiento, Prueba: b.Prueba, Club: b.Club, Ciudad: b.Ciudad, Entrenador: b.Entrenador,
		Frase: b.Frase, Bio: b.Bio, Instagram: b.Instagram, MarcaSQ: b.MarcaSQ, MarcaBP: b.MarcaBP, MarcaDL: b.MarcaDL,
	})
	if errs := s.validaDatos(d); len(errs) > 0 {
		return nil, validacion("Revisa los campos marcados.", errs...)
	}
	propuesto := datoDeAlta(d)
	c := comparaPerfil(datoDeRow(r), propuesto)
	if len(c.Claves) == 0 {
		return nil, problem.Conflict("SIN_CAMBIOS", "No has cambiado nada: tu ficha ya tiene esos datos.")
	}
	cid := r.CompetitionID
	dia := s.compDate(ctx, cid)
	auto, revision := partirCambios(c, func(k string) bool {
		if k == "fechaNacimiento" {
			// A birth date that makes the athlete a minor (or an adult) changes what may be published: reviewed.
			r2 := r
			r2.FechaNacimiento = fecha(d.FechaNacimiento)
			return r2.menor(dia) != r.menor(dia)
		}
		return camposRevisados[k]
	})
	// One account per email: the new email cannot be the one of another athlete of the competition (the athlete
	// area logs in by email, two athletes with the same one is an ambiguity nobody can resolve).
	if nuevo := normEmail(d.Email); cambiaClave(revision, "email") && nuevo != "" {
		var n int
		if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' AND id <> $3`,
			cid, nuevo, r.ID).Scan(&n); err != nil {
			return nil, err
		}
		if n > 0 {
			return nil, problem.Conflict("EMAIL_EN_USO", "Ese email ya es el de otro atleta: elige otro o escríbenos.")
		}
	}
	equipo := s.equipoAdmins(ctx, cid)
	slug, anio := "", time.Now().Year()
	if comp, err := s.comps.ByID(ctx, cid); err == nil {
		slug, anio = comp.Slug, comp.Year()
	}
	out := &CambioPerfilEnviado{Cambios: []CambioPerfilCampo{}, Aplicados: auto.Claves}
	ev := ""
	if len(auto.Claves) > 0 {
		ev = "athletes.perfil_actualizado"
	}
	var borrar string
	err := s.change(ctx, cid, ev, map[string]any{"id": r.ID, "origen": "area", "campos": auto.Claves}, func(tx pgx.Tx) error {
		prev, err := s.lock(ctx, tx, cid, r.ID, "")
		if err != nil {
			return err
		}
		if len(auto.Claves) > 0 {
			if _, err := s.aplicaCambios(ctx, tx, cid, prev, auto, anio); err != nil {
				return err
			}
			if err := hist(ctx, tx, r.ID, "Perfil actualizado por el atleta", detalleCambios(auto)); err != nil {
				return err
			}
		}
		// The form owns every reviewed field but the photo (that one comes from its own upload).
		out.Pendiente, borrar, err = s.guardaCambioPerfil(ctx, tx, prev, &propuesto, revision, func(k string) bool { return k != "foto" }, equipo, slug)
		return err
	})
	if err != nil {
		return nil, err
	}
	if borrar != "" {
		s.borraFotoPublicada(ctx, cid, borrar)
	}
	if p := out.Pendiente; p != nil {
		out.ID, out.EnviadaAt, out.Cambios = &p.ID, &p.EnviadaAt, p.Cambios
	}
	s.a.Log.Info("perfil editado desde el área", "atleta", r.ID.String(), "aplicados", len(auto.Claves), "revision", len(revision.Claves))
	return out, nil
}

// abiertaCambioPerfil is the open «cambio_perfil» request of the athlete, locked (nil when there is none).
func abiertaCambioPerfil(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID) (*solicitud, error) {
	rows, err := tx.Query(ctx, selSolicitud+` WHERE competition_id = $1 AND tipo = 'cambio_perfil' AND match_atleta_id = $2
		AND estado IN ('pendiente','revision') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, cid, atleta)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[solicitud])
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

// datoDeSolicitud is the data an open request was saved with.
func datoDeSolicitud(sol solicitud) DatoPerfil {
	d := DatoPerfil{Nombre: sol.Nombre, Apellidos: sol.Apellidos, Email: sol.Email, Telefono: sol.Telefono, Sexo: sol.Sexo, Club: sol.Club,
		Ciudad: sol.Ciudad, Entrenador: sol.Entrenador, Frase: sol.Frase, Bio: sol.Bio, Instagram: sol.Instagram,
		MarcaSQ: sol.MarcaSQ, MarcaBP: sol.MarcaBP, MarcaDL: sol.MarcaDL}
	if sol.FechaNacimiento != nil {
		d.FechaNacimiento = sol.FechaNacimiento.Format(time.DateOnly)
	}
	return d
}

// guardaCambioPerfil merges the reviewed changes into the open request of the athlete (the fields the caller owns are
// replaced, the rest kept) and notifies the team only when the request is created or changes. datos are the values
// stored in the request (nil keeps those of the open request). It returns the pending request (nil when nothing is
// left to review) and the URL of a pending photo that is no longer wanted (to remove from the CDN after the commit).
func (s *Svc) guardaCambioPerfil(ctx context.Context, tx pgx.Tx, r row, datos *DatoPerfil, nuevos cambiosPerfil, propia func(string) bool,
	equipo []Miembro, slug string) (*CambioPerfilPendiente, string, error) {
	cid := r.CompetitionID
	abierta, err := abiertaCambioPerfil(ctx, tx, cid, r.ID)
	if err != nil {
		return nil, "", err
	}
	var antes *cambiosPerfil
	if abierta != nil {
		c := leeCambios(*abierta)
		antes = &c
	}
	c := fusionaCambios(antes, nuevos, propia)
	borrar := ""
	if antes != nil {
		if u := fotoCambio(*antes); u != "" && u != fotoCambio(c) && u != r.FotoURL {
			borrar = u
		}
		if mismosCambios(*antes, c) {
			return &CambioPerfilPendiente{ID: abierta.ID, EnviadaAt: abierta.CreatedAt, Cambios: camposCambio(c)}, "", nil
		}
		// One open request: the pending one is replaced (never two).
		if _, err := tx.Exec(ctx, `DELETE FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2`, cid, abierta.ID); err != nil {
			return nil, "", err
		}
	}
	if len(c.Claves) == 0 {
		if abierta != nil {
			if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_actualizada",
				map[string]any{"id": abierta.ID, "accion": "cancelada", "estado": "cancelada", "tipo": "cambio_perfil"},
				events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
				return nil, "", err
			}
		}
		return nil, borrar, nil
	}
	v := datoDeRow(r)
	switch {
	case datos != nil:
		v = *datos
	case abierta != nil:
		v = datoDeSolicitud(*abierta)
	}
	// The boxes were signed in the alta: its proof travels with the request (with its own timestamp) so the notices
	// can use the WhatsApp consent without asking for it again.
	var cons string
	var consAt *time.Time
	if err := tx.QueryRow(ctx, `SELECT consentimientos::text, consentimiento_at FROM solicitudes_atleta
		WHERE competition_id = $1 AND match_atleta_id = $2 AND tipo = 'alta' AND estado = 'aprobada'
		ORDER BY revisado_at DESC NULLS LAST LIMIT 1`, cid, r.ID).Scan(&cons, &consAt); err != nil && err != pgx.ErrNoRows {
		return nil, "", err
	}
	if strings.TrimSpace(cons) == "" {
		cons = "{}"
	}
	snap, _ := json.Marshal(c)
	id := newID()
	// prueba stays empty on purpose: the change request does not hold a place of the event (the destination
	// competition travels in the snapshot and the place moves when it is approved).
	_, err = tx.Exec(ctx, `INSERT INTO solicitudes_atleta (id, competition_id, tipo, cambios, match_atleta_id, match_tipo, nombre, apellidos,
		email, telefono, sexo, fecha_nacimiento, club, ciudad, frase, bio, instagram, entrenador, historial, marca_sq, marca_bp, marca_dl,
		focal_x, focal_y, es_menor, estado, consentimientos, consentimiento_at, ip, user_agent, prueba)
		VALUES ($1,$2,'cambio_perfil',$3,$4,'manual',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'',$17,$18,$19,$20,$21,false,'pendiente',$22,$23,$24,$25,'')`,
		id, cid, string(snap), r.ID, v.Nombre, v.Apellidos, v.Email, v.Telefono, v.Sexo, fecha(v.FechaNacimiento), v.Club, v.Ciudad,
		v.Frase, v.Bio, v.Instagram, v.Entrenador, v.MarcaSQ, v.MarcaBP, v.MarcaDL, r.FocalX, r.FocalY, cons, consAt,
		anonIP(httpx.ClientIPFrom(ctx)), userAgentDe(ctx))
	if err != nil {
		if db.IsUniqueViolation(err, "") {
			return nil, "", problem.Conflict("SOLICITUD_EN_CURSO", "Ya tienes un cambio en revisión. Espera a que lo revisemos.")
		}
		return nil, "", err
	}
	if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_creada",
		map[string]any{"id": id, "nombre": v.Nombre, "esMenor": false, "match": "manual", "tipo": "cambio_perfil"},
		events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
		return nil, "", err
	}
	// The team: the same channels and permissions as the rest of the requests, with only the reviewed fields.
	vars := s.varsCambioNueva(v, c, slug, id)
	for _, m := range equipo {
		if err := email(ctx, tx, cid, m.Email, "atleta-cambio-perfil-nueva", vars); err != nil {
			return nil, "", err
		}
	}
	if err := whatsapp(ctx, tx, cid, "", true, "atleta-cambio-perfil-nueva", vars, ""); err != nil {
		return nil, "", err
	}
	return &CambioPerfilPendiente{ID: id, EnviadaAt: time.Now(), Cambios: camposCambio(c)}, borrar, nil
}

// fotoPendiente is the photo the athlete uploaded that waits for the review (empty when there is none): the area
// works with it while the public pages keep the approved one.
func (s *Svc) fotoPendiente(ctx context.Context, cid, atleta uuid.UUID) string {
	var u string
	_ = s.a.DB.QueryRow(ctx, `SELECT COALESCE(cambios->'despues'->>'foto', '') FROM solicitudes_atleta WHERE competition_id = $1
		AND tipo = 'cambio_perfil' AND match_atleta_id = $2 AND estado IN ('pendiente','revision') ORDER BY created_at DESC LIMIT 1`, cid, atleta).Scan(&u)
	return u
}

// cancelaCambioPerfil removes the athlete's own pending request: nothing was applied, so nothing has to be undone.
func (s *Svc) cancelaCambioPerfil(ctx context.Context, r row, id uuid.UUID) error {
	var foto string
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		var estado string
		err := tx.QueryRow(ctx, `SELECT estado, COALESCE(cambios->'despues'->>'foto', '') FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2 AND tipo = 'cambio_perfil'
			AND match_atleta_id = $3 FOR UPDATE`, r.CompetitionID, id, r.ID).Scan(&estado, &foto)
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
			map[string]any{"id": id, "accion": "cancelada", "estado": "cancelada", "tipo": "cambio_perfil"},
			events.Competition(r.CompetitionID.String()), events.ForPermission("atletas.editar")))
	})
	// A photo that was only pending review is not kept.
	if err == nil && foto != "" && foto != r.FotoURL {
		s.borraFotoPublicada(ctx, r.CompetitionID, foto)
	}
	return err
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
	var fotoAnterior string
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
		prev, err := s.lock(ctx, tx, cid, destino, "")
		if err != nil {
			return err
		}
		if prev.Estado == "baja" {
			return problem.Conflict("ATLETA_DE_BAJA", "Ese atleta está de baja: el cambio ya no se puede aplicar. Recházalo.")
		}
		c := leeCambios(sol)
		ap, err := s.aplicaCambios(ctx, tx, cid, prev, c, anio)
		if err != nil {
			return err
		}
		next, viejo, nota := ap.next, ap.viejo, ap.nota
		fotoAnterior = ap.fotoAnterior
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
	// The public list and the athlete pages changed (the replaced photo of this flow is removed from the CDN).
	s.bump(ctx, cid)
	if fotoAnterior != "" {
		s.borraFotoPublicada(ctx, cid, fotoAnterior)
	}
	s.a.Log.Info("cambio de perfil aprobado", "id", id.String(), "atleta", destino.String(), "revisor", por)
	return out, nil
}

// aplicado is what aplicaCambios wrote.
type aplicado struct {
	next         DatoPerfil
	viejo        string // the email before the change (normalised)
	nota         string // the note of the directo account that followed a new email
	fotoAnterior string // the photo replaced by an approved «foto» (removed from the CDN after the commit)
}

// aplicaCambios writes a before/after snapshot (any subset of the fields) to the athlete and their profile: the write
// path of an approved change request and of the fields «Editar mi perfil» applies at once. prev is the athlete locked
// by the caller. Only the changed fields are written; an email change keeps the one account per email rule (the
// directo account follows the athlete, another person's email is a conflict).
func (s *Svc) aplicaCambios(ctx context.Context, tx pgx.Tx, cid uuid.UUID, prev row, c cambiosPerfil, anio int) (aplicado, error) {
	destino := prev.ID
	a := aplicado{next: datoDeRow(prev)}
	for _, k := range c.Claves {
		if err := a.next.pon(k, c.Despues[k]); err != nil {
			return a, err
		}
	}
	next := &a.next
	// One account per email: the new email must not be another athlete's and, if it already has a directo
	// account of another person, the reviewer has to fix that first.
	if prev.Email != nil {
		a.viejo = normEmail(*prev.Email)
	}
	nuevo := normEmail(next.Email)
	if nuevo != "" && nuevo != a.viejo {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND email = $2 AND estado <> 'baja' AND id <> $3`,
			cid, nuevo, destino).Scan(&n); err != nil {
			return a, err
		}
		if n > 0 {
			return a, problem.Conflict("EMAIL_EN_USO", "Ese email ya es el de otro atleta de la competición.")
		}
		cuenta, err := cuentaFanDe(ctx, s.fansSvc, cid, nuevo)
		if err != nil {
			s.a.Log.Warn("fans por-email no disponible al cambiar el email de un atleta", "atleta", destino.String(), "err", err)
		} else if cuenta != nil && cuenta.AtletaID != uuid.Nil && cuenta.AtletaID != destino {
			return a, problem.Conflict("EMAIL_EN_USO", "Ese email ya tiene la cuenta del directo de otra persona.")
		}
		if a.nota, err = s.sigueLaCuentaFan(ctx, cid, destino, prev.Email, nuevo); err != nil {
			return a, err
		}
		if cuenta != nil && cuenta.Tipo == "publico" && cuenta.AtletaID != destino {
			if err := unirCuentaFan(ctx, tx, cid, destino, nuevo, next.Telefono, cuenta); err != nil {
				return a, err
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
	// The competition: her place moves exactly as when the team changes it in the fiche (the same cupo rules,
	// 409 CUPO_COMPLETO when the destination is full), and the team's own choice is not kept over the
	// athlete's. Nothing else derives from prueba: the day and the session come from the published schedule and
	// are moved by the schedule service, not by an edit (the admin path does the same).
	if cambiaClave(c, "prueba") {
		if err := s.muevePlaza(ctx, tx, cid, destino, next.Prueba, false); err != nil {
			var pe *problem.Error
			if errors.As(err, &pe) && pe.Status == http.StatusConflict {
				return a, problem.Conflict("CUPO_COMPLETO", "La competición que pide no tiene plazas libres. Rechaza el cambio o cámbiasela desde su ficha.")
			}
			return a, err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE atletas SET nombre = $2, apellidos = $3, email = NULLIF($4,''), telefono = $5, sexo = $6,
		fecha_nacimiento = $7, division = $8, club = $9, ciudad = $10, prueba = $12,
		prueba_org_at = CASE WHEN prueba <> $12 THEN NULL ELSE prueba_org_at END,
		version = version + 1, updated_at = now()
		WHERE competition_id = $1 AND id = $11`,
		cid, next.Nombre, next.Apellidos, nuevo, next.Telefono, next.Sexo, fechaNac, division, next.Club, next.Ciudad, destino, next.Prueba); err != nil {
		if db.IsUniqueViolation(err, "") {
			return a, problem.Conflict("DATOS_DUPLICADOS", "Esos datos ya son los de otro atleta.")
		}
		return a, err
	}
	if _, err := tx.Exec(ctx, `UPDATE perfiles SET frase = $2, bio = $3, instagram = $4, entrenador = $5,
		marca_sq = $6, marca_bp = $7, marca_dl = $8, updated_at = now() WHERE atleta_id = $1`,
		destino, next.Frase, next.Bio, next.Instagram, next.Entrenador, next.MarcaSQ, next.MarcaBP, next.MarcaDL); err != nil {
		return a, err
	}
	// The photo uploaded from the area becomes the public one (the same write as the area upload did before).
	if u := fotoCambio(c); u != "" && u != prev.FotoURL {
		if _, err := tx.Exec(ctx, `UPDATE perfiles SET foto_url = $2, focal_x = 50, focal_y = 35, updated_at = now() WHERE atleta_id = $1`, destino, u); err != nil {
			return a, err
		}
		a.fotoAnterior = prev.FotoURL
	}
	return a, nil
}

// varsCambioNueva are the variables of the email/WhatsApp to the team.
func (s *Svc) varsCambioNueva(d DatoPerfil, c cambiosPerfil, slug string, id uuid.UUID) map[string]string {
	textoEmail, textoWA := textoCambios(c)
	return map[string]string{
		"nombre": d.Nombre, "apellidos": d.Apellidos, "email": d.Email, "telefono": telTexto(d.Telefono), "club": d.Club,
		"cambios": textoEmail, "cambiosWA": textoWA, "urlRevisar": s.urlRevisar(slug, id),
	}
}
