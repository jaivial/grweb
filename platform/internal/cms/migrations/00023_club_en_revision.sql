-- +goose Up
-- Figma 67 «Clubs · solicitudes»: a pending request is «Nueva» until someone of the team opens it, then «En revisión».
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS abierta_at  timestamptz;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS abierta_por text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE clubs DROP COLUMN IF EXISTS abierta_at, DROP COLUMN IF EXISTS abierta_por;
