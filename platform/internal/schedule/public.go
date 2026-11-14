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
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagPub = []string{"Web pública"}

type slugIn struct {
	Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
}

// PubAtleta is a public athlete of a date.
type PubAtleta struct {
	Slug           string `json:"slug"`
	Nombre         string `json:"nombre"`
	Club           string `json:"club"`
	DivisionNombre string `json:"divisionNombre"`
	Sexo           string `json:"sexo"`
	Categoria      string `json:"categoria"`
	Lote           int    `json:"lote"`
}

// PubDia is a date of /horarios with its live state (one platform, athletes in lot order).
type PubDia struct {
	Fecha          string       `json:"fecha"`
	Prueba         string       `json:"prueba,omitempty"`
	Puertas        string       `json:"puertas,omitempty"`
	Notas          []string     `json:"notas"`
	Agenda         []AgendaItem `json:"agenda"`
	Inicio         time.Time    `json:"inicio"`
	InicioEstimado time.Time    `json:"inicioEstimado" doc:"Inicio + retraso"`
	Fin            time.Time    `json:"fin"`
	PesajeInicio   time.Time    `json:"pesajeInicio"`
	PesajeFin      time.Time    `json:"pesajeFin"`
	Estado         string       `json:"estado" enum:"programado,en_curso,finalizado"`
	RetrasoMin     int          `json:"retrasoMin"`
	Total          int          `json:"total" doc:"Atletas del día"`
	Categorias     []string     `json:"categorias" doc:"«F −47», «M −93»… en orden de salida"`
	Atletas        []PubAtleta  `json:"atletas" doc:"Solo perfiles públicos (los menores sin autorización no aparecen)"`
}

// Horarios is the public schedule. Not published yet → publicado false and no days.
type Horarios struct {
	Publicado     bool      `json:"publicado"`
	Version       int       `json:"version,omitempty"`
	ActualizadoAt time.Time `json:"actualizadoAt,omitzero"`
	ZonaHoraria   string    `json:"zonaHoraria"`
	Dias          []PubDia  `json:"dias"`
}

// sinAtletas copies h without the athlete lists (h comes from the cache and is never modified).
func sinAtletas(h Horarios) Horarios {
	dias := make([]PubDia, len(h.Dias))
	for i, d := range h.Dias {
		d.Atletas = []PubAtleta{}
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
	if v != nil {
		dir, err := loadDirecto(ctx, s.a.DB, c.ID)
		if err != nil {
			return h, err
		}
		pub, fresh := s.publicos(ctx, c.ID)
		h.Publicado, h.Version, h.ActualizadoAt, h.ZonaHoraria = true, v.Numero, v.At, v.Snapshot.ZonaHoraria
		for _, d := range v.Snapshot.Dias {
			pd := PubDia{Fecha: d.Fecha, Prueba: d.Prueba, Puertas: d.Puertas, Notas: d.Notas, Agenda: d.Agenda, Inicio: d.Inicio, InicioEstimado: d.Inicio, Fin: d.Fin,
				PesajeInicio: d.PesajeInicio, PesajeFin: d.PesajeFin, Estado: "programado", Total: len(d.Atletas), Categorias: []string{}, Atletas: []PubAtleta{}}
			if l, ok := dir[d.Fecha]; ok {
				pd.Estado, pd.RetrasoMin = l.Estado, l.RetrasoMin
				pd.InicioEstimado = d.Inicio.Add(time.Duration(l.RetrasoMin) * time.Minute)
				pd.Fin = pd.Fin.Add(time.Duration(l.RetrasoMin) * time.Minute)
			}
			vista := map[string]bool{}
			for _, a := range d.Atletas {
				if k := a.Sexo + " " + strings.Replace(a.Categoria, "-", "−", 1); a.Categoria != "" && !vista[k] {
					vista[k] = true
					pd.Categorias = append(pd.Categorias, k)
				}
				// A profile hidden after publishing (consent withdrawn, erased…) disappears at once.
				if !a.Publico || (fresh && !pub[a.ID]) {
					continue
				}
				pd.Atletas = append(pd.Atletas, PubAtleta{Slug: a.Slug, Nombre: a.Nombre, Club: a.Club, DivisionNombre: a.DivisionNombre, Sexo: a.Sexo, Categoria: a.Categoria, Lote: a.Lote})
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

func (s *Svc) registerPublic() {
	api := s.a.API
	type hOut struct {
		ETag         string `header:"ETag"`
		CacheControl string `header:"Cache-Control"`
		Body         Horarios
	}
	type hIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Resumen bool   `query:"resumen" doc:"Sin las listas de atletas (la home solo enseña categorías y horas)"`
	}
	huma.Register(api, huma.Operation{OperationID: "horarios-publicos", Method: http.MethodGet, Path: "/api/competiciones/{slug}/horarios", Summary: "Horarios publicados con el estado en directo de cada fecha", Tags: tagPub},
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
			if in.Resumen {
				h, etag = sinAtletas(h), etag[:len(etag)-1]+`-r"`
			}
			return &hOut{ETag: etag, CacheControl: "public, max-age=15", Body: h}, nil
		})

	type icsIn struct {
		Slug    string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Atletas string `query:"atletas" maxLength:"2000" doc:"Slugs separados por comas (Mi horario). Vacío: una entrada por fecha."`
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

// calendario writes an iCalendar (RFC 5545) with one event per starred athlete (or per date when none), each
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
		if d.Total == 0 {
			continue
		}
		desc := fmt.Sprintf("Pesaje %s–%s", hhmm(d.PesajeInicio, loc), hhmm(d.PesajeFin, loc))
		if len(want) == 0 {
			evento("dia-"+d.Fecha+"-"+c.Slug, c.Nombre+" · competición", desc, d.InicioEstimado, d.Fin)
			continue
		}
		for _, a := range d.Atletas {
			if want[a.Slug] {
				evento(a.Slug+"-"+d.Fecha, fmt.Sprintf("%s compite (lote %d)", a.Nombre, a.Lote), desc, d.InicioEstimado, d.Fin)
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
