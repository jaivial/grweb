package schedule

import (
	"context"
	"slices"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Competitions of the event (Figma 56 «por competición»): AEP-3 runs the last day and the days before it are AEP-2,
// the same split the athletes service uses for the alta. Each one is planned and generated on its own.
var ordenPruebas = []string{"aep2", "aep3"}

// pruebaDeDia is the competition of the i-th date of an event with n dates: the last one is AEP-3 and the ones
// before it AEP-2 (with a single date, AEP-2). With two dates it is the AEP-2 / AEP-3 split of every year.
func pruebaDeDia(n, i int) string {
	if n >= 2 && i == n-1 {
		return "aep3"
	}
	return "aep2"
}

func nombrePrueba(p string) string { return strings.ToUpper(strings.Replace(p, "aep", "AEP-", 1)) }

func nombreOSin(p string) string {
	if p == "" {
		return "sin competición"
	}
	return nombrePrueba(p)
}

func compiteEn(p string) string {
	if p == "" {
		return "no tiene competición"
	}
	return "compite en " + nombrePrueba(p)
}

func dePrueba(ats []atleta, p string) []atleta {
	out := make([]atleta, 0, len(ats))
	for _, a := range ats {
		if a.Prueba == p {
			out = append(out, a)
		}
	}
	return out
}

// diasPrueba: from the day of the competition on when the event has one day per competition; otherwise every day
// (the generator then places it after the sesiones of the other competition, see colocar's ocupado). AEP-2 is the
// first date (what does not fit moves on to the next days, BIZ-168) and AEP-3 the last one (pruebaDeDia).
func diasPrueba(ds []Dia, p string) []Dia {
	if len(ds) < 2 {
		return ds
	}
	if p == "aep3" {
		return ds[len(ds)-1:]
	}
	return ds
}

// sesionesDePrueba returns the sesiones a generation of competition p replaces (the ones of p, or whose athletes are
// all of p) and the ones it keeps (the generator plans around them). Its athletes sitting in other sesiones are
// taken out of them.
func sesionesDePrueba(ctx context.Context, tx pgx.Tx, cid uuid.UUID, p string, ats []atleta) ([]uuid.UUID, []sesionRow, error) {
	suyos := map[uuid.UUID]bool{}
	ids := make([]uuid.UUID, 0, len(ats))
	for _, a := range ats {
		suyos[a.ID] = true
		ids = append(ids, a.ID)
	}
	fl, asig, err := loadSesiones(ctx, tx, cid)
	if err != nil {
		return nil, nil, err
	}
	out := []uuid.UUID{}
	var quedan []sesionRow
	for _, f := range fl {
		as := asig[f.ID]
		todos := len(as) > 0 && (f.Prueba == "" || f.Prueba == p)
		for _, a := range as {
			todos = todos && suyos[a]
		}
		// BIZ-168: a legacy sesion without competition is always replaced; keeping it pushed the new plan to another day.
		if todos || f.Prueba == p || f.Prueba == "" {
			out = append(out, f.ID)
		} else {
			quedan = append(quedan, f)
		}
	}
	_, err = tx.Exec(ctx, `DELETE FROM sesion_atletas WHERE competition_id = $1 AND atleta_id = ANY($2)`, cid, ids)
	return out, quedan, err
}

// Weight classes per sex (same lists as the athletes service).
var categoriasSexo = map[string][]string{
	"F": {"-43", "-47", "-52", "-57", "-63", "-69", "-76", "-84", "+84"},
	"M": {"-53", "-59", "-66", "-74", "-83", "-93", "-105", "-120", "+120"},
}

// niveles: AEP levels a session may have (” = sin competición).
var niveles = []string{"", "aep1", "aep2", "aep3"}

// categoriasSesion applies the BIZ-202 edit of a session: one sex, several weight classes of that sex, one AEP level.
func categoriasSesion(f sesionRow, b sesionIn) (sexo string, cats []string, prueba string, err error) {
	sexo, cats, prueba = f.Sexo, f.Categorias, f.Prueba
	if b.Sexo != nil {
		if sexo != *b.Sexo && b.Categorias == nil {
			cats = nil // the old classes belong to the other sex
		}
		sexo = *b.Sexo
	}
	if b.Categorias != nil {
		cats = *b.Categorias
	}
	if b.Nivel != nil {
		prueba = *b.Nivel
	}
	if !slices.Contains(niveles, prueba) {
		return "", nil, "", problem.Unprocessable("NIVEL_INVALIDO", "El nivel tiene que ser AEP-1, AEP-2 o AEP-3.")
	}
	if cats == nil {
		cats = []string{}
	}
	if len(cats) > 0 && sexo == "" {
		return "", nil, "", problem.Unprocessable("SEXO_REQUERIDO", "Elige el sexo de la sesión antes que sus categorías de peso.")
	}
	seen := map[string]bool{}
	out := []string{}
	for _, c := range cats {
		if !slices.Contains(categoriasSexo[sexo], c) {
			return "", nil, "", problem.Unprocessable("CATEGORIA_INVALIDA", "La categoría "+c+" kg no es de ese sexo.")
		}
		if !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return catKey(out[i]) < catKey(out[j]) })
	return sexo, out, prueba, nil
}
