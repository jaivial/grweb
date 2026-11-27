-- +goose Up
-- BIZ-211 · Coincidencia parcial con el padrón AEP y decisión del equipo.
--
-- The matching never throws a candidate away any more: a slow model, a failing one or a low confidence leaves the row
-- proposed as «parcial» for the team. The team answers «confirmada» (linked, exactly as an automatic match) or
-- «descartada», and padron_origen says where the last decision came from (exacto · ia · error_ia · sin_candidatos ·
-- staff), so the record and the list can say «error de la IA» and not only «sin coincidencia».
ALTER TABLE solicitudes_atleta ADD COLUMN padron_origen text NOT NULL DEFAULT '';
UPDATE solicitudes_atleta SET padron_origen = 'ia', padron_estado = 'parcial' WHERE padron_estado = 'sugerido';
ALTER TABLE solicitudes_atleta DROP CONSTRAINT IF EXISTS solicitudes_atleta_padron_estado_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_padron_estado_check
    CHECK (padron_estado IN ('', 'auto', 'parcial', 'manual', 'confirmada', 'descartada'));

-- The log also records what the team does on an athlete that comes from no request (added by hand): a row of the log
-- belongs to a request, to an athlete or to both.
ALTER TABLE emparejamientos_log ALTER COLUMN solicitud_id DROP NOT NULL;
ALTER TABLE emparejamientos_log ADD COLUMN atleta_id uuid;
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_decision_check;
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_decision_check
    CHECK (decision IN ('auto', 'parcial', 'sugerido', 'manual', 'confirmada', 'descartada', 'aceptado', 'corregido', 'rechazado'));
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_origen_check;
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_origen_check
    CHECK (origen IN ('', 'exacto', 'ia', 'sin_candidatos', 'error_ia', 'revision', 'staff'));
CREATE INDEX emparejamientos_log_atleta ON emparejamientos_log (atleta_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS emparejamientos_log_atleta;
DELETE FROM emparejamientos_log WHERE solicitud_id IS NULL;
ALTER TABLE emparejamientos_log ALTER COLUMN solicitud_id SET NOT NULL;
ALTER TABLE emparejamientos_log DROP COLUMN atleta_id;
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_origen_check;
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_origen_check
    CHECK (origen IN ('', 'exacto', 'ia', 'sin_candidatos', 'error_ia', 'revision'));
ALTER TABLE emparejamientos_log DROP CONSTRAINT IF EXISTS emparejamientos_log_decision_check;
ALTER TABLE emparejamientos_log ADD CONSTRAINT emparejamientos_log_decision_check
    CHECK (decision IN ('auto', 'sugerido', 'manual', 'aceptado', 'corregido', 'rechazado'));
UPDATE solicitudes_atleta SET padron_estado = CASE WHEN padron_estado IN ('parcial', 'confirmada') THEN 'sugerido' ELSE 'manual' END
    WHERE padron_estado IN ('parcial', 'confirmada', 'descartada');
ALTER TABLE solicitudes_atleta DROP CONSTRAINT IF EXISTS solicitudes_atleta_padron_estado_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_padron_estado_check
    CHECK (padron_estado IN ('', 'auto', 'sugerido', 'manual'));
ALTER TABLE solicitudes_atleta DROP COLUMN padron_origen;
