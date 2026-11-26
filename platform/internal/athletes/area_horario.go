package athletes

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// MiHorario is the published schedule of one athlete («Mis horarios», área de atleta): the day and times the
// organisation published for this inscription and nothing else. Publicado false → the schedule is not out yet.
type MiHorario struct {
	Publicado    bool       `json:"publicado" doc:"La organización ya publicó los horarios"`
	Dia          string     `json:"dia,omitempty" doc:"Día en el que compite (YYYY-MM-DD)"`
	Lote         *int       `json:"lote,omitempty" doc:"Orden de salida dentro del día"`
	Inicio       *time.Time `json:"inicio,omitempty" doc:"Hora de inicio de la sesión"`
	PesajeInicio *time.Time `json:"pesajeInicio,omitempty"`
	PesajeFin    *time.Time `json:"pesajeFin,omitempty"`
	Sesion       string     `json:"sesion,omitempty" doc:"Sesión publicada: sexo y categorías de peso"`
	SesionNivel  string     `json:"sesionNivel,omitempty" doc:"Nivel AEP de la sesión (AEP-2, AEP-3)"`
	ZonaHoraria  string     `json:"zonaHoraria"`
	ICS          string     `json:"ics,omitempty" doc:"Añadir mi horario al calendario (.ics)"`
}

func (s *Svc) registerAreaHorario() {
	api := s.a.API
	base := "/api/area-atleta"

	type cookieIn struct {
		Session string `cookie:"gr_area"`
	}
	type out struct {
		CacheControl string `header:"Cache-Control"`
		Body         MiHorario
	}
	type icsOut struct {
		ContentType  string `header:"Content-Type"`
		Disposition  string `header:"Content-Disposition"`
		CacheControl string `header:"Cache-Control"`
		Body         []byte
	}

	// horario is the schedule of the athlete signed in with the cookie (only its own: no other athlete's data).
	horario := func(ctx context.Context, cookie string) (row, compref.Comp, MiHorario, error) {
		r, err := s.session(ctx, cookie)
		if err != nil {
			return row{}, compref.Comp{}, MiHorario{}, err
		}
		c, err := s.comps.ByID(ctx, r.CompetitionID)
		if err != nil {
			return row{}, compref.Comp{}, MiHorario{}, err
		}
		h := MiHorario{Publicado: r.Jornada != "", Dia: r.Jornada, Lote: r.Lote, Inicio: r.HoraInicio, PesajeInicio: r.PesajeInicio,
			PesajeFin: r.PesajeFin, Sesion: r.Sesion, SesionNivel: r.SesionNivel, ZonaHoraria: c.ZonaHoraria}
		if h.ZonaHoraria == "" {
			h.ZonaHoraria = "Europe/Madrid"
		}
		if h.Publicado {
			// The calendar lives in the area (session cookie): it follows the published version and works also when the
			// profile is not public, which the public .ics of the schedule cannot do. Relative: the area always reads it
			// from the origin it is being served from.
			h.ICS = base + "/horario.ics"
		}
		return r, c, h, nil
	}

	huma.Register(api, huma.Operation{OperationID: "area-horario", Method: http.MethodGet, Path: base + "/horario", Summary: "Mis horarios: día, pesaje, lote y hora de salida publicados", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*out, error) {
			_, _, h, err := horario(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			return &out{CacheControl: "private, max-age=60", Body: h}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "area-horario-ics", Method: http.MethodGet, Path: base + "/horario.ics", Summary: "Mi horario en el calendario (.ics)", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*icsOut, error) {
			_, c, h, err := horario(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			if !h.Publicado || (h.Inicio == nil && h.PesajeInicio == nil) {
				return nil, problem.NotFound("Tu horario aún no está publicado.")
			}
			return &icsOut{ContentType: "text/calendar; charset=utf-8", Disposition: `attachment; filename="mi-horario.ics"`,
				CacheControl: "no-store", Body: miCalendario(c, h)}, nil
		})
}

// miCalendario writes the calendar of one athlete (RFC 5545): the weigh-in window and the session, each with a
// reminder 30 minutes before. Same shape as the public .ics of the schedule, but only this athlete's day.
func miCalendario(c compref.Comp, h MiHorario) []byte {
	loc, err := time.LoadLocation(h.ZonaHoraria)
	if err != nil {
		loc = madrid
	}
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
	hora := func(t time.Time) string { return t.In(loc).Format("15:04") }
	var sede []string
	for _, x := range []string{c.Sede.Nombre, c.Sede.Direccion, c.Sede.Ciudad} {
		if x = strings.TrimSpace(x); x != "" {
			sede = append(sede, x)
		}
	}
	lugar := strings.Join(sede, ", ")
	now := ts(time.Now())
	line("BEGIN:VCALENDAR")
	line("VERSION:2.0")
	line("PRODID:-//GR Strength Cup//Mi horario//ES")
	line("CALSCALE:GREGORIAN")
	line("METHOD:PUBLISH")
	line("X-WR-CALNAME:" + icsEsc(c.Nombre))
	evento := func(uid, resumen, descripcion string, ini, fin time.Time) {
		line("BEGIN:VEVENT")
		line("UID:" + uid + "@grcup")
		line("DTSTAMP:" + now)
		line("DTSTART:" + ts(ini))
		line("DTEND:" + ts(fin))
		line("SUMMARY:" + icsEsc(resumen))
		if descripcion != "" {
			line("DESCRIPTION:" + icsEsc(descripcion))
		}
		if lugar != "" {
			line("LOCATION:" + icsEsc(lugar))
		}
		line("BEGIN:VALARM")
		line("ACTION:DISPLAY")
		line("DESCRIPTION:" + icsEsc(resumen))
		line("TRIGGER:-PT30M")
		line("END:VALARM")
		line("END:VEVENT")
	}
	if h.PesajeInicio != nil {
		fin := *h.PesajeInicio
		if h.PesajeFin != nil {
			fin = *h.PesajeFin
		}
		evento("pesaje-"+h.Dia, c.Nombre+" · Pesaje", "Mesa de pesaje: DNI y licencia.", *h.PesajeInicio, fin)
	}
	if h.Inicio != nil {
		resumen := c.Nombre + " · Competición"
		if h.Sesion != "" {
			resumen = fmt.Sprintf("%s · %s", c.Nombre, h.Sesion)
		}
		desc := "Inicio de tu sesión"
		if h.Lote != nil {
			desc += fmt.Sprintf(" · Lote %d", *h.Lote)
		}
		if h.PesajeInicio != nil {
			desc += " · Pesaje " + hora(*h.PesajeInicio)
		}
		evento("sesion-"+h.Dia, resumen, desc, *h.Inicio, h.Inicio.Add(4*time.Hour)) // una sesión ocupa la tarde entera
	}
	line("END:VCALENDAR")
	return []byte(b.String())
}

// icsEsc escapes the text values of an iCalendar (RFC 5545 §3.3.11).
func icsEsc(s string) string {
	return strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`, "\r", "").Replace(s)
}
