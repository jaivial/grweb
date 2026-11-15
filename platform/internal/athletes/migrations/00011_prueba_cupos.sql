-- +goose Up
-- The competition the athlete chose in the alta is kept on the athlete once the request is approved.
ALTER TABLE atletas ADD COLUMN prueba text NOT NULL DEFAULT '' CHECK (prueba IN ('', 'aep2', 'aep3'));
-- Own places of each competition (set in the backoffice). Without a row: total places / number of competitions.
CREATE TABLE alta_cupos (
    competition_id uuid    NOT NULL,
    prueba         text    NOT NULL CHECK (prueba IN ('aep2', 'aep3')),
    plazas         integer NOT NULL CHECK (plazas >= 0),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, prueba)
);

-- +goose Down
DROP TABLE alta_cupos;
ALTER TABLE atletas DROP COLUMN prueba;
