package app

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
)

// AlAnonimizar registers the handler of competition.anonimizacion_solicitada (Sistema › Zona peligrosa, Figma 64):
// fn removes the personal data the service keeps for that competition (totals and results stay) and returns the
// rows touched; the service then reports competition.anonimizada. Exactly once per service (processed_events).
func (a *App) AlAnonimizar(servicio string, fn func(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (int64, error)) {
	a.Go((&events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: servicio + "-anonimizar", Start: "$",
		Types: []string{events.AnonimizacionSolicitada}, Log: a.Log,
		Handle: func(ctx context.Context, e events.Event) error {
			cid, err := uuid.Parse(e.CompetitionID)
			if err != nil {
				return nil
			}
			return db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
				n, err := fn(ctx, tx, cid)
				if err != nil {
					return err
				}
				a.Log.Info("competición anonimizada", "competicion", cid, "filas", n)
				return events.Enqueue(ctx, tx, events.New(ctx, events.CompeticionAnonimizada, map[string]any{"servicio": servicio, "filas": n},
					events.Competition(cid.String()), events.ForPermission("integraciones.config")))
			})
		}}).Run)
}

// AlClonar registers the handler of competition.creada for a new edition cloned from another one: fn copies the
// structure the service owns (never personal data) according to copiar.
func (a *App) AlClonar(servicio string, fn func(ctx context.Context, tx pgx.Tx, desde, hacia uuid.UUID, copiar map[string]bool) error) {
	a.Go((&events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: servicio + "-clonar", Start: "$",
		Types: []string{events.CompeticionCreada}, Log: a.Log,
		Handle: func(ctx context.Context, e events.Event) error {
			hacia, err := uuid.Parse(e.CompetitionID)
			desde, copiar, ok := events.Clonado(e)
			if err != nil || !ok {
				return nil
			}
			return db.Tx(ctx, a.DB, func(tx pgx.Tx) error { return fn(ctx, tx, desde, hacia, copiar) })
		}}).Run)
}

// alEliminar handles competition.eliminada (Sistema › Zona peligrosa, Figma 64): it deletes the rows of that
// competition from every table of the service that has a competition_id column. Tables are tried in several passes
// (each in its own transaction) so foreign keys between them resolve whatever the order.
func (a *App) alEliminar(servicio string) {
	a.Go((&events.Consumer{Redis: a.Redis, DB: a.DB, Stream: a.Stream(), Group: servicio + "-eliminar", Start: "$",
		Types: []string{events.CompeticionEliminada}, Log: a.Log,
		Handle: func(ctx context.Context, e events.Event) error {
			cid, err := uuid.Parse(e.CompetitionID)
			if err != nil {
				return nil
			}
			rows, err := a.DB.Query(ctx, `SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema()
				AND column_name = 'competition_id' AND table_name NOT LIKE 'goose%' ORDER BY table_name`)
			if err != nil {
				return err
			}
			tablas, err := pgx.CollectRows(rows, pgx.RowTo[string])
			if err != nil {
				return err
			}
			var ultimo error
			for pasada := 0; pasada < 5 && len(tablas) > 0; pasada++ {
				pendientes := tablas[:0:0]
				for _, t := range tablas {
					if _, err := a.DB.Exec(ctx, `DELETE FROM `+pgx.Identifier{t}.Sanitize()+` WHERE competition_id = $1`, cid); err != nil {
						pendientes, ultimo = append(pendientes, t), err
					}
				}
				tablas = pendientes
			}
			if len(tablas) > 0 {
				return ultimo
			}
			a.Log.Info("datos de la competición eliminados", "competicion", cid)
			return nil
		}}).Run)
}
