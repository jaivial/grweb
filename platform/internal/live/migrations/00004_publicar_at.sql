-- +goose Up
-- Backoffice › Resultados: scheduled publication («Programado · 12 jun 10:00»); a worker publishes every category then.
ALTER TABLE estado ADD COLUMN publicar_at timestamptz;

-- +goose Down
ALTER TABLE estado DROP COLUMN publicar_at;
