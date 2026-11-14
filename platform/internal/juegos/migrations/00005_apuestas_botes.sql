-- +goose NO TRANSACTION
-- +goose Up
-- ST1-R1-4: the pots (GET /porra/mercados and the odds of every bet) are index-only scans, not heap scans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS apuestas_botes_jornada ON apuestas (jornada_id, mercado_id, atleta_id) INCLUDE (importe);
CREATE INDEX CONCURRENTLY IF NOT EXISTS apuestas_botes_mercado ON apuestas (mercado_id, atleta_id) INCLUDE (importe);
DROP INDEX CONCURRENTLY IF EXISTS apuestas_mercado;

-- +goose Down
CREATE INDEX CONCURRENTLY IF NOT EXISTS apuestas_mercado ON apuestas (mercado_id);
DROP INDEX CONCURRENTLY IF EXISTS apuestas_botes_mercado;
DROP INDEX CONCURRENTLY IF EXISTS apuestas_botes_jornada;
