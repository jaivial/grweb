-- +goose Up
-- «Te escribiremos 30 minutos antes»: one notice per athlete and start time (a new time after a schedule change
-- notifies again).
CREATE TABLE avisos_salida (
    atleta_id   uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    hora_inicio timestamptz NOT NULL,
    enviados    integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (atleta_id, hora_inicio)
);

-- +goose Down
DROP TABLE avisos_salida;
