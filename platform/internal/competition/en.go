package competition

import (
	"context"
)

// CompEn holds the English texts of the public competition data (empty strings keep the Spanish ones).
type CompEn struct {
	Nombre     string         `json:"nombre,omitempty"`
	Evento     EventoEn       `json:"evento"`
	ComoLlegar []ComoLlegarEn `json:"comoLlegar,omitempty" doc:"Por posición, como en comoLlegar"`
}

type EventoEn struct {
	Descripcion string `json:"descripcion,omitempty"`
	Nivel       string `json:"nivel,omitempty"`
}

type ComoLlegarEn struct {
	Titulo  string `json:"titulo,omitempty"`
	Detalle string `json:"detalle,omitempty"`
	Nota    string `json:"nota,omitempty"`
}

func or(en, es string) string {
	if en != "" {
		return en
	}
	return es
}

// enPublica overlays the English texts on p (?lang=en).
func (s *Svc) enPublica(ctx context.Context, slug string, p *Publica) {
	var e CompEn
	if s.a.DB.QueryRow(ctx, `SELECT en FROM competiciones WHERE slug = $1`, slug).Scan(&e) != nil {
		return
	}
	p.Nombre = or(e.Nombre, p.Nombre)
	p.Evento.Descripcion, p.Evento.Nivel = or(e.Evento.Descripcion, p.Evento.Descripcion), or(e.Evento.Nivel, p.Evento.Nivel)
	cl := make([]ComoLlegar, len(p.ComoLlegar))
	for i, c := range p.ComoLlegar {
		if i < len(e.ComoLlegar) {
			x := e.ComoLlegar[i]
			c.Titulo, c.Detalle, c.Nota = or(x.Titulo, c.Titulo), or(x.Detalle, c.Detalle), or(x.Nota, c.Nota)
		}
		cl[i] = c
	}
	p.ComoLlegar = cl
}
