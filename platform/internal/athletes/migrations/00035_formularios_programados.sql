-- +goose Up
-- Envíos programados de un formulario: el backoffice elige fecha y hora, y a esa hora el programador crea el envío
-- normal (creaEnvio), que deja cada invitación en la cola de messaging con su ritmo anti-spam.
CREATE TABLE formulario_programados (
    id             uuid        PRIMARY KEY,
    formulario_id  uuid        NOT NULL REFERENCES formularios (id) ON DELETE CASCADE,
    competition_id uuid        NOT NULL,
    canales        text[]      NOT NULL CHECK (canales <@ ARRAY['email', 'whatsapp']::text[] AND cardinality(canales) > 0),
    filtro         jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filtro) = 'object'),
    programado_at  timestamptz NOT NULL,
    -- pendiente → enviando → enviado | fallido; cancelado desde el backoffice mientras está pendiente.
    estado         text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'fallido', 'cancelado')),
    envio_id       uuid        NULL REFERENCES formulario_envios (id) ON DELETE SET NULL,
    error          text        NOT NULL DEFAULT '',
    creado_por     text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX formulario_programados_formulario ON formulario_programados (formulario_id, programado_at);
CREATE INDEX formulario_programados_pendientes ON formulario_programados (programado_at) WHERE estado IN ('pendiente', 'enviando');

-- +goose Down
DROP TABLE IF EXISTS formulario_programados;
