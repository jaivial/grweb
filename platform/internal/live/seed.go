package live

import (
	"context"
	"errors"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// seedGRCup («Datos de ejemplo»): the live state and some regional records for GR Cup 2026, and the published
// results of the 2025 edition (grcup-2025, created by the competition seed) for /resultados/2025.
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	c, err := s.comps.Public(ctx, "grcup")
	if err != nil {
		return errors.New("la competición grcup no existe todavía (ejecuta antes el seed de competition)")
	}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO estado (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, c.ID); err != nil {
			return err
		}
		return seedRecords(ctx, tx, c.ID)
	})
	if err != nil {
		return err
	}
	c25, err := s.comps.Public(ctx, "grcup-2025")
	if err != nil {
		return errors.New("la edición grcup-2025 no existe todavía (la crea el seed de competition; el Job reintenta)")
	}
	var n int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM resultados WHERE competition_id = $1`, c25.ID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		a.Log.Info("resultados 2025 ya sembrados", "categorias", n)
		return nil
	}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO estado (competition_id, fase) VALUES ($1, 'finalizado') ON CONFLICT DO NOTHING`, c25.ID); err != nil {
			return err
		}
		if err := seedRecords(ctx, tx, c25.ID); err != nil {
			return err
		}
		p, t := edicion2025()
		for _, k := range p.categorias() {
			cat := clasificar(p, t, nil, k, true)
			if _, err := tx.Exec(ctx, `INSERT INTO resultados (competition_id, categoria, datos, publicado_por, publicado_at) VALUES ($1,$2,$3,'Datos de ejemplo','2025-03-02 19:30:00+01')`,
				c25.ID, k, cat); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	a.Log.Info("resultados 2025 sembrados (Datos de ejemplo)")
	return nil
}

