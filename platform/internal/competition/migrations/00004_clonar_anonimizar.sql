-- +goose Up
-- Sistema e integraciones (Figma 64): the edition a competition was cloned from and the retention of personal data
-- (anonymised 12 months after the event, or earlier by Root).
ALTER TABLE competiciones ADD COLUMN clonada_de uuid;
ALTER TABLE competiciones ADD COLUMN anonimizar_at timestamptz;
ALTER TABLE competiciones ADD COLUMN anonimizada_at timestamptz;
CREATE INDEX competiciones_anonimizar ON competiciones (anonimizar_at) WHERE anonimizada_at IS NULL;

-- +goose Down
DROP INDEX competiciones_anonimizar;
ALTER TABLE competiciones DROP COLUMN anonimizada_at, DROP COLUMN anonimizar_at, DROP COLUMN clonada_de;
