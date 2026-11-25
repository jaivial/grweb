package schedule

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/entexto"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagPub = []string{"Web pública"}

type slugIn struct {
	Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
}

// PubAtleta is a public athlete of a sesion.
type PubAtleta struct {
	Slug           string `json:"slug"`
	Nombre         string `json:"nombre"`
	Club           string `json:"club"`
	DivisionNombre string `json:"divisionNombre"`
	Sexo           string `json:"sexo"`
	Categoria      string `json:"categoria"`
	Lote           int    `json:"lote"`
}

// PubSesion is a session (time slot) of /horarios: information only, no live state or delays (Jaime, 14-nov).
type PubSesion struct {
	ID           uuid.UUID   `json:"id"`
	Prueba       string      `json:"prueba,omitempty" doc:"aep2 o aep3"`
	EP           string      `json:"ep,omitempty" doc:"«AEP-2» / «AEP-3»"`
	Titulo       string      `json:"titulo"`
	Sexo         string      `json:"sexo"`
	Inicio       time.Time   `json:"inicio"`
	Fin          time.Time   `json:"fin"`
	PesajeInicio time.Time   `json:"pesajeInicio"`
	PesajeFin    time.Time   `json:"pesajeFin"`
	Total        int         `json:"total" doc:"Atletas de la sesión"`
	Atletas      []PubAtleta `json:"atletas,omitempty" doc:"Solo en la caché interna: la web los pide paginados en …/horarios/{id}/atletas"`
}

// PubDia is a day of /horarios.
type PubDia struct {
	Fecha    string       `json:"fecha"`
	Puertas  string       `json:"puertas,omitempty"`
	Notas    []string     `json:"notas"`
	Agenda   []AgendaItem `json:"agenda"`
	Sesiones []PubSesion  `json:"horarios" doc:"Sesiones del día por hora (una sola tarima)"`
}

// Horarios is the public schedule (Figma page 41). Not published yet → publicado false and no days.
type Horarios struct {
	Publicado     bool      `json:"publicado"`
	Version       int       `json:"version,omitempty"`
	ActualizadoAt time.Time `json:"actualizadoAt,omitzero"`
	ZonaHoraria   string    `json:"zonaHoraria"`
	Dias          []PubDia  `json:"dias"`
}

// sinAtletas copies h without the per-sesion athlete lists (h comes from the cache and is never modified).
func sinAtletas(h Horarios) Horarios {
	dias := make([]PubDia, len(h.Dias))
	for i, d := range h.Dias {
		fl := make([]PubSesion, len(d.Sesiones))
		for j, f := range d.Sesiones {
			f.Atletas = nil
			fl[j] = f
		}
		d.Sesiones = fl
		dias[i] = d
	}
	h.Dias = dias
	return h
}

// publicos returns the ids of the athletes whose profile is public right now (cached 60 s). ok is false when the
// athletes service is down: the published names are then served as they were frozen.
func (s *Svc) publicos(ctx context.Context, cid uuid.UUID) (map[uuid.UUID]bool, bool) {
	key := "publicos:" + cid.String()
	var ids []uuid.UUID
	if !s.cache.Get(ctx, key, &ids) {
		ats, err := s.confirmados(ctx, cid)
		if err != nil {
			return nil, false
		}
		ids = []uuid.UUID{}
		for _, a := range ats {
			if a.Publico {
				ids = append(ids, a.ID)
			}
		}
		s.cache.Set(ctx, key, ids, time.Minute)
	}
	m := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return m, true
}

