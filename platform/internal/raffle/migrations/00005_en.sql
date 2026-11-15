-- +goose Up
-- English texts of the raffle (config: textoInfo, lugar, horario; items: nombre, descripcion), overlaid on ?lang=en.
-- No raffle data in QA yet, so nothing to fill.
ALTER TABLE rifa_config ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE rifa_items ADD COLUMN en jsonb NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE rifa_items DROP COLUMN en;
ALTER TABLE rifa_config DROP COLUMN en;
