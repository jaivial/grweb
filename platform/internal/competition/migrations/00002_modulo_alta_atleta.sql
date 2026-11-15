-- +goose Up
-- Módulo «alta-atleta»: formulario público de alta de atleta (solicitud con revisión humana, «/alta-atleta»).
-- Las competiciones nuevas lo traen activo por defecto (defaultModulos); las que ya existían lo activan aquí,
-- para que el formulario público esté disponible desde el mismo despliegue.
UPDATE competiciones
SET modulos = modulos || jsonb_build_object('alta-atleta', jsonb_build_object('activo', true, 'bloqueado', false)),
    updated_at = now()
WHERE NOT (modulos ? 'alta-atleta');

-- +goose Down
UPDATE competiciones SET modulos = modulos - 'alta-atleta' WHERE modulos ? 'alta-atleta';
