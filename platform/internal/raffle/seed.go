package raffle

import (
	"context"
	"errors"
	"time"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

// seedGRCup («Datos de ejemplo»): the in-person raffle of 2026 as in Figma 60 (cash ticket info and four objects).
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	c, err := s.comps.Public(ctx, "grcup")
	if err != nil {
		return errors.New("la competición grcup no existe todavía (ejecuta antes el seed de competition)")
	}
	var rifa *time.Time
	if t, err := time.ParseInLocation("2006-01-02", c.FechaInicio, madrid); err == nil {
		fin := t
		if f, err := time.ParseInLocation("2006-01-02", c.FechaFin, madrid); err == nil && f.After(t) {
			fin = f
		}
		rf := fin.Add(19 * time.Hour) // rifa: last day in the afternoon
		rifa = &rf
	}
	// Rifa presencial (Figma 07 «Rifa · escaparate»): cash ticket info and the example objects, only when there are none.
	if _, err := a.DB.Exec(ctx, `INSERT INTO rifa_config (competition_id, precio_boleto_efectivo_cents, texto_info, lugar, horario, fecha_sorteo, updated_por)
		VALUES ($1, 200, 'Los boletos se compran solo en efectivo en el stand de la rifa, en el recinto, durante el evento. No hay venta online.',
		'Stand de la rifa · vestíbulo del pabellón', 'Sáb 19 y dom 20 dic · 9:00–20:30', $2, 'Datos de ejemplo')
		ON CONFLICT (competition_id) DO UPDATE SET lugar = EXCLUDED.lugar, horario = EXCLUDED.horario, texto_info = EXCLUDED.texto_info, fecha_sorteo = EXCLUDED.fecha_sorteo
		WHERE rifa_config.lugar = '' OR rifa_config.updated_por IN ('Migración 00002', 'Datos de ejemplo')`, c.ID, rifa); err != nil {
		return err
	}
	belt := "https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp/frame_000085.webp"
	_, err = a.DB.Exec(ctx, `INSERT INTO rifa_items (id, competition_id, nombre, descripcion, imagen_url, valor_estimado_cents, donante, unidades, orden)
		SELECT v.id, $1, v.nombre, v.descripcion, v.imagen, v.valor, v.donante, v.unidades, v.orden FROM (VALUES
		($2::uuid, 'Cinturón SBD 13 mm', 'Cinturón de palanca homologado IPF, talla a elegir.', $6::text, 12000, 'SBD España', 1, 1),
		($3::uuid, 'Lote de suplementos', 'Proteína, creatina y shaker. Sin foto todavía: se muestra este marcador.', NULL, 6000, 'Nutri Sport', 3, 2),
		($4::uuid, 'Camiseta GR Cup 2026 firmada', 'Firmada por los ganadores del absoluto. Tallas S–XL.', NULL, NULL, 'GRStrength', 5, 3),
		($5::uuid, 'Bono 3 sesiones de fisioterapia', 'Para usar en 2027 en la clínica donante.', NULL, 15000, 'Clínica Fisiomove', 2, 4)
		) AS v(id, nombre, descripcion, imagen, valor, donante, unidades, orden)
		WHERE NOT EXISTS (SELECT 1 FROM rifa_items WHERE competition_id = $1)`, c.ID, newID(), newID(), newID(), newID(), belt)
	if err != nil {
		return err
	}
	// QA U13-R1-7: earlier seeds put the belt photo on the T-shirt and the physio voucher (placeholder instead).
	_, err = a.DB.Exec(ctx, `UPDATE rifa_items SET imagen_url = NULL, updated_at = now() WHERE competition_id = $1 AND imagen_url = $2
		AND nombre IN ('Camiseta GR Cup 2026 firmada', 'Bono 3 sesiones de fisioterapia')`, c.ID, belt)
	return err
}
