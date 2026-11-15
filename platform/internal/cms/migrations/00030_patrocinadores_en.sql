-- +goose Up
-- English overrides of the sponsors (descripcion, alt), like the other CMS tables (00028), plus the current texts.
ALTER TABLE patrocinadores ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
UPDATE patrocinadores SET en = jsonb_build_object('descripcion', 'Spanish Powerlifting Association: endorses the competition and provides the referees.')
WHERE descripcion = 'Asociación Española de Powerlifting: avala la competición y aporta los jueces.';

-- +goose Down
ALTER TABLE patrocinadores DROP COLUMN en;
