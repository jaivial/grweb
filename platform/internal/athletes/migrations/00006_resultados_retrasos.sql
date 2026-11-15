-- +goose Up
-- Results notices already sent (one per athlete and competition: corrections republished later do not email again).
CREATE TABLE avisos_resultado (
    competition_id uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    enviados       integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, atleta_id)
);

-- Live delay per flight (from the competition desk through schedule): the «sale en 30 min» notice uses the
-- estimated start.
CREATE TABLE retrasos (
    competition_id uuid        NOT NULL,
    flight         text        NOT NULL,
    retraso_min    integer     NOT NULL DEFAULT 0,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, flight)
);

-- +goose Down
DROP TABLE retrasos;
DROP TABLE avisos_resultado;