func seedRecords(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	recs := []struct {
		sexo, cat         string
		sq, bp, dl, total float64
	}{
		{"F", "-57", 140, 80, 170, 382.5}, {"F", "-63", 150, 87.5, 182.5, 412.5}, {"F", "-69", 160, 92.5, 192.5, 435},
		{"M", "-74", 235, 160, 270, 650}, {"M", "-83", 250, 167.5, 290, 697.5}, {"M", "-93", 262.5, 177.5, 302.5, 730},
	}
	for _, r := range recs {
		for m, v := range map[string]float64{"sq": r.sq, "bp": r.bp, "dl": r.dl, "total": r.total} {
			if _, err := tx.Exec(ctx, `INSERT INTO records (id, competition_id, ambito, sexo, categoria, movimiento, peso) VALUES ($1,$2,'CV',$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
				newID(), cid, r.sexo, r.cat, m, v); err != nil {
				return err
			}
		}
	}
	return nil
}

// edicion2025 builds the example 2025 edition as a plan + attempts, so its ranking goes through the same
// computation as a live competition.
func edicion2025() (*plan, tabla) {
	type e struct {
		nombre, club, sexo, cat, div string
		bw, sq, bp, dl               float64
	}
	list := []e{
		{"Laura Gómez", "GRStrength", "F", "-63", "Open", 62.4, 140, 82.5, 170},
		{"Marta Ruiz", "CF Isabel Alfas", "F", "-63", "Open", 62.9, 135, 77.5, 165},
		{"Ana Pérez", "Gym Mediterráneo", "F", "-63", "Júnior", 61.7, 125, 75, 160},
		{"Lucía Martín", "Independiente", "F", "-63", "Open", 62.1, 120, 70, 150},
		{"Noelia Serrano", "Club Paterna", "F", "-63", "Máster 1", 63.0, 110, 62.5, 135},
		{"Irene Vidal", "Iron Gym Valencia", "F", "-57", "Open", 56.4, 117.5, 65, 145},
		{"Paula Navarro", "GRStrength", "F", "-57", "Júnior", 55.8, 105, 60, 132.5},
		{"Elena Castro", "Barbell Club Murcia", "F", "-57", "Open", 56.9, 100, 57.5, 127.5},
		{"Cristina Gil", "Powerhouse Palma", "F", "-69", "Open", 68.2, 147.5, 85, 177.5},
		{"Raquel Moreno", "Gym Mediterráneo", "F", "-69", "Máster 1", 67.5, 125, 72.5, 152.5},
		{"Alba Ortega", "Independiente", "F", "-69", "Open", 66.8, 130, 70, 160},
		{"Carlos Sánchez", "CF Isabel Alfas", "M", "-83", "Open", 82.6, 220, 137.5, 240},
		{"Pablo Romero", "GRStrength", "M", "-83", "Open", 82.1, 205, 135, 245},
		{"Iván Serrano", "Iron Gym Valencia", "M", "-83", "Júnior", 81.4, 200, 127.5, 230},
		{"Sergio Blanco", "Barbell Club Murcia", "M", "-83", "Open", 82.9, 190, 130, 225},
		{"Javier Ramos", "Powerhouse Palma", "M", "-74", "Open", 73.6, 195, 130, 230},
		{"Diego Herrera", "GRStrength", "M", "-74", "Júnior", 72.9, 182.5, 117.5, 215},
		{"Mario Prieto", "Club Paterna", "M", "-74", "Open", 73.8, 175, 122.5, 210},
		{"Andrés Molina", "Gym Mediterráneo", "M", "-93", "Open", 92.4, 235, 152.5, 265},
		{"Rubén Cano", "CF Isabel Alfas", "M", "-93", "Máster 1", 91.7, 215, 145, 250},
		{"Hugo Delgado", "Independiente", "M", "-93", "Open", 90.8, 210, 140, 255},
		{"Óscar Lozano", "Iron Gym Valencia", "M", "-105", "Open", 103.9, 250, 165, 280},
		{"Víctor Pardo", "Powerhouse Palma", "M", "-105", "Open", 104.2, 240, 157.5, 285},
	}
	p := &plan{Atletas: map[uuid.UUID]*atleta{}}
	t := tabla{}
	fl := map[string]*flight{}
	r25 := func(v float64) float64 { return math.Round(v/2.5) * 2.5 }
	for i, x := range list {
		id := uuid.NewSHA1(uuid.NameSpaceURL, []byte("grcup-2025/"+x.nombre))
		bw := x.bw
		p.Atletas[id] = &atleta{ID: id, Nombre: x.nombre, Publico: true, Club: x.club, Sexo: x.sexo, Categoria: x.cat, DivisionNombre: x.div, PesoCorporal: &bw}
		k := clave(x.sexo, x.cat)
		f := fl[k]
		if f == nil {
			f = &flight{ID: uuid.NewSHA1(uuid.NameSpaceURL, []byte("grcup-2025/flight/"+k))}
			fl[k] = f
		}
		f.Atletas = append(f.Atletas, snapAtleta{ID: id, Lote: i + 1})
		t[id] = map[string]*[4]*intento{}
		for j, m := range movs {
			best := []float64{x.sq, x.bp, x.dl}[j]
			// the usual pattern (three good lifts), a missed third, or a missed second repeated
			w := [3]float64{r25(best * 0.92), r25(best * 0.97), best}
			res := [3]string{"valido", "valido", "valido"}
			switch (i + j) % 5 {
			case 1:
				w = [3]float64{r25(best * 0.95), best, best + 5}
				res[2] = "nulo"
			case 3:
				w = [3]float64{r25(best * 0.94), best, best}
				res[1] = "nulo"
			}
			arr := &[4]*intento{}
			for n := 0; n < 3; n++ {
				v := "BBB"
				if res[n] == "nulo" {
					v = "RRB"
				} else if (i+n)%4 == 0 {
					v = "BBR"
				}
				arr[n+1] = &intento{AtletaID: id, Mov: m, Numero: n + 1, Peso: w[n], Votos: v, Resultado: res[n]}
			}
			t[id][m] = arr
		}
	}
	for _, f := range fl {
		p.Flights = append(p.Flights, *f)
	}
	p.index()
	return p, t
}
