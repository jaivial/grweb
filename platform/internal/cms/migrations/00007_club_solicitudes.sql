-- +goose Up
-- Club requests from /clubs (Figma 32 «Solicitud de club» · backoffice page 67): the contact person and a message, and the
-- review — approved (published in the directory) or rejected with a reason. Who reviewed it and when stay on the row.
ALTER TABLE clubs ADD COLUMN contacto_nombre text NOT NULL DEFAULT '';
ALTER TABLE clubs ADD COLUMN mensaje         text NOT NULL DEFAULT '';
ALTER TABLE clubs ADD COLUMN motivo_rechazo  text NOT NULL DEFAULT '';
ALTER TABLE clubs ADD COLUMN revisado_at     timestamptz;
ALTER TABLE clubs ADD COLUMN revisado_por    text NOT NULL DEFAULT '';
ALTER TABLE clubs DROP CONSTRAINT clubs_estado_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_estado_check CHECK (estado IN ('publicado', 'pendiente', 'oculto', 'rechazado'));

-- +goose Down
UPDATE clubs SET estado = 'oculto' WHERE estado = 'rechazado';
ALTER TABLE clubs DROP CONSTRAINT clubs_estado_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_estado_check CHECK (estado IN ('publicado', 'pendiente', 'oculto'));
ALTER TABLE clubs DROP COLUMN contacto_nombre, DROP COLUMN mensaje, DROP COLUMN motivo_rechazo, DROP COLUMN revisado_at, DROP COLUMN revisado_por;
