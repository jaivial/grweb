-- +goose Up
-- BIZ-170: one venue name everywhere ("Pabellón Municipal de Almussafes"); the seed used the Valencian form.
UPDATE competiciones SET sede = jsonb_set(sede, '{nombre}', '"Pabellón Municipal de Almussafes"')
WHERE slug = 'grcup' AND sede->>'nombre' = 'Pavelló Municipal d''Almussafes';

-- +goose Down
UPDATE competiciones SET sede = jsonb_set(sede, '{nombre}', '"Pavelló Municipal d''Almussafes"')
WHERE slug = 'grcup' AND sede->>'nombre' = 'Pabellón Municipal de Almussafes';
