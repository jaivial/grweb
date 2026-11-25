-- +goose Up
-- BIZ-211 · Emparejamiento automático de las solicitudes de atleta con el padrón AEP.
-- The weight class the athlete declares (optional): the roll has one per person and the code compares them.
ALTER TABLE solicitudes_atleta ADD COLUMN categoria text NOT NULL DEFAULT '';
-- The last decision of the matching: auto (approved and linked), sugerido (to review with the proposal) or manual.
ALTER TABLE solicitudes_atleta ADD COLUMN padron_estado text NOT NULL DEFAULT '' CHECK (padron_estado IN ('', 'auto', 'sugerido', 'manual'));
ALTER TABLE solicitudes_atleta ADD COLUMN padron_inscripcion_id uuid REFERENCES inscripciones_aep (id) ON DELETE SET NULL;
ALTER TABLE solicitudes_atleta ADD COLUMN padron_confianza real;
-- {coincide{}, discrepancias[], nivelAep[], notasIa[], motivo}
ALTER TABLE solicitudes_atleta ADD COLUMN padron_detalle jsonb NOT NULL DEFAULT '{}';

-- Every decision: what went to the model (public data of the request and the candidates, never contact data),
-- what it answered and who applied it.
CREATE TABLE emparejamientos_log (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    solicitud_id   uuid        NOT NULL,
    inscripcion_id uuid,
    decision       text        NOT NULL CHECK (decision IN ('auto', 'sugerido', 'manual', 'aceptado', 'corregido', 'rechazado')),
    origen         text        NOT NULL DEFAULT '' CHECK (origen IN ('', 'exacto', 'ia', 'sin_candidatos', 'error_ia', 'revision')),
    confianza      real,
    entrada        jsonb       NOT NULL DEFAULT '{}',
    respuesta      jsonb       NOT NULL DEFAULT '{}',
    discrepancias  jsonb       NOT NULL DEFAULT '[]',
    modelo         text        NOT NULL DEFAULT '',
    aplicado_por   text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emparejamientos_log_solicitud ON emparejamientos_log (solicitud_id, created_at DESC);

-- +goose Down
DROP TABLE emparejamientos_log;
ALTER TABLE solicitudes_atleta DROP COLUMN padron_detalle;
ALTER TABLE solicitudes_atleta DROP COLUMN padron_confianza;
ALTER TABLE solicitudes_atleta DROP COLUMN padron_inscripcion_id;
ALTER TABLE solicitudes_atleta DROP COLUMN padron_estado;
ALTER TABLE solicitudes_atleta DROP COLUMN categoria;
