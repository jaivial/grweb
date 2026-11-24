-- +goose Up
-- BIZ-190: the ES hero title is the English motto «WHATEVER IT TAKES» (draft and published) when it still has the old
-- seed text or is empty; any other organiser-edited title is kept.
UPDATE secciones SET publicado = jsonb_set(publicado, '{titulo}', '"WHATEVER IT TAKES"')
WHERE pagina = 'home' AND clave = 'hero' AND publicado IS NOT NULL
  AND coalesce(btrim(publicado->>'titulo'), '') IN ('', 'Los ganadores nunca se rinden');
UPDATE secciones SET borrador = jsonb_set(coalesce(borrador, '{}'::jsonb), '{titulo}', '"WHATEVER IT TAKES"')
WHERE pagina = 'home' AND clave = 'hero'
  AND coalesce(btrim(borrador->>'titulo'), '') IN ('', 'Los ganadores nunca se rinden');

-- +goose Down
SELECT 1;