func (s *Svc) horarios(ctx context.Context, c compref.Comp) (Horarios, error) {
	key := c.ID.String() + ":" + s.version(ctx, c.ID)
	var h Horarios
	if s.cache.Get(ctx, key, &h) {
		return h, nil
	}
	h = Horarios{ZonaHoraria: c.ZonaHoraria, Dias: []PubDia{}}
	v, err := s.versionPublicada(ctx, s.a.DB, c.ID)
	if err != nil {
		return h, err
	}
	// «Publicar horarios» off: the web shows its fallback (as if nothing were published) while the team plans.
	visible, err := webVisible(ctx, s.a.DB, c.ID)
	if err != nil {
		return h, err
	}
	if v != nil && visible {
		pub, fresh := s.publicos(ctx, c.ID)
		h.Publicado, h.Version, h.ActualizadoAt, h.ZonaHoraria = true, v.Numero, v.At, v.Snapshot.ZonaHoraria
		for _, d := range v.Snapshot.Dias {
			pd := PubDia{Fecha: d.Fecha, Puertas: d.Puertas, Notas: d.Notas, Agenda: d.Agenda, Sesiones: []PubSesion{}}
			for _, f := range d.Sesiones {
				pf := PubSesion{ID: f.ID, Prueba: f.Prueba, EP: nombrePrueba(f.Prueba), Titulo: f.Titulo, Sexo: f.Sexo, Inicio: f.Inicio, Fin: f.Fin,
					PesajeInicio: f.PesajeInicio, PesajeFin: f.PesajeFin, Total: len(f.Atletas), Atletas: []PubAtleta{}}
				for _, a := range f.Atletas {
					// A profile hidden after publishing (consent withdrawn, erased…) disappears at once.
					if !a.Publico || (fresh && !pub[a.ID]) {
						continue
					}
					pf.Atletas = append(pf.Atletas, PubAtleta{Slug: a.Slug, Nombre: a.Nombre, Club: a.Club, DivisionNombre: a.DivisionNombre, Sexo: a.Sexo, Categoria: a.Categoria, Lote: a.Lote})
				}
				pd.Sesiones = append(pd.Sesiones, pf)
			}
			if pd.Notas == nil {
				pd.Notas = []string{}
			}
			if pd.Agenda == nil {
				pd.Agenda = []AgendaItem{}
			}
			h.Dias = append(h.Dias, pd)
		}
	}
	s.cache.Set(ctx, key, h, time.Minute)
	return h, nil
}

// enHorarios overlays the English texts (config.en: Spanish → English) on a cache copy; session titles built by the
// planner («Masculino −83 kg») get their sex word translated.
func (s *Svc) enHorarios(ctx context.Context, cid uuid.UUID, h *Horarios) {
	var d entexto.Dict
	_ = s.a.DB.QueryRow(ctx, `SELECT en FROM config WHERE competition_id = $1`, cid).Scan(&d)
	sexo := strings.NewReplacer("Masculino", "Men", "Femenino", "Women")
	for i := range h.Dias {
		dia := &h.Dias[i]
		notas := make([]string, len(dia.Notas))
		for j, n := range dia.Notas {
			notas[j] = d.T(n)
		}
		dia.Notas = notas
		ag := make([]AgendaItem, len(dia.Agenda))
		for j, a := range dia.Agenda {
			a.Titulo = d.T(a.Titulo)
			ag[j] = a
		}
		dia.Agenda = ag
		for j := range dia.Sesiones {
			t := dia.Sesiones[j].Titulo
			if v := d.T(t); v != t {
				dia.Sesiones[j].Titulo = v
			} else {
				dia.Sesiones[j].Titulo = sexo.Replace(t)
			}
		}
	}
}

func (s *Svc) registerPublic() {
	api := s.a.API
	type hOut struct {
		ETag         string `header:"ETag"`
		CacheControl string `header:"Cache-Control"`
		Body         Horarios
	}
	type hIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Resumen bool   `query:"resumen" doc:"Compatibilidad: la respuesta ya no lleva listas de atletas"`
		entexto.Lang
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-publicos", Method: http.MethodGet, Path: "/api/competiciones/{slug}/horarios", Summary: "Horarios publicados: fechas y sesiones por hora", Tags: tagPub},
		func(ctx context.Context, in *hIn) (*hOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			h, err := s.horarios(ctx, c)
			if err != nil {
				return nil, err
			}
			etag := fmt.Sprintf(`W/"%d-%s"`, h.Version, s.version(ctx, c.ID))
			h = sinAtletas(h) // athletes come paginated from …/horarios/{id}/atletas
			_ = in.Resumen
			if in.En() {
				s.enHorarios(ctx, c.ID, &h)
			}
			return &hOut{ETag: etag, CacheControl: "public, max-age=15", Body: h}, nil
		})

	type pagIn struct {
		Slug     string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		ID       uuid.UUID `path:"id"`
		Page     int       `query:"page" minimum:"1" default:"1"`
		PageSize int       `query:"pageSize" minimum:"1" maximum:"50" default:"6"`
	}
	type pagOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         struct {
			Items    []PubAtleta `json:"items"`
			Total    int         `json:"total" doc:"Atletas públicos de la sesión"`
			Page     int         `json:"page"`
			PageSize int         `json:"pageSize"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-sesion-atletas-publicos", Method: http.MethodGet, Path: "/api/competiciones/{slug}/horarios/{id}/atletas", Summary: "Atletas de una sesión publicada, paginados (orden de salida)", Tags: tagPub},
		func(ctx context.Context, in *pagIn) (*pagOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			h, err := s.horarios(ctx, c)
			if err != nil {
				return nil, err
			}
			for _, d := range h.Dias {
				for _, f := range d.Sesiones {
					if f.ID != in.ID {
						continue
					}
					o := &pagOut{CacheControl: "public, max-age=15"}
					o.Body.Total, o.Body.Page, o.Body.PageSize, o.Body.Items = len(f.Atletas), in.Page, in.PageSize, []PubAtleta{}
					if from := (in.Page - 1) * in.PageSize; from < len(f.Atletas) {
						o.Body.Items = f.Atletas[from:min(from+in.PageSize, len(f.Atletas))]
					}
					return o, nil
				}
			}
			return nil, problem.NotFound("Esa sesión no está en los horarios publicados.")
		})

	type icsIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Atletas string `query:"atletas" maxLength:"2000" doc:"Slugs separados por comas (Mi horario). Vacío: todas las sesiones."`
	}
	type icsOut struct {
		ContentType  string `header:"Content-Type"`
		Disposition  string `header:"Content-Disposition"`
		CacheControl string `header:"Cache-Control"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-ics", Method: http.MethodGet, Path: "/api/competiciones/{slug}/horarios.ics", Summary: "Mi horario en el calendario (.ics)", Tags: tagPub},
		func(ctx context.Context, in *icsIn) (*icsOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			h, err := s.horarios(ctx, c)
			if err != nil {
				return nil, err
			}
			if !h.Publicado {
				return nil, problem.NotFound("Los horarios aún no están publicados.")
			}
			want := map[string]bool{}
			for _, sl := range strings.Split(in.Atletas, ",") {
				if sl = strings.TrimSpace(sl); sl != "" && len(want) < 60 {
					want[sl] = true
				}
			}
			return &icsOut{ContentType: "text/calendar; charset=utf-8", Disposition: `attachment; filename="horario-` + c.Slug + `.ics"`, CacheControl: "no-store",
				Body: []byte(calendario(c, h, want))}, nil
		})
}

