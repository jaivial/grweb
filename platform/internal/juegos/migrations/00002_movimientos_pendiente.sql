-- +goose Up
-- A refunded donation takes back its fantasy reward only up to the balance (it never goes below zero): what could not
-- be withdrawn stays noted on the ledger row of the refund (contract §5 «si no, lo deja anotado»).
ALTER TABLE movimientos ADD COLUMN pendiente bigint NOT NULL DEFAULT 0 CHECK (pendiente >= 0);

-- +goose Down
ALTER TABLE movimientos DROP COLUMN pendiente;
