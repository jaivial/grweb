-- +goose Up
-- «Editar mi perfil» del área de atleta: el atleta propone cambios y el equipo los revisa antes de escribir nada.
-- Se reutiliza la tabla de solicitudes con un tipo nuevo: «cambio_perfil» guarda solo los campos que cambian
-- (antes / después) y el alta sigue siendo «alta». Nada cambia en «atletas» ni «perfiles» hasta aprobarla.
ALTER TABLE solicitudes_atleta ADD COLUMN tipo text NOT NULL DEFAULT 'alta' CHECK (tipo IN ('alta', 'cambio_perfil'));
ALTER TABLE solicitudes_atleta ADD COLUMN cambios jsonb NOT NULL DEFAULT '{}';
-- Un solo cambio de perfil abierto por atleta: al enviar otro se sustituye el pendiente.
CREATE UNIQUE INDEX solicitudes_atleta_cambio_vivo ON solicitudes_atleta (competition_id, match_atleta_id)
    WHERE tipo = 'cambio_perfil' AND estado IN ('pendiente', 'revision');
-- El panel filtra por tipo (badge y filtro «Cambio de perfil»).
CREATE INDEX solicitudes_atleta_tipo ON solicitudes_atleta (competition_id, tipo, estado, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS solicitudes_atleta_tipo;
DROP INDEX IF EXISTS solicitudes_atleta_cambio_vivo;
ALTER TABLE solicitudes_atleta DROP COLUMN IF EXISTS cambios;
ALTER TABLE solicitudes_atleta DROP COLUMN IF EXISTS tipo;
