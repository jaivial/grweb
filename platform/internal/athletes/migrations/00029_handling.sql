-- +goose Up
-- «Handling gratis»: el atleta pide que el equipo de GR Strength le asigne un handler. Se reutiliza la tabla de
-- solicitudes con un tipo nuevo: «handling», enlazado al atleta (match_atleta_id) y revisado como las demás.
ALTER TABLE solicitudes_atleta DROP CONSTRAINT solicitudes_atleta_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_tipo_check CHECK (tipo IN ('alta', 'cambio_perfil', 'autorizacion', 'handling'));
-- La casilla «¿Necesitas handler?» del alta: al aprobar el alta se crea la solicitud de handling del atleta.
ALTER TABLE solicitudes_atleta ADD COLUMN handler boolean NOT NULL DEFAULT false;
-- Una sola solicitud de handling viva por atleta (tras un rechazo puede volver a pedirla).
CREATE UNIQUE INDEX solicitudes_atleta_handling_viva ON solicitudes_atleta (competition_id, match_atleta_id)
    WHERE tipo = 'handling' AND estado IN ('pendiente', 'revision');

-- +goose Down
DROP INDEX IF EXISTS solicitudes_atleta_handling_viva;
ALTER TABLE solicitudes_atleta DROP COLUMN IF EXISTS handler;
DELETE FROM solicitudes_atleta WHERE tipo = 'handling';
ALTER TABLE solicitudes_atleta DROP CONSTRAINT solicitudes_atleta_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_tipo_check CHECK (tipo IN ('alta', 'cambio_perfil', 'autorizacion'));
