package cms

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/legacy"
)

// rutasLegado are the public routes of the previous web that this one does not have (the others — /inscripcion,
// /horarios, /como-llegar, /politica-concurso, /consentimiento-datos — keep their path). /backoffice moves to its
// own domain: that redirect is done by nginx (see docs/runbooks/CORTE.md).
var rutasLegado = [][2]string{
	{"/raffle", "/sorteo"},
	{"/checkout", "/sorteo"},
	{"/success", "/sorteo"},
	{"/privacy", "/privacidad"},
	{"/terms", "/terminos"},
}

// etlMySQL («cms etl-mysql [--web slug] [--dry-run]») adds to the public edition the permanent redirects of the
// old routes, so links and search results of the previous web keep working. It does not read MySQL. Existing
// redirects of the same path are kept.
func (s *Svc) etlMySQL(ctx context.Context, a *app.App, args []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	o, err := legacy.Leer(args)
	if err != nil {
		return err
	}
	mapa, err := legacy.CargarMapa(ctx, a.Redis, a.Keys, o.DryRun)
	if err != nil {
		return err
	}
	eds := make([]legacy.Competicion, 0, len(mapa))
	for _, c := range mapa {
		eds = append(eds, c)
	}
	sort.Slice(eds, func(i, j int) bool { return eds[i].Fecha.After(eds[j].Fecha) })
	web := eds[0]
	if o.Web != "" {
		cid, err := s.comps.ID(ctx, o.Web)
		if err != nil {
			return fmt.Errorf("--web %s: %w", o.Web, err)
		}
		web = legacy.Competicion{Nueva: o.Web, NuevaID: cid}
	}
	inf := legacy.NuevoInforme("cms", o.DryRun)
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for i, r := range rutasLegado {
			inf.Leidos["rutas antiguas"]++
			tag, err := tx.Exec(ctx, `INSERT INTO redirecciones (id, competition_id, desde, hacia, codigo, orden) VALUES ($1,$2,$3,$4,301,$5) ON CONFLICT (competition_id, desde) DO NOTHING`,
				legacy.ID("redireccion", web.NuevaID.String()+r[0]), web.NuevaID, r[0], r[1], 100+i)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				inf.Omitir("ruta que ya tiene redirección")
				continue
			}
			inf.Escritos["redirecciones 301"]++
		}
		if o.DryRun {
			return legacy.ErrDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, legacy.ErrDryRun) {
		return err
	}
	inf.Notas = append(inf.Notas, "redirecciones en la edición "+web.Nueva+"; /backoffice/* → dominio del backoffice se hace en nginx")
	if !o.DryRun {
		s.bump(ctx, web.NuevaID)
	}
	inf.Log(a.Log)
	return nil
}
