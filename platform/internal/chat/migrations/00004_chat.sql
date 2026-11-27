-- +goose Up
-- Historial de todas las jornadas (?todos=1): el cursor recorre la tabla por instante de publicación dentro de una
-- competición, sin pasar por el índice de la jornada.
CREATE INDEX mensajes_competicion ON mensajes (competition_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS mensajes_competicion;
