-- +goose Up
-- BIZ-144 Hero 2026: the backoffice toggle «Mostrar en hero» picks the logos of the hero row
-- (GET /api/competiciones/{slug}/patrocinadores?hero=true). Existing sponsors keep showing (default true).
ALTER TABLE patrocinadores ADD COLUMN mostrar_en_hero boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE patrocinadores DROP COLUMN mostrar_en_hero;
