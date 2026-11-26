package athletes

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"github.com/danielgtaylor/huma/v2"
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
	huma.Register(api, huma.Operation{OperationID: "area-horario", Method: http.MethodGet, Path: base + "/horario", Summary: "Mis horarios: día, pesaje, lote y hora de salida publicados", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*out, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			c, err := s.comps.ByID(ctx, r.CompetitionID)
			if err != nil {
				return nil, err
			}
			h := MiHorario{Publicado: r.Jornada != "", Dia: r.Jornada, Lote: r.Lote, Inicio: r.HoraInicio, PesajeInicio: r.PesajeInicio,
				PesajeFin: r.PesajeFin, Sesion: r.Sesion, SesionNivel: r.SesionNivel, ZonaHoraria: c.ZonaHoraria}
			if h.ZonaHoraria == "" {
				h.ZonaHoraria = "Europe/Madrid"
			}
			// The calendar of the schedule service: it follows the published version, so a change of time lands in the
			// athlete's calendar without downloading anything again.
			if h.Publicado && r.Slug != "" {
				h.ICS = s.webURL + "/api/competiciones/" + c.Slug + "/horarios.ics?atletas=" + url.QueryEscape(r.Slug)
			}
			return &out{CacheControl: "private, max-age=60", Body: h}, nil
		})
}
