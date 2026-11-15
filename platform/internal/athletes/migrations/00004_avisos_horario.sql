-- +goose Up
-- Schedule notices already sent per published version (athletes and followers), so a retried publication does not
-- email anyone twice.
CREATE TABLE avisos_horario (
    competition_id uuid        NOT NULL,
    version        integer     NOT NULL,
    destinatario   uuid        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, version, destinatario)
);

-- +goose Down
DROP TABLE avisos_horario;
