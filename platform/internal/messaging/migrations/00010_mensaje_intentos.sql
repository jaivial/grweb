-- +goose Up
-- The log of every try of an outbox message (Sistema › Cola de envío): the reason for the person and the technical
-- detail of the provider (without phone numbers), so a failure can be explained after the fact.
CREATE TABLE mensaje_intentos (
    id         bigserial PRIMARY KEY,
    mensaje_id uuid        NOT NULL REFERENCES mensajes (id) ON DELETE CASCADE,
    at         timestamptz NOT NULL DEFAULT now(),
    intento    integer     NOT NULL,
    estado     text        NOT NULL,
    detalle    text        NOT NULL DEFAULT '',
    tecnico    text        NOT NULL DEFAULT ''
);
CREATE INDEX mensaje_intentos_mensaje ON mensaje_intentos (mensaje_id, at DESC);
CREATE INDEX mensajes_cola_canal ON mensajes (competition_id, canal, proximo_at) WHERE estado IN ('en_cola', 'reintentando', 'enviando');

-- +goose Down
DROP INDEX mensajes_cola_canal;
DROP TABLE mensaje_intentos;
