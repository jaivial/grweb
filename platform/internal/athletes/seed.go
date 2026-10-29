package athletes

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// Seed: 150 places of the GR Cup 2026 (145 confirmed, 3 in reserve, 2 withdrawn). «Datos de ejemplo»: synthetic
// names, emails on the reserved .test domain; the named athletes reproduce the cases of the Figma design.

const fotos = "https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/"

var (
	nombresF   = []string{"Lucía", "María", "Paula", "Carmen", "Ana", "Irene", "Sara", "Laura", "Marta", "Alba", "Claudia", "Elena", "Andrea", "Nerea", "Raquel", "Julia", "Noelia", "Cristina", "Silvia", "Patricia", "Beatriz", "Rocío", "Inés", "Eva", "Lorena", "Ainhoa", "Celia", "Miriam", "Natalia", "Alicia", "Vega", "Carla"}
	nombresM   = []string{"Carlos", "Javier", "Pablo", "Diego", "Álvaro", "Sergio", "Hugo", "Adrián", "Iván", "Daniel", "Alejandro", "David", "Jorge", "Marcos", "Rubén", "Óscar", "Raúl", "Víctor", "Jaime", "Mario", "Andrés", "Héctor", "Nacho", "Fernando", "Miguel", "Pedro", "Tomás", "Gonzalo", "Samuel", "Eric", "Iker", "Joan", "Pau", "Vicent", "Xavi", "Toni"}
	apellidos  = []string{"García", "Martínez", "López", "Sánchez", "Pérez", "Gómez", "Martín", "Ruiz", "Hernández", "Jiménez", "Díaz", "Moreno", "Álvarez", "Romero", "Alonso", "Navarro", "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Serrano", "Blanco", "Molina", "Castillo", "Ortega", "Rubio", "Marín", "Sanz", "Iglesias", "Ferrer", "Vidal", "Soler", "Puig", "Mas", "Llorens", "Ribes", "Climent", "Bosch", "Peris"}
	clubs      = [][2]string{{"GRStrength", "Valencia"}, {"CF Isabel Atlas", "Valencia"}, {"Gym Mediterrani", "Alcoy"}, {"Valkyria Powerlifting Center", "Valencia"}, {"Iron Gym Valencia", "Valencia"}, {"Club Paterna", "Paterna"}, {"Maniak Fitness", "Torrent"}, {"Atlas Gandia", "Gandia"}, {"Fuerza Castelló", "Castellón"}, {"Powerhouse Murcia", "Murcia"}, {"Iron Mallorca", "Palma"}, {"Sueca Strength", "Sueca"}, {"Independiente", ""}, {"Independiente", ""}}
	pesosF     = []string{"-47", "-52", "-57", "-57", "-63", "-63", "-63", "-69", "-69", "-76", "-84", "+84"}
	pesosM     = []string{"-59", "-66", "-74", "-74", "-83", "-83", "-83", "-93", "-93", "-105", "-105", "-120", "+120"}
	edadesDist = []int{17, 19, 21, 22, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 41, 44, 47, 52}
)

type seedAtleta struct {
	nombre, apellidos, sexo, cat, div, club, ciudad, estado, lic, nac string
	orden                                                             int
	foto                                                              string
	imagen                                                            bool
	frase, bio, ig, entrenador, historial                             string
	sq, bp, dl                                                        float64
	osq, obp, odl                                                     float64
	seguidores                                                        int
	peso                                                              float64
	completo                                                          bool
}

