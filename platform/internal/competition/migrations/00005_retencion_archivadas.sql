-- +goose Up
-- Competitions archived before the retention existed get their anonymisation date (12 months after the event).
UPDATE competiciones SET anonimizar_at = (COALESCE(fecha_fin, fecha_inicio, archived_at::date) + interval '12 months')::timestamptz
WHERE archived_at IS NOT NULL AND anonimizar_at IS NULL;

-- +goose Down
SELECT 1;
