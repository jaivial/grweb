-- +goose Up
-- Failed referral refunds are retried with backoff (up to 5 attempts) by the expiry worker.
ALTER TABLE referido_usos ADD COLUMN intentos integer NOT NULL DEFAULT 0, ADD COLUMN siguiente_at timestamptz;

-- +goose Down
ALTER TABLE referido_usos DROP COLUMN intentos, DROP COLUMN siguiente_at;
