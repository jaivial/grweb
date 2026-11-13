package schedule

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Competitions of the event (Figma 56 «por competición»): AEP-2 runs the first day, AEP-3 the second one, the
// same split the athletes service uses for the alta. Each one is planned and generated on its own.
var ordenPruebas = []string{"aep2", "aep3"}

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

// diasPrueba: the day of the competition when the event has one day per competition; otherwise every day (the
// generator then places it after the flights of the other competition, see colocar's ocupado).
func diasPrueba(ds []Dia, p string) []Dia {
	if len(ds) < len(ordenPruebas) {
		return ds
	}
	for i, x := range ordenPruebas {
		if x == p {
			return ds[i : i+1]
		}
	}
	return ds
}

// flightsDePrueba returns the flights a generation of competition p replaces (the ones of p, or whose athletes are
// all of p) and the ones it keeps (the generator plans around them). Its athletes sitting in other flights are
// taken out of them.
func flightsDePrueba(ctx context.Context, tx pgx.Tx, cid uuid.UUID, p string, ats []atleta) ([]uuid.UUID, []flightRow, error) {
	suyos := map[uuid.UUID]bool{}
	ids := make([]uuid.UUID, 0, len(ats))
	for _, a := range ats {
		suyos[a.ID] = true
		ids = append(ids, a.ID)
	}
	fl, asig, err := loadFlights(ctx, tx, cid)
	if err != nil {
		return nil, nil, err
	}
	out := []uuid.UUID{}
	var quedan []flightRow
	for _, f := range fl {
		as := asig[f.ID]
		todos := len(as) > 0 && (f.Prueba == "" || f.Prueba == p)
		for _, a := range as {
			todos = todos && suyos[a]
		}
		if todos || f.Prueba == p {
			out = append(out, f.ID)
		} else {
			quedan = append(quedan, f)
		}
	}
	_, err = tx.Exec(ctx, `DELETE FROM flight_atletas WHERE competition_id = $1 AND atleta_id = ANY($2)`, cid, ids)
	return out, quedan, err
}
