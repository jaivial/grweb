-- +goose Up
-- Auditoría R018 (Jaime 14-nov): los textos de transporte ya no llevan la marca «Datos de ejemplo».
UPDATE competiciones SET como_llegar = replace(como_llegar::text, ' Datos de ejemplo.', '')::jsonb
WHERE como_llegar::text LIKE '%Datos de ejemplo.%';

-- +goose Down
SELECT 1;
