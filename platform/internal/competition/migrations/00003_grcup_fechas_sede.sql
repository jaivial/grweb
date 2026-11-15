-- +goose Up
-- BIZ-144 (QA U04-R1-7): the 2026 edition runs 19 and 20 December at the Pavelló Municipal d'Almussafes (Figma hero).
-- Only touches the example data still untouched by the organisation (end date equal to the start, old venue name).
UPDATE competiciones SET fecha_fin = DATE '2026-12-20'
WHERE slug = 'grcup' AND fecha_inicio = DATE '2026-12-19' AND fecha_fin = DATE '2026-12-19';
UPDATE competiciones SET sede = jsonb_set(sede, '{nombre}', to_jsonb('Pavelló Municipal d''Almussafes'::text))
WHERE slug = 'grcup' AND sede->>'nombre' = 'Pavelló Poliesportiu d''Almussafes';

-- +goose Down
SELECT 1;
