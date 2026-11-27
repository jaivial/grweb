// porra_atleta.go: the card of one athlete of a jornada for the porra (GET …/porra/atletas/{atletaId}): its attempts,
// best lifts, total and IPF GL, read from the scoreboard of the jornada's day (cached 1 s by marcador).
package juegos

import (
	"time"

	"github.com/google/uuid"
)

// intentoVista is one declared attempt of an athlete.
type intentoVista struct {
	N         int     `json:"n"`
	Peso      float64 `json:"peso"`
	Resultado string  `json:"resultado" enum:"pendiente,valido,nulo,renuncia"`
}

// intentosVista are the attempts of the three lifts.
type intentosVista struct {
	SQ []intentoVista `json:"sq"`
	BP []intentoVista `json:"bp"`
	DL []intentoVista `json:"dl"`
}

// mejorVista is the best valid lift of each movement (null while there is none).
type mejorVista struct {
	SQ *float64 `json:"sq"`
	BP *float64 `json:"bp"`
	DL *float64 `json:"dl"`
}

// atletaPorraVista is the public card of an athlete in the porra of one jornada.
type atletaPorraVista struct {
	AtletaID      uuid.UUID     `json:"atletaId"`
	Nombre        string        `json:"nombre"`
	Slug          string        `json:"slug" doc:"Solo con perfil público"`
	FotoURL       string        `json:"fotoUrl" doc:"Solo con perfil público e imagen consentida"`
	Sexo          string        `json:"sexo"`
	Categoria     string        `json:"categoria"`
	Prueba        string        `json:"prueba" doc:"aep2, aep3 o vacío"`
	SesionEnCurso bool          `json:"sesionEnCurso"`
	Terminado     bool          `json:"terminado"`
	Intentos      intentosVista `json:"intentos"`
	Mejor         mejorVista    `json:"mejor"`
	Total         *float64      `json:"total"`
	GL            *float64      `json:"gl"`
	HoraInicio    string        `json:"horaInicio" doc:"RFC 3339 del inicio de su sesión; vacío si no tiene sesión publicada"`
}

// atletaPorra builds the card of an athlete from the scoreboard; false when he is not in it.
func atletaPorra(m *Marcador, aid uuid.UUID) (atletaPorraVista, bool) {
	for i := range m.Atletas {
		ma := &m.Atletas[i]
		if ma.AtletaID != aid {
			continue
		}
		v := atletaPorraVista{
			AtletaID: ma.AtletaID, Nombre: ma.NombrePublico, Slug: ma.Slug, FotoURL: ma.FotoURL, Sexo: ma.Sexo,
			Categoria: ma.Categoria, Prueba: ma.Prueba, SesionEnCurso: ma.SesionEnCurso, Terminado: ma.Terminado,
			Intentos: intentosVista{SQ: intentosDe(ma.Intentos["sq"]), BP: intentosDe(ma.Intentos["bp"]), DL: intentosDe(ma.Intentos["dl"])},
			Mejor:    mejorVista{SQ: ma.Mejor["sq"], BP: ma.Mejor["bp"], DL: ma.Mejor["dl"]},
			Total:    ma.Total, GL: ma.GL,
		}
		if ma.SesionInicio != nil {
			v.HoraInicio = ma.SesionInicio.Format(time.RFC3339)
		}
		return v, true
	}
	return atletaPorraVista{}, false
}

// intentosDe maps the attempts of one lift (never null in the JSON).
func intentosDe(l []MarcadorIntento) []intentoVista {
	out := make([]intentoVista, 0, len(l))
	for _, it := range l {
		out = append(out, intentoVista{N: it.N, Peso: it.Peso, Resultado: it.Resultado})
	}
	return out
}
