package raffle

import (
	"context"
	"errors"
	"time"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// seedGRCup («Datos de ejemplo»): the 2026 raffle set up as in Figma 60 (SBD belt, 1 €/boleto, up to 10 per person),
// with the sale off and the legal checklist pending until the advisor reviews it.
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	c, err := s.comps.Public(ctx, "grcup")
	if err != nil {
		return errors.New("la competición grcup no existe todavía (ejecuta antes el seed de competition)")
	}
	var desde, hasta, sorteo *time.Time
	if t, err := time.ParseInLocation("2006-01-02", c.FechaInicio, madrid); err == nil {
		fin := t
		if f, err := time.ParseInLocation("2006-01-02", c.FechaFin, madrid); err == nil && f.After(t) {
			fin = f
		}
		d := t.AddDate(0, -2, 0)
		h := fin.Add(18 * time.Hour)  // last day, 18:00
		so := fin.Add(21 * time.Hour) // last day, after the awards
		desde, hasta, sorteo = &d, &h, &so
	}
	tag, err := a.DB.Exec(ctx, `INSERT INTO config (competition_id, premio, premio_detalle, premio_imagen, premio_valor, destino, precio, max_por_persona, presets, venta_desde, venta_hasta, fecha_sorteo, activa, updated_por)
		VALUES ($1, 'Cinturón SBD 13 mm', 'Cinturón de palanca homologado IPF, talla a elegir. Datos de ejemplo.', 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp/frame_000085.webp',
		12000, 'Asociación local (por confirmar)', 100, 10, '{1,2,5,10}', $2, $3, $4, false, 'Datos de ejemplo') ON CONFLICT DO NOTHING`, c.ID, desde, hasta, sorteo)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		a.Log.Info("sorteo configurado (Datos de ejemplo, venta cerrada hasta revisar la checklist legal)")
	}
	return nil
}
