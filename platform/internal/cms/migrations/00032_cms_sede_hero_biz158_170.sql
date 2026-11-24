-- +goose Up
-- BIZ-158: EN hero title matches ES («WHATEVER IT TAKES»).
-- BIZ-170: unify the venue name to «Pabellón Municipal de Almussafes» in ES and EN (drops the Valencian variants).
UPDATE secciones SET
  en_publicado = jsonb_set(en_publicado, '{titulo}', '"WHATEVER IT TAKES"'),
  en_borrador = jsonb_set(en_borrador, '{titulo}', '"WHATEVER IT TAKES"')
WHERE pagina = 'home' AND clave = 'hero' AND en_publicado ? 'titulo' AND en_borrador ? 'titulo';

UPDATE secciones SET
  en_publicado = replace(en_publicado::text, 'Pavelló Municipal d''Almussafes', 'Pabellón Municipal de Almussafes')::jsonb,
  en_borrador = replace(en_borrador::text, 'Pavelló Municipal d''Almussafes', 'Pabellón Municipal de Almussafes')::jsonb
WHERE en_publicado::text LIKE '%Pavelló%' OR en_borrador::text LIKE '%Pavelló%';

UPDATE faq SET
  respuesta = replace(replace(respuesta, ' (Pavelló Poliesportiu, ', ' ('), 'Pavelló Municipal d''Almussafes', 'Pabellón Municipal de Almussafes'),
  en = replace(replace(en::text, ' (Pavelló Poliesportiu, ', ' ('), 'Pavelló Municipal d''Almussafes', 'Pabellón Municipal de Almussafes')::jsonb
WHERE respuesta LIKE '%Pavelló%' OR en::text LIKE '%Pavelló%';

-- +goose Down
SELECT 1;
