-- +goose Up
-- BIZ-202: the published session of the athlete (sex and weight classes) and its AEP level, shown in the profile.
ALTER TABLE atletas ADD COLUMN sesion text NOT NULL DEFAULT '';
ALTER TABLE atletas ADD COLUMN sesion_nivel text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE atletas DROP COLUMN sesion_nivel;
ALTER TABLE atletas DROP COLUMN sesion;
