package competition

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/legacy"
)

// etlMySQL («competition etl-mysql --mysql DSN [--dry-run] [--mapa 3=grcup-etl]») maps the old competitions to
// editions: an edition that already exists keeps its data (the old site only adds people and results to it); a
// missing one is created with the old name, date and venue. The map is left in Redis for the other ETLs.
func (s *Svc) etlMySQL(ctx context.Context, a *app.App, args []string) error {
	if err := s.init(a); err != nil {
		return err
	}
	o, err := legacy.Leer(args)
	if err != nil {
		return err
	}
	my, err := legacy.Abrir(ctx, o.DSN)
	if err != nil {
		return err
	}
	defer my.Close()
	comps, err := legacy.Ediciones(ctx, my, o.Mapa)
	if err != nil {
		return err
	}
	inf := legacy.NuevoInforme("competition", o.DryRun)
	creadas := []Competicion{}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for i := range comps {
			c := &comps[i]
			inf.Leidos["competiciones"]++
			if c.Nueva == "-" {
				inf.Omitir("competición excluida con --mapa")
				continue
			}
			if !slugValido(c.Nueva) {
				return fmt.Errorf("competición %d: el slug «%s» no es válido en la plataforma nueva (usa --mapa %d=slug)", c.ID, c.Nueva, c.ID)
			}
			if err := tx.QueryRow(ctx, `SELECT id FROM competiciones WHERE slug = $1`, c.Nueva).Scan(&c.NuevaID); err == nil {
				c.Existe = true
				inf.Notas = append(inf.Notas, fmt.Sprintf("«%s» (%d) → %s: ya existe, se conservan sus datos", c.Nombre, c.ID, c.Nueva))
				continue
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			c.NuevaID = legacy.ID("Competiciones", c.ID)
			estado, insc := "borrador", Inscripcion{Modo: "externa", Estado: "proximamente"}
			if c.Finalizada {
				estado, insc = "finalizado", Inscripcion{Modo: "externa", Estado: "cerrada"}
			}
			corto := strings.TrimSpace(strings.Replace(c.Nombre, "GR Strength Cup", "GR Cup", 1))
			if len([]rune(corto)) > 40 {
				corto = string([]rune(corto)[:40])
			}
			sede := Sede{Nombre: c.Lugar}
			evento := Evento{Descripcion: c.Descripcion, EmailContacto: c.Email, Telefono: c.Telefono, Organizador: "GR Strength"}
			fecha := c.Fecha.Format("2006-01-02")
			if _, err := tx.Exec(ctx, `INSERT INTO competiciones (id, slug, nombre, nombre_corto, estado, fecha_inicio, fecha_fin, sede, evento, modulos, inscripcion)
				VALUES ($1,$2,$3,$4,$5,$6::date,$6::date,$7,$8,$9,$10)`, c.NuevaID, c.Nueva, c.Nombre, corto, estado, fecha, sede, evento, defaultModulos(), insc); err != nil {
				return fmt.Errorf("competición %d: %w", c.ID, err)
			}
			if err := seedChecklist(ctx, tx, c.NuevaID); err != nil {
				return err
			}
			if err := events.Enqueue(ctx, tx, events.New(ctx, "competition.creada", map[string]any{"slug": c.Nueva, "nombre": c.Nombre, "migracion": true},
				events.Competition(c.NuevaID.String()), events.Subject("competicion:"+c.NuevaID.String()))); err != nil {
				return err
			}
			c.Existe = !o.DryRun // a dry run rolls back: the other real ETLs must not write to a planned edition
			inf.Escritos["competiciones"]++
			accion := "creada"
			if o.DryRun {
				accion = "se creará"
			}
			inf.Notas = append(inf.Notas, fmt.Sprintf("«%s» (%d) → %s: %s (%s)", c.Nombre, c.ID, c.Nueva, accion, estado))
			creadas = append(creadas, Competicion{ID: c.NuevaID, Slug: c.Nueva})
		}
		if o.DryRun {
			return legacy.ErrDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, legacy.ErrDryRun) {
		return err
	}
	if o.DryRun {
		creadas = nil
	}
	if err := legacy.GuardarMapa(ctx, a.Redis, a.Keys, comps); err != nil {
		return err
	}
	for _, c := range creadas {
		// default roles right away (identity's consumer of competition.creada does it too when identity was down)
		if err := s.identity.Do(ctx, http.MethodPost, "/internal/competiciones/"+c.ID.String()+"/roles-por-defecto", map[string]any{}, nil); err != nil {
			a.Log.Warn("roles por defecto (se reintentará por evento)", "competicion", c.ID, "err", err)
		}
		if full, err := getComp(ctx, a.DB, "id", c.ID); err == nil {
			s.afterChange(ctx, full)
		}
	}
	inf.Log(a.Log)
	return nil
}

func slugValido(s string) bool {
	if len(s) < 2 || len(s) > 41 {
		return false
	}
	for i, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r == '-' && i > 0)
		if !ok {
			return false
		}
	}
	return true
}
