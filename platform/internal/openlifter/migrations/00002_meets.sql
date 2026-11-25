-- +goose Up
-- Setup of each OpenLifter meet of the competition («Competiciones preparadas» of the desk): OpenLifter's «meet»
-- (name, date, divisions, classes, plates…) and the registration as it was prepared (every field of each entry,
-- also the ones the sync does not carry). The desk opens it from the server instead of loading a file; the latest
-- state of each entry still lives in entradas.datos, which wins over this copy.
CREATE TABLE meets (
    competition_id uuid        NOT NULL,
    mesa           text        NOT NULL,
    meet           jsonb       NOT NULL,
    entradas       jsonb       NOT NULL DEFAULT '[]',
    por            text        NOT NULL DEFAULT '',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, mesa)
);

-- +goose Down
DROP TABLE meets;
