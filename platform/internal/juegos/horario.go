// horario.go: what the fantasy needs of the published schedule (BIZ-143): the first session of the day starts
// the rooms and the last one closes the clausulazos. No published schedule for the day = clausulazos blocked.
package juegos

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// horarioDia is the first and the last session start of a competition day.
type horarioDia struct {
	OK           bool
	Inicio       time.Time
	UltimaSesion time.Time
}

// clausulazoVista tells the web whether clausulazos are open and when they close.
type clausulazoVista struct {
	Abierto bool       `json:"abierto"`
	Cierre  *time.Time `json:"cierre,omitempty" doc:"Inicio de la última sesión del día: desde entonces no hay clausulazos"`
	Motivo  string     `json:"motivo,omitempty" enum:"sin_horario,ultima_sesion" doc:"Por qué están cerrados"`
}

// horarioVista tells the web when the day starts for the rooms and when clausulazos close (absent = no schedule).
type horarioVista struct {
	Inicio       *time.Time `json:"inicio,omitempty" doc:"Primera sesión del día: desde entonces las salas están en juego"`
	UltimaSesion *time.Time `json:"ultimaSesion,omitempty" doc:"Inicio de la última sesión: cierre de clausulazos"`
}

func (h horarioDia) vista() horarioVista {
	if !h.OK {
		return horarioVista{}
	}
	return horarioVista{Inicio: &h.Inicio, UltimaSesion: &h.UltimaSesion}
}

// clausulazo: open until the last session of the day starts; without schedule, blocked.
func (h horarioDia) clausulazo(ahora time.Time) clausulazoVista {
	if !h.OK {
		return clausulazoVista{Motivo: "sin_horario"}
	}
	c := h.UltimaSesion
	if !ahora.Before(c) {
		return clausulazoVista{Cierre: &c, Motivo: "ultima_sesion"}
	}
	return clausulazoVista{Abierto: true, Cierre: &c}
}

// problema is the 409 of a clausulazo out of hours, with the reason and the hour.
func (c clausulazoVista) problema() error {
	if c.Abierto {
		return nil
	}
	if c.Cierre == nil {
		return problem.Conflict("CLAUSULAZO_CERRADO", "Los clausulazos están bloqueados hasta que se publique el horario del día.")
	}
	return problem.Conflict("CLAUSULAZO_CERRADO", "Los clausulazos se cerraron a las "+c.Cierre.In(madrid()).Format("15:04")+", al empezar la última sesión del día.")
}

// empezado: the day is on (first session started, or the staff moved the jornada on): no new rooms, joins or
// requests.
func (h horarioDia) empezado(j jornada, ahora time.Time) bool {
	return j.Estado == "en_juego" || j.Estado == "cerrada" || (h.OK && !ahora.Before(h.Inicio))
}

func madrid() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}

// horarioDeSnapshot extracts the day from the published schedule.
func horarioDeSnapshot(dias []snapDia, dia string) horarioDia {
	var h horarioDia
	for _, d := range dias {
		if d.Fecha != dia {
			continue
		}
		for _, f := range d.Flights {
			if !h.OK || f.Inicio.Before(h.Inicio) {
				h.Inicio = f.Inicio
			}
			if !h.OK || f.Inicio.After(h.UltimaSesion) {
				h.UltimaSesion = f.Inicio
			}
			h.OK = true
		}
	}
	return h
}

// snapDia mirrors what juegos reads of schedule's published snapshot.
type snapDia struct {
	Fecha   string `json:"fecha"`
	Flights []struct {
		Inicio time.Time `json:"inicio"`
	} `json:"flights"`
}

type horEntrada struct {
	h   horarioDia
	exp time.Time
}

// horario reads the day of the published schedule (cached 30 s per pod). A schedule that cannot be read counts as
// not published: clausulazos stay blocked (fail closed) and the rooms start when the staff moves the jornada on.
func (s *Svc) horario(ctx context.Context, cid uuid.UUID, dia string) horarioDia {
	if s.horarioFijo != nil {
		return *s.horarioFijo
	}
	if s.sched == nil {
		return horarioDia{}
	}
	k := cid.String() + ":" + dia
	s.marcMu.Lock()
	e, ok := s.hor[k]
	s.marcMu.Unlock()
	if ok && time.Now().Before(e.exp) {
		return e.h
	}
	var snap *struct {
		Dias []snapDia `json:"dias"`
	}
	h := horarioDia{}
	if err := s.sched.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/horarios/publicados", nil, &snap); err != nil {
		s.a.Log.Warn("horario publicado no disponible", "cid", cid, "err", err)
		return h // not cached: retry on the next request
	}
	if snap != nil {
		h = horarioDeSnapshot(snap.Dias, dia)
	}
	s.marcMu.Lock()
	if s.hor == nil || len(s.hor) > 64 {
		s.hor = map[string]horEntrada{}
	}
	s.hor[k] = horEntrada{h: h, exp: time.Now().Add(30 * time.Second)}
	s.marcMu.Unlock()
	return h
}
