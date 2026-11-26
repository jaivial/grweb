-- +goose Up
-- GRS Cup 3 · contactos avisados: la tabla de «Avísame» (BIZ-165) pasa a gestionarse desde el backoffice.
-- Cada aviso tiene identidad propia (id) para poder editarlo o borrarlo sin tocar los demás, un nombre opcional y
-- la fecha de su última edición. El email sigue siendo único por competición y evento (la PK que ya existía).
ALTER TABLE avisos_evento ADD COLUMN IF NOT EXISTS id         uuid        NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE avisos_evento ADD COLUMN IF NOT EXISTS nombre     text        NOT NULL DEFAULT '';
ALTER TABLE avisos_evento ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS avisos_evento_id ON avisos_evento (id);
CREATE INDEX IF NOT EXISTS avisos_evento_lista ON avisos_evento (competicion_id, evento, creado_at DESC);

-- +goose Down
DROP INDEX IF EXISTS avisos_evento_lista;
DROP INDEX IF EXISTS avisos_evento_id;
ALTER TABLE avisos_evento DROP COLUMN IF EXISTS updated_at;
ALTER TABLE avisos_evento DROP COLUMN IF EXISTS nombre;
ALTER TABLE avisos_evento DROP COLUMN IF EXISTS id;
