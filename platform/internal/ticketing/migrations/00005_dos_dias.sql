-- +goose Up
-- BIZ-163: one ticket (one QR) valid for two sessions (sábado + domingo). It counts for the capacity of both;
-- dentro2 is how many of the group have entered on the second session.
ALTER TABLE entradas ADD COLUMN sesion2_id uuid REFERENCES sesiones (id),
    ADD COLUMN dentro2 integer NOT NULL DEFAULT 0 CHECK (dentro2 >= 0),
    ADD CONSTRAINT entradas_sesion2_distinta CHECK (sesion2_id IS NULL OR sesion2_id <> sesion_id);
CREATE INDEX entradas_sesion2_idx ON entradas (sesion2_id) WHERE sesion2_id IS NOT NULL;

-- +goose Down
DROP INDEX entradas_sesion2_idx;
ALTER TABLE entradas DROP CONSTRAINT entradas_sesion2_distinta, DROP COLUMN dentro2, DROP COLUMN sesion2_id;
