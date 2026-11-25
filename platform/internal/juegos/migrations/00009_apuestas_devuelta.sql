-- +goose Up
-- BIZ-200: the bets given back when their athlete left the market (options sync or annulment) keep the row with
-- `devuelta_at` set: they stop counting in the pot, the odds and the settlement, and they show up as returned in
-- «mis apuestas». The refund itself is idempotent by the UNIQUE ref `premio:<apuesta>` of the wallet movements.
ALTER TABLE apuestas ADD COLUMN devuelta_at timestamptz;

-- +goose Down
ALTER TABLE apuestas DROP COLUMN devuelta_at;
