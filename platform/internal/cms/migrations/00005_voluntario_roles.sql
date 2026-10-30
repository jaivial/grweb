-- +goose Up
-- /voluntarios (Figma 33): the roles the person picks (judges, loaders, scoring table, photo, accreditation) and a
-- free text about their experience.
ALTER TABLE voluntarios ADD COLUMN roles text[] NOT NULL DEFAULT '{}';
ALTER TABLE voluntarios ADD COLUMN experiencia text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE voluntarios DROP COLUMN experiencia;
ALTER TABLE voluntarios DROP COLUMN roles;