// Named athletes of the design (lists, record, edge cases and public pages).
var seedFigma = []seedAtleta{
	{nombre: "Laura", apellidos: "Gómez Ruiz", sexo: "F", cat: "-63", div: "open", club: "GRStrength", ciudad: "Almussafes", estado: "confirmado", lic: "VAL-0412", nac: "1997-05-14",
		foto: fotos + "ChatGPT%20Image%2023%20mar%202026%2C%2000_00_19.png", imagen: true, frase: "Cuarta competición · objetivo 360 kg de total", ig: "@laura.lifts", entrenador: "GRStrength",
		bio: "Empezó en el crossfit y lleva tres años centrada en el powerlifting.", sq: 135, bp: 72.5, dl: 160, osq: 125, obp: 67.5, odl: 150, seguidores: 214},
	{nombre: "Carlos", apellidos: "Sánchez", sexo: "M", cat: "-83", div: "open", club: "CF Isabel Atlas", ciudad: "Valencia", estado: "confirmado", lic: "VAL-0233", nac: "1999-02-03",
		foto: fotos + "f7efa2c624614a66b35f6ab01980e09e.webp", imagen: true, frase: "Objetivo 2026: 700 kg de total", ig: "@carlos.lifts", entrenador: "Laura Vidal",
		bio:       "Tercera temporada en powerlifting. Viene de la halterofilia y entrena en CF Isabel Atlas. Objetivo 2026: total de 700 kg.",
		historial: "2025 · AEP-2 Llíria · −83 kg · 4.º · 612,5 kg", sq: 232.5, bp: 152.5, dl: 270, osq: 215, obp: 140, odl: 240, seguidores: 96},
	{nombre: "Marta", apellidos: "Ruiz Soler", sexo: "F", cat: "-63", div: "junior", club: "Iron Gym Valencia", ciudad: "Valencia", estado: "confirmado", lic: "VAL-0533", nac: "2004-11-22",
		foto: fotos + "ChatGPT%20Image%2022%20mar%202026%2C%2023_51_04.png", imagen: true, frase: "Primer año como júnior", sq: 110, bp: 57.5, dl: 140, seguidores: 96},
	{nombre: "Pablo", apellidos: "Romero", sexo: "M", cat: "-83", div: "open", club: "Independiente", estado: "confirmado", lic: "VAL-0287", nac: "1995-08-09",
		foto: fotos + "ChatGPT%20Image%2022%20mar%202026%2C%2023_47_22.png", imagen: false, seguidores: 12},
	{nombre: "Diego", apellidos: "Moreno", sexo: "M", cat: "-74", div: "subjunior", club: "GRStrength", ciudad: "Almussafes", estado: "confirmado", lic: "VAL-0611", nac: "2008-01-10",
		foto: fotos + "ChatGPT%20Image%2022%20mar%202026%2C%2023_40_58.png", imagen: true, frase: "El más joven del equipo", sq: 170, bp: 105, dl: 205, seguidores: 77},
	{nombre: "Sara", apellidos: "López", sexo: "F", cat: "-58", div: "subjunior", club: "Independiente", estado: "confirmado", lic: "VAL-0610", nac: "2010-03-18", seguidores: 0},
	{nombre: "Javier", apellidos: "Torres", sexo: "M", cat: "-93", div: "master1", club: "Club Paterna", ciudad: "Paterna", estado: "reserva", orden: 1, lic: "VAL-0198", nac: "1984-09-30", seguidores: 3},
	{nombre: "Hugo", apellidos: "Navarro", sexo: "M", cat: "-83", div: "open", club: "Atlas Gandia", ciudad: "Gandia", estado: "reserva", orden: 2, lic: "VAL-0702", nac: "1996-12-01"},
	{nombre: "Elena", apellidos: "Castillo", sexo: "F", cat: "-57", div: "open", club: "Fuerza Castelló", ciudad: "Castellón", estado: "reserva", orden: 3, lic: "CAS-0102", nac: "1993-06-25"},
	{nombre: "Álvaro", apellidos: "Gil", sexo: "M", cat: "-105", div: "open", club: "GRStrength", estado: "baja", lic: "VAL-0177", nac: "1991-04-04", seguidores: 41},
	{nombre: "Ana", apellidos: "Pérez", sexo: "F", cat: "-57", div: "open", club: "Independiente", ciudad: "Alzira", estado: "confirmado", lic: "VAL-0345", nac: "1998-07-07",
		foto: fotos + "ChatGPT%20Image%2022%20mar%202026%2C%2023_52_34.png", imagen: true, sq: 112.5, bp: 62.5, dl: 142.5, seguidores: 38},
	{nombre: "Lucía", apellidos: "Martín", sexo: "F", cat: "-69", div: "open", club: "GRStrength", ciudad: "Silla", estado: "confirmado", lic: "VAL-0401", nac: "1994-01-30", seguidores: 22},
	{nombre: "Hugo", apellidos: "Ferrer", sexo: "M", cat: "-83", div: "open", club: "Independiente", estado: "confirmado", lic: "VAL-0809", nac: "1997-10-15", seguidores: 9},
	{nombre: "Adrián", apellidos: "Molina", sexo: "M", cat: "-83", div: "open", club: "Gym Mediterrani", ciudad: "Cullera", estado: "confirmado", lic: "ALI-0044", nac: "1992-02-27", seguidores: 15},
	{nombre: "Iván", apellidos: "Serrano", sexo: "M", cat: "-93", div: "open", club: "Sueca Strength", ciudad: "Sueca", estado: "confirmado", lic: "VAL-0920", nac: "1990-05-05", peso: 95.2},
	{nombre: "Sergio", apellidos: "Vidal", sexo: "M", cat: "-105", div: "open", club: "CF Isabel Atlas", ciudad: "Valencia", estado: "confirmado", lic: "VAL-0931", nac: "1989-08-19", seguidores: 18},
	{nombre: "Álvaro", apellidos: "Ribes", sexo: "M", cat: "-93", div: "open", club: "Club Paterna", estado: "baja", lic: "VAL-0944", nac: "1993-03-03"},
}

