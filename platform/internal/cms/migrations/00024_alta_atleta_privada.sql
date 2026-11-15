-- +goose Up
-- QA U47-R2-1: an approved profile stays private until the athlete publishes it (only where the old text is still in place).
UPDATE secciones SET borrador = jsonb_set(borrador, '{texto}', to_jsonb(replace(borrador->>'texto', 'Lo revisamos a mano y lo publicamos en la lista de atletas.', 'Lo revisamos a mano y queda privado hasta que actives su publicación desde el área de atleta.')))
WHERE clave = 'alta-atleta' AND borrador->>'texto' LIKE '%Lo revisamos a mano y lo publicamos en la lista de atletas.%';
UPDATE secciones SET publicado = jsonb_set(publicado, '{texto}', to_jsonb(replace(publicado->>'texto', 'Lo revisamos a mano y lo publicamos en la lista de atletas.', 'Lo revisamos a mano y queda privado hasta que actives su publicación desde el área de atleta.')))
WHERE clave = 'alta-atleta' AND publicado->>'texto' LIKE '%Lo revisamos a mano y lo publicamos en la lista de atletas.%';

-- +goose Down
SELECT 1;
