-- +goose Up
-- R007 (auditoría v2): los títulos y descripciones SEO del CMS aún nombraban la «GR Strength Cup» / «GRStrength Cup 2026».
-- La edición 2026 es la «GRS Cup 2». GR Strength sigue siendo el club organizador (no se toca «GR Strength» suelto).
UPDATE seo SET
  title = regexp_replace(regexp_replace(title, 'GR ?Strength Cup( 2026)?', 'GRS Cup 2', 'g'), '\mGR Cup\M( 2026)?', 'GRS Cup 2', 'g'),
  description = regexp_replace(regexp_replace(description, 'GR ?Strength Cup( 2026)?', 'GRS Cup 2', 'g'), '\mGR Cup\M( 2026)?', 'GRS Cup 2', 'g'),
  updated_at = now()
WHERE title ~ 'GR ?Strength Cup|\mGR Cup\M' OR description ~ 'GR ?Strength Cup|\mGR Cup\M';

-- +goose Down
-- Sin vuelta atrás: el nombre anterior era un error.
SELECT 1;
