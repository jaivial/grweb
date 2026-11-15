-- +goose Up
-- One line under each sponsor's name on /patrocinadores (Figma 31), e.g. «avala la competición y aporta los jueces».
ALTER TABLE patrocinadores ADD COLUMN descripcion text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE patrocinadores DROP COLUMN descripcion;
