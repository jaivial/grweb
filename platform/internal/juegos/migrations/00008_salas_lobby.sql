-- +goose NO TRANSACTION
-- +goose Up
-- ST3-R2-1: the lobby lists the newest live public rooms of a jornada; this partial index is that order, so the
-- LIMIT 200 stops early instead of sorting every room of the jornada.
CREATE INDEX CONCURRENTLY IF NOT EXISTS salas_lobby ON salas (jornada_id, created_at DESC) WHERE publica AND estado IN ('abierta', 'en_juego');

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS salas_lobby;
