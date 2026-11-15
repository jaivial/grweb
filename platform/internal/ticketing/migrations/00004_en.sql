-- +goose Up
-- English texts of public sessions (nombre, detalle), overlaid on ?lang=en.
ALTER TABLE sesiones ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
UPDATE sesiones SET en = jsonb_build_object('nombre', replace(replace(replace(nombre, 'Sábado', 'Saturday'), 'Domingo', 'Sunday'), 'jornada', 'competition day')) WHERE en = '{}'::jsonb AND nombre ~ '^(Sábado|Domingo) [0-9]+ · jornada$';

-- +goose Down
ALTER TABLE sesiones DROP COLUMN en;
