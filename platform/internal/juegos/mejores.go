package juegos

import (
	"time"

	"github.com/google/uuid"
)

// mejorIntento is the heaviest good lift of one movement in a weight class.
type mejorIntento struct {
	Kg       float64   `json:"kg"`
	AtletaID uuid.UUID `json:"atletaId"`
	Nombre   string    `json:"nombre"`
	N        int       `json:"n" doc:"Intento (1-3) en que lo levantó"`

	hora *time.Time // when it was judged (ties)
}

// mejoresCategoria is the best good lift of squat, bench and deadlift of one sex + weight class (for the porra and
// future bonuses). A movement nobody has lifted yet is absent.
type mejoresCategoria struct {
	Sexo      string        `json:"sexo"`
	Categoria string        `json:"categoria"`
	SQ        *mejorIntento `json:"sq,omitempty"`
	BP        *mejorIntento `json:"bp,omitempty"`
	DL        *mejorIntento `json:"dl,omitempty"`
}

// mejoresPorCategoria takes the judged attempts of the scoreboard (OpenLifter sends kg and good / no lift per
// attempt; live keeps attempts 1-3) and keeps, per sex + weight class, the heaviest good lift of each movement.
// Categories keep the order of the scoreboard.
// shortcut: a tie in kg keeps whoever was judged first (then scoreboard order); the IPF rule (lighter bodyweight)
// needs the bodyweight in the scoreboard — add it when a game settles on this.
func mejoresPorCategoria(m *Marcador) []mejoresCategoria {
	out := []mejoresCategoria{}
	idx := map[[2]string]int{}
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		k := [2]string{ma.Sexo, ma.Categoria}
		p, ok := idx[k]
		if !ok {
			p = len(out)
			idx[k] = p
			out = append(out, mejoresCategoria{Sexo: ma.Sexo, Categoria: ma.Categoria})
		}
		mc := &out[p]
		for mv, dst := range map[string]**mejorIntento{"sq": &mc.SQ, "bp": &mc.BP, "dl": &mc.DL} {
			for _, mi := range ma.Intentos[mv] {
				if mi.Resultado != "valido" || mi.Peso <= 0 {
					continue
				}
				cur := *dst
				antes := cur != nil && mi.JuzgadoAt != nil && cur.hora != nil && mi.JuzgadoAt.Before(*cur.hora)
				if cur == nil || mi.Peso > cur.Kg || (mi.Peso == cur.Kg && antes) {
					*dst = &mejorIntento{Kg: mi.Peso, AtletaID: ma.AtletaID, Nombre: ma.NombrePublico, N: mi.N, hora: mi.JuzgadoAt}
				}
			}
		}
	}
	return out
}
