-- +goose NO TRANSACTION
-- +goose Up
-- ST2-R1-1: the ranking order (saldo DESC, updated_at ASC) is an index range: the top 50 and the fan's place
-- (count of wallets ahead) are index-only scans instead of rank() sorting every wallet of the jornada.
CREATE INDEX CONCURRENTLY IF NOT EXISTS saldos_orden ON saldos (jornada_id, moneda, saldo DESC, updated_at ASC) INCLUDE (fan_id, alias);
-- the alias fallback of the top (wallets opened before the alias was stored) looked it up with a seq scan per row
CREATE INDEX CONCURRENTLY IF NOT EXISTS saldos_fan_alias ON saldos (fan_id, updated_at DESC) INCLUDE (alias) WHERE alias <> '';
DROP INDEX CONCURRENTLY IF EXISTS saldos_rank;

-- +goose Down
CREATE INDEX CONCURRENTLY IF NOT EXISTS saldos_rank ON saldos (jornada_id, moneda, saldo DESC);
DROP INDEX CONCURRENTLY IF EXISTS saldos_fan_alias;
DROP INDEX CONCURRENTLY IF EXISTS saldos_orden;
