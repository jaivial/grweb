-- +goose Up
-- Teléfono opcional de las cuentas del directo (Jaime 15-nov): si lo dan, los avisos al público llegan también por
-- WhatsApp. Solo dígitos con prefijo (34600123456); '' = sin teléfono.
ALTER TABLE fans ADD COLUMN IF NOT EXISTS telefono text NOT NULL DEFAULT '';
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS telefono text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE accesos DROP COLUMN IF EXISTS telefono;
ALTER TABLE fans DROP COLUMN IF EXISTS telefono;
