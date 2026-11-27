-- +goose Up
-- Outbound pace (ritmo.go): one turn per sender (a WhatsApp number, an SMTP account) shared by the outbox, the
-- campaigns and the test sends, so the pace survives restarts and holds with several pods.
CREATE TABLE envio_turnos (
    remitente           text PRIMARY KEY,
    siguiente_at        timestamptz NOT NULL DEFAULT now(),
    calentamiento_desde timestamptz NOT NULL DEFAULT now()
);

-- One row per message given a turn (the hourly and daily caps); older than 2 days is deleted.
CREATE TABLE envio_registro (
    remitente text        NOT NULL,
    at        timestamptz NOT NULL DEFAULT now(),
    nuevo     boolean     NOT NULL DEFAULT false
);
CREATE INDEX envio_registro_remitente ON envio_registro (remitente, at);

-- WhatsApp numbers that already talked with the sender (we wrote to them or they wrote to us), as a keyed hash.
CREATE TABLE envio_contactos (
    remitente  text        NOT NULL,
    huella     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (remitente, huella)
);

-- +goose Down
DROP TABLE envio_contactos;
DROP TABLE envio_registro;
DROP TABLE envio_turnos;
