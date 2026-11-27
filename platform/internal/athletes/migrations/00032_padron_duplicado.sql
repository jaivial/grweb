-- +goose Up
-- Coincidencia «duplicado» con el padrón AEP.
--
-- Un atleta puede no tener fila propia en el padrón y sí haber una fila con su mismo nombre, sexo y año ya enlazada a
-- OTRA ficha: entonces lo más probable es que esta ficha sea un duplicado de aquella, y el emparejamiento lo dice así
-- (`padron_estado = 'duplicado'`, `padron_origen = 'duplicado'`, con la otra ficha en el detalle) en vez de
-- «no hay nadie parecido en el padrón», que en ese caso es falso. Nada se enlaza solo: el equipo decide.
--
-- Order matters: a CHECK that does not know a value must be dropped BEFORE any row takes that value, and the new CHECK
-- goes afterwards.
ALTER TABLE solicitudes_atleta DROP CONSTRAINT IF EXISTS solicitudes_atleta_padron_estado_check;
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_decision_check;
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_origen_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_padron_estado_check
    CHECK (padron_estado IN ('', 'auto', 'parcial', 'manual', 'confirmada', 'descartada', 'duplicado'));
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_decision_check
    CHECK (decision IN ('auto', 'parcial', 'sugerido', 'manual', 'confirmada', 'descartada', 'aceptado', 'corregido', 'rechazado', 'duplicado'));
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_origen_check
    CHECK (origen IN ('', 'exacto', 'ia', 'sin_candidatos', 'error_ia', 'revision', 'staff', 'duplicado'));

-- +goose Down
-- The rollback narrows the values again: the rows that use «duplicado» go back to «sin candidato» BEFORE the old
-- CHECKs come back. The detail keeps its reason (it is only informative) and points at no other record.
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_origen_check;
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_decision_check;
ALTER TABLE solicitudes_atleta DROP CONSTRAINT IF EXISTS solicitudes_atleta_padron_estado_check;
UPDATE emparejamientos_log SET decision = 'manual', origen = 'sin_candidatos' WHERE decision = 'duplicado' OR origen = 'duplicado';
UPDATE solicitudes_atleta SET padron_estado = 'manual',
    padron_origen = CASE WHEN padron_origen = 'duplicado' THEN 'sin_candidatos' ELSE padron_origen END,
    padron_detalle = padron_detalle - 'duplicado', updated_at = now()
 WHERE padron_estado = 'duplicado' OR padron_origen = 'duplicado';
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_padron_estado_check
    CHECK (padron_estado IN ('', 'auto', 'parcial', 'manual', 'confirmada', 'descartada'));
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_decision_check
    CHECK (decision IN ('auto', 'parcial', 'sugerido', 'manual', 'confirmada', 'descartada', 'aceptado', 'corregido', 'rechazado'));
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_origen_check
    CHECK (origen IN ('', 'exacto', 'ia', 'sin_candidatos', 'error_ia', 'revision', 'staff'));
