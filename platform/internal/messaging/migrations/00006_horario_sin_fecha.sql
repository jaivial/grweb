-- +goose Up
-- No flights (15-nov): «horario-sin-flight» becomes «horario-sin-fecha»; customised schedule templates lose the
-- {{flight}} / {{plataforma}} variables (the service no longer sends them).
UPDATE plantillas SET clave = 'horario-sin-fecha' WHERE clave = 'horario-sin-flight';
UPDATE plantilla_estado SET clave = 'horario-sin-fecha' WHERE clave = 'horario-sin-flight';
UPDATE plantillas SET
    asunto = regexp_replace(asunto, '\s*(Flight\s*)?\{\{\s*(flight|plataforma)\s*\}\}', '', 'gi'),
    titulo = regexp_replace(titulo, '\s*(Flight\s*)?\{\{\s*(flight|plataforma)\s*\}\}', '', 'gi'),
    cuerpo = regexp_replace(cuerpo, '\s*(\*\*)?(el\s+)?(Flight\s*)?\{\{\s*(flight|plataforma)\s*\}\}(\*\*)?', '', 'gi')
WHERE clave IN ('horario-publicado', 'horario-cambio', 'horario-seguidor', 'atleta-sale-30min');

-- +goose Down
UPDATE plantillas SET clave = 'horario-sin-flight' WHERE clave = 'horario-sin-fecha';
UPDATE plantilla_estado SET clave = 'horario-sin-flight' WHERE clave = 'horario-sin-fecha';