// calendario writes an iCalendar (RFC 5545) with one event per starred athlete (or per sesion when none), each
// with a reminder 30 minutes before.
func calendario(c compref.Comp, h Horarios, want map[string]bool) string {
	var b strings.Builder
	line := func(s string) {
		// Fold at 75 octets (continuation lines start with a space).
		for len(s) > 75 {
			cut := 75
			for cut > 0 && (s[cut]&0xC0) == 0x80 {
				cut-- // do not split a UTF-8 sequence
			}
			b.WriteString(s[:cut] + "\r\n")
			s = " " + s[cut:]
		}
		b.WriteString(s + "\r\n")
	}
	ts := func(t time.Time) string { return t.UTC().Format("20060102T150405Z") }
	lugar := strings.TrimSpace(strings.Join(compact(c.Sede.Nombre, c.Sede.Direccion, c.Sede.Ciudad), ", "))
	now := ts(time.Now())
	line("BEGIN:VCALENDAR")
	line("VERSION:2.0")
	line("PRODID:-//GR Strength Cup//Horarios//ES")
	line("CALSCALE:GREGORIAN")
	line("METHOD:PUBLISH")
	line("X-WR-CALNAME:" + esc(c.Nombre))
	evento := func(uid, resumen, desc string, ini, fin time.Time) {
		line("BEGIN:VEVENT")
		line("UID:" + uid + "@grcup")
		line("DTSTAMP:" + now)
		line("DTSTART:" + ts(ini))
		line("DTEND:" + ts(fin))
		line("SUMMARY:" + esc(resumen))
		line("DESCRIPTION:" + esc(desc))
		if lugar != "" {
			line("LOCATION:" + esc(lugar))
		}
		line("BEGIN:VALARM")
		line("ACTION:DISPLAY")
		line("DESCRIPTION:" + esc(resumen))
		line("TRIGGER:-PT30M")
		line("END:VALARM")
		line("END:VEVENT")
	}
	loc, err := time.LoadLocation(h.ZonaHoraria)
	if err != nil {
		loc = madrid
	}
	for _, d := range h.Dias {
		for _, f := range d.Sesiones {
			desc := fmt.Sprintf("%s · Pesaje %s–%s", f.Titulo, hhmm(f.PesajeInicio, loc), hhmm(f.PesajeFin, loc))
			if len(want) == 0 {
				evento(f.ID.String(), c.Nombre+" · "+f.Titulo, desc, f.Inicio, f.Fin)
				continue
			}
			for _, a := range f.Atletas {
				if want[a.Slug] {
					evento(a.Slug+"-"+f.ID.String(), fmt.Sprintf("%s compite · %s", a.Nombre, f.Titulo), desc, f.Inicio, f.Fin)
				}
			}
		}
	}
	line("END:VCALENDAR")
	return b.String()
}

func esc(s string) string {
	return strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`, "\r", "").Replace(s)
}

func compact(xs ...string) []string {
	var out []string
	for _, x := range xs {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}