func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	s.init(a)
	c, err := s.comps.Public(ctx, "grcup")
	if err != nil {
		return errors.New("la competición grcup no existe todavía (ejecuta antes el seed de competition)")
	}
	// Places of the AEP quota on the competition (shown in /participantes). Retried by the Job if competition is
	// still rolling out.
	if c.Inscripcion.Plazas == 0 {
		if err := s.comp.Do(ctx, http.MethodPut, "/internal/competiciones/"+c.ID.String()+"/inscripcion/plazas", map[string]int{"plazas": 150}, nil); err != nil {
			return fmt.Errorf("plazas de la competición: %w", err)
		}
	}
	var n int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1`, c.ID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		a.Log.Info("atletas ya sembrados", "total", n)
		return nil
	}
	year := c.Year()
	rng := rand.New(rand.NewPCG(2026, 7))
	list := append([]seedAtleta{}, seedFigma...)
	used := map[string]bool{}
	for _, x := range list {
		used[x.nombre+" "+x.apellidos] = true
	}
	mujeres := 0
	for _, x := range list {
		if x.sexo == "F" && x.estado == "confirmado" {
			mujeres++
		}
	}
	confirmados := 0
	for _, x := range list {
		if x.estado == "confirmado" {
			confirmados++
		}
	}
	for i := 0; confirmados < 145; i++ {
		sexo := "M"
		if mujeres < 64 {
			sexo = "F"
		}
		var nombre string
		var cat string
		if sexo == "F" {
			nombre, cat = nombresF[rng.IntN(len(nombresF))], pesosF[rng.IntN(len(pesosF))]
		} else {
			nombre, cat = nombresM[rng.IntN(len(nombresM))], pesosM[rng.IntN(len(pesosM))]
		}
		ap := apellidos[rng.IntN(len(apellidos))] + " " + apellidos[rng.IntN(len(apellidos))]
		if used[nombre+" "+ap] {
			continue
		}
		used[nombre+" "+ap] = true
		edad := edadesDist[rng.IntN(len(edadesDist))]
		nac := time.Date(year-edad, time.Month(1+rng.IntN(12)), 1+rng.IntN(27), 0, 0, 0, 0, time.UTC)
		if edad < 18 {
			nac = time.Date(year-18, 1, 2, 0, 0, 0, 0, time.UTC) // no extra minors: the design has one (Sara López)
		}
		div := DivisionPorEdad(nac, year)
		club := clubs[rng.IntN(len(clubs))]
		x := seedAtleta{nombre: nombre, apellidos: ap, sexo: sexo, cat: cat, div: div, club: club[0], ciudad: club[1], estado: "confirmado",
			lic: fmt.Sprintf("VAL-%04d", 1000+i), nac: nac.Format("2006-01-02"), seguidores: rng.IntN(60)}
		// Half of them filled in their best lifts; a few wrote a sentence.
		if rng.IntN(2) == 0 {
			base := map[string]float64{"F": 95, "M": 160}[sexo] + float64(rng.IntN(60))
			x.sq, x.bp, x.dl = roundKg(base), roundKg(base*0.62), roundKg(base*1.18)
		}
		if rng.IntN(5) == 0 {
			x.frase = []string{"Primera competición", "A por el récord del club", "Vuelvo tras una lesión", "Objetivo: total élite"}[rng.IntN(4)]
		}
		list = append(list, x)
		confirmados++
		if sexo == "F" {
			mujeres++
		}
	}

	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for _, x := range list {
			id := newID()
			nac, _ := ParseFecha(x.nac)
			email := strings.ToLower(Slugify(x.nombre+"."+x.apellidos)) + "@ejemplo.test"
			email = strings.ReplaceAll(email, "-", ".")
			var orden *int
			if x.orden > 0 {
				orden = &x.orden
			}
			if _, err := tx.Exec(ctx, `INSERT INTO atletas (id, competition_id, licencia, nombre, apellidos, email, sexo, fecha_nacimiento, categoria, division, club, ciudad, estado, orden_reserva, origen,
				intento_sq, intento_bp, intento_dl) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'aep',$15,$16,$17)`,
				id, c.ID, x.lic, x.nombre, x.apellidos, email, x.sexo, nac, x.cat, x.div, x.club, x.ciudad, x.estado, orden, nz(x.osq), nz(x.obp), nz(x.odl)); err != nil {
				return fmt.Errorf("%s %s: %w", x.nombre, x.apellidos, err)
			}
			if err := createPerfil(ctx, tx, c.ID, id, x.nombre+" "+x.apellidos); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `UPDATE perfiles SET foto_url = $2, focal_y = 30, frase = $3, bio = $4, instagram = $5, entrenador = $6, historial = $7, marca_sq = $8, marca_bp = $9, marca_dl = $10
				WHERE atleta_id = $1`, id, x.foto, x.frase, x.bio, x.ig, x.entrenador, x.historial, nz(x.sq), nz(x.bp), nz(x.dl)); err != nil {
				return err
			}
			if x.imagen {
				if _, err := tx.Exec(ctx, `UPDATE perfiles SET imagen_at = now() - interval '20 days', imagen_version = '2026-10', imagen_hash = 'ejemplo', imagen_origen = '/entradas · formulario de reserva (datos de ejemplo)', imagen_ip = '83.45.12.x' WHERE atleta_id = $1`, id); err != nil {
					return err
				}
			}
			if x.peso > 0 {
				ok, sug := CheckPesaje(x.sexo, x.cat, x.div, x.peso)
				estado := map[bool]string{true: "ok", false: "fuera"}[ok]
				if ok {
					sug = ""
				}
				if _, err := tx.Exec(ctx, `UPDATE atletas SET peso_corporal = $2, pesaje_estado = $3, pesaje_sugerencia = $4, pesado_at = now(), pesado_por = 'Mesa de pesaje (datos de ejemplo)' WHERE id = $1`, id, x.peso, estado, sug); err != nil {
					return err
				}
			}
			if x.seguidores > 0 {
				batch := &pgx.Batch{}
				for k := 0; k < x.seguidores; k++ {
					batch.Queue(`INSERT INTO seguimientos (id, atleta_id, competition_id, email, token_hash, consentimiento_at, confirmado_at) VALUES ($1,$2,$3,$4,$5, now() - $6::interval, now() - $6::interval)`,
						newID(), id, c.ID, fmt.Sprintf("seguidor%d.%s@ejemplo.test", k, id.String()[:8]), hashToken(randomToken()), fmt.Sprintf("%d hours", rng.IntN(24*40)))
				}
				if err := tx.SendBatch(ctx, batch).Close(); err != nil {
					return err
				}
			}
			if err := hist(ctx, tx, id, "Alta desde el acta de la AEP", "Datos de ejemplo"); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.bump(ctx, c.ID)
	a.Log.Info("atletas de la GR Cup listos (Datos de ejemplo)", "total", len(list), "competicion", c.ID)
	return nil
}

func roundKg(f float64) float64 { return float64(int(f/2.5)) * 2.5 }

func nz(f float64) *float64 {
	if f == 0 {
		return nil
	}
	return &f
}
