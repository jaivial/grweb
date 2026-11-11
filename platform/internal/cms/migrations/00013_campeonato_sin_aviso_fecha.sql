-- +goose Up
-- QA U04-R1-7: the example notice «Fecha por confirmar» contradicted the date and countdown of «Campeonato».
UPDATE secciones SET borrador = jsonb_set(borrador, '{aviso}', '""'), publicado = jsonb_set(publicado, '{aviso}', '""')
WHERE clave = 'campeonato' AND publicado->>'aviso' ILIKE 'fecha por confirmar' AND borrador->>'aviso' ILIKE 'fecha por confirmar';

-- +goose Down
SELECT 1;
