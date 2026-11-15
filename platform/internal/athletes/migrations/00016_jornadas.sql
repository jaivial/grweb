-- +goose Up
-- No flights (15-nov): the published schedule gives each athlete a date (jornada) and a lot inside it.
ALTER TABLE atletas ADD COLUMN jornada date;
ALTER TABLE atletas ADD COLUMN lote integer;
UPDATE atletas SET jornada = (hora_inicio AT TIME ZONE 'Europe/Madrid')::date WHERE flight <> '' AND hora_inicio IS NOT NULL;
ALTER TABLE atletas DROP COLUMN flight;
ALTER TABLE atletas DROP COLUMN plataforma;

-- Live delay per date (from the OpenLifter desk through schedule).
DROP TABLE retrasos;
CREATE TABLE retrasos (
    competition_id uuid        NOT NULL,
    dia            date        NOT NULL,
    retraso_min    integer     NOT NULL DEFAULT 0,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, dia)
);

-- +goose Down
DROP TABLE retrasos;
CREATE TABLE retrasos (
    competition_id uuid        NOT NULL,
    flight         text        NOT NULL,
    retraso_min    integer     NOT NULL DEFAULT 0,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, flight)
);
ALTER TABLE atletas ADD COLUMN plataforma integer;
ALTER TABLE atletas ADD COLUMN flight text NOT NULL DEFAULT '';
UPDATE atletas SET flight = 'A', plataforma = 1 WHERE jornada IS NOT NULL;
ALTER TABLE atletas DROP COLUMN lote;
ALTER TABLE atletas DROP COLUMN jornada;
