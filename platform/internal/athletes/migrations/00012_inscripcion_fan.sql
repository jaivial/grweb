-- +goose Up
-- Fan account that started the registration: caps the payments in progress per account (U06-R2-3).
ALTER TABLE inscripciones ADD COLUMN fan_id uuid;
CREATE INDEX inscripciones_fan_pendiente ON inscripciones (fan_id) WHERE estado = 'pendiente_pago';

-- +goose Down
DROP INDEX IF EXISTS inscripciones_fan_pendiente;
ALTER TABLE inscripciones DROP COLUMN IF EXISTS fan_id;
