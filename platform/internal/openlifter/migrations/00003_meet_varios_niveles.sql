-- +goose Up
-- One OpenLifter meet can span several competition levels, one per day (GR STRENGTH CUP II: day 1 AEP 2, day 2
-- AEP 3). niveles maps the OpenLifter day to its level ({"1": "aep2", "2": "aep3"}): the schedule, the AEP roll and
-- the matching of each entry follow the level of the entry's day. The predetermined meet is the one the desk opens
-- by itself after signing in (one per competition at most).
ALTER TABLE meets ADD COLUMN niveles jsonb NOT NULL DEFAULT '{}';
ALTER TABLE meets ADD COLUMN predeterminada boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX meets_predeterminada ON meets (competition_id) WHERE predeterminada;

-- Desk keys merged into another meet: a browser that still holds the old meet must not recreate it (its sync is
-- refused and the desk opens the meet it was merged into).
CREATE TABLE mesas_fusionadas (
    competition_id uuid        NOT NULL,
    mesa           text        NOT NULL,
    destino        text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, mesa)
);

-- +goose Down
DROP TABLE mesas_fusionadas;
DROP INDEX meets_predeterminada;
ALTER TABLE meets DROP COLUMN predeterminada;
ALTER TABLE meets DROP COLUMN niveles;
