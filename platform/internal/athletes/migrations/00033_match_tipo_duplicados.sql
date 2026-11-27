-- +goose Up
-- Coincidencia por teléfono y por nombre y fecha de nacimiento.
--
-- La 00032 amplió `padron_estado` y `emparejamientos_log.decision`/`.origen` con «duplicado», pero el enlace del alta
-- escribe además dos valores nuevos en `solicitudes_atleta.match_tipo` (`telefono` y `nacimiento`, @see
-- internal/athletes/atleta_duplicado.go), y su CHECK seguía siendo el de la 00009: cualquier alta cuyo teléfono
-- coincidiera con una ficha existente fallaba al insertarse (500) y cualquier aprobación que enlazara por teléfono o
-- por nombre y fecha de nacimiento fallaba en el UPDATE final.
--
-- Auditadas las demás columnas que escribe este código: `padron_estado`, `emparejamientos_log.decision` y `.origen`
-- ya conocen «duplicado» desde la 00032; `padron_origen` no tiene CHECK; y `inscripciones_aep.estado_enlace` solo
-- recibe `pendiente · auto · sugerido · manual · rechazado`, que ya estaban en el CHECK de la 00020. No queda ninguna
-- restricción que estreche un valor escrito por el código.
--
-- Order matters: a CHECK that does not know a value must be dropped BEFORE any row takes that value.
ALTER TABLE solicitudes_atleta DROP CONSTRAINT IF EXISTS solicitudes_atleta_match_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_match_tipo_check
    CHECK (match_tipo IN ('', 'licencia', 'email', 'telefono', 'nacimiento', 'nombre', 'manual'));

-- +goose Down
-- The rollback narrows the values again: the rows that use a rule the old model did not have go back to «manual»
-- (an athlete linked by a person) BEFORE the old CHECK comes back.
ALTER TABLE solicitudes_atleta DROP CONSTRAINT IF EXISTS solicitudes_atleta_match_tipo_check;
UPDATE solicitudes_atleta SET match_tipo = 'manual' WHERE match_tipo IN ('telefono', 'nacimiento');
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_match_tipo_check
    CHECK (match_tipo IN ('', 'licencia', 'email', 'nombre', 'manual'));
