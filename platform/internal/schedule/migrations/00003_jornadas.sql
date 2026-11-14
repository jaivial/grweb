-- +goose Up
-- No flights (Jaime, 15-nov): the unit of the schedule is the JORNADA (one date of the event, one platform). The
-- athletes of a day compete in one session in lot order; how far the day has gone is driven by OpenLifter.
-- flights + flight_atletas → jornada_atletas (lot order inside the day, from the old flight order); the live state
-- goes per day; the planner loses max per flight, platforms, order, rest between flights, weigh-in tables and
-- «separar por sexo» (the order is always women first, weight class, expected total).

CREATE TABLE jornada_atletas (
    competition_id uuid    NOT NULL,
    atleta_id      uuid    NOT NULL,
    dia            date    NOT NULL,
    orden          integer NOT NULL,
    PRIMARY KEY (competition_id, atleta_id)
);
CREATE INDEX jornada_atletas_dia ON jornada_atletas (competition_id, dia, orden);

INSERT INTO jornada_atletas (competition_id, atleta_id, dia, orden)
SELECT fa.competition_id, fa.atleta_id, f.dia,
       row_number() OVER (PARTITION BY fa.competition_id, f.dia ORDER BY f.inicio, f.plataforma, fa.orden)
FROM flight_atletas fa JOIN flights f ON f.id = fa.flight_id;

CREATE TABLE directo_jornada (
    competition_id uuid        NOT NULL,
    dia            date        NOT NULL,
    estado         text        NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'en_curso', 'finalizado')),
    retraso_min    integer     NOT NULL DEFAULT 0 CHECK (retraso_min BETWEEN 0 AND 600),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, dia)
);
INSERT INTO directo_jornada (competition_id, dia, estado, retraso_min)
SELECT d.competition_id, f.dia,
       CASE WHEN bool_or(d.estado = 'en_curso') THEN 'en_curso' WHEN bool_and(d.estado = 'finalizado') THEN 'finalizado' ELSE 'programado' END,
       max(d.retraso_min)
FROM directo d JOIN flights f ON f.id = d.flight_id
GROUP BY d.competition_id, f.dia;

-- Published snapshots: each day takes the athletes of its flights in order (lots renumbered), the start of its
-- first flight, the end of its last one and the first weigh-in window.
UPDATE versiones v SET snapshot = jsonb_set(v.snapshot, '{dias}', COALESCE((
    SELECT jsonb_agg((d.val - 'flights') || jsonb_build_object(
        'prueba', COALESCE((SELECT f->>'prueba' FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) f WHERE COALESCE(f->>'prueba', '') <> '' LIMIT 1), ''),
        'inicio', (SELECT min(f->>'inicio') FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) f),
        'fin', (SELECT max(f->>'fin') FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) f),
        'pesajeInicio', (SELECT min(f->>'pesajeInicio') FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) f),
        'pesajeFin', (SELECT f->>'pesajeFin' FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) f ORDER BY f->>'inicio' LIMIT 1),
        'atletas', COALESCE((
            SELECT jsonb_agg(x.a || jsonb_build_object('lote', x.n) ORDER BY x.n) FROM (
                SELECT at.a, row_number() OVER (ORDER BY f.val->>'inicio', (f.val->>'plataforma')::int, (at.a->>'lote')::int) AS n
                FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) f(val), jsonb_array_elements(f.val->'atletas') at(a)) x), '[]'::jsonb)
    ) ORDER BY d.ord)
    FROM jsonb_array_elements(v.snapshot->'dias') WITH ORDINALITY d(val, ord)), '[]'::jsonb));

DROP TABLE directo;
DROP TABLE flight_atletas;
DROP TABLE flights;

ALTER TABLE config DROP COLUMN max_por_flight;
ALTER TABLE config DROP COLUMN plataformas;
ALTER TABLE config DROP COLUMN orden;
ALTER TABLE config DROP COLUMN separar_sexo;
ALTER TABLE config DROP COLUMN descanso_min;
ALTER TABLE config DROP COLUMN mesas_pesaje;

-- +goose Down
-- Structure only: the flights cannot be rebuilt from the days (each day comes back as one flight «A», «B»… on
-- platform 1, published snapshots stay in the new shape).
ALTER TABLE config ADD COLUMN max_por_flight integer NOT NULL DEFAULT 14 CHECK (max_por_flight BETWEEN 2 AND 30);
ALTER TABLE config ADD COLUMN plataformas integer NOT NULL DEFAULT 1 CHECK (plataformas BETWEEN 1 AND 4);
ALTER TABLE config ADD COLUMN orden text NOT NULL DEFAULT 'total' CHECK (orden IN ('total', 'categoria'));
ALTER TABLE config ADD COLUMN separar_sexo boolean NOT NULL DEFAULT true;
ALTER TABLE config ADD COLUMN descanso_min integer NOT NULL DEFAULT 10 CHECK (descanso_min BETWEEN 0 AND 120);
ALTER TABLE config ADD COLUMN mesas_pesaje integer NOT NULL DEFAULT 1 CHECK (mesas_pesaje BETWEEN 1 AND 4);

CREATE TABLE flights (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    dia            date        NOT NULL,
    codigo         text        NOT NULL,
    plataforma     integer     NOT NULL DEFAULT 1 CHECK (plataforma BETWEEN 1 AND 4),
    inicio         timestamptz NOT NULL,
    duracion_min   integer     NOT NULL CHECK (duracion_min BETWEEN 10 AND 600),
    pesaje_inicio  timestamptz NOT NULL,
    pesaje_fin     timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    prueba         text        NOT NULL DEFAULT '' CHECK (prueba IN ('', 'aep2', 'aep3')),
    CHECK (pesaje_fin > pesaje_inicio)
);
CREATE INDEX flights_comp ON flights (competition_id, dia, inicio);
CREATE TABLE flight_atletas (
    flight_id      uuid    NOT NULL REFERENCES flights (id) ON DELETE CASCADE,
    competition_id uuid    NOT NULL,
    atleta_id      uuid    NOT NULL,
    orden          integer NOT NULL,
    PRIMARY KEY (flight_id, atleta_id),
    UNIQUE (competition_id, atleta_id)
);
INSERT INTO flights (id, competition_id, dia, codigo, inicio, duracion_min, pesaje_inicio, pesaje_fin)
SELECT gen_random_uuid(), competition_id, dia, chr(64 + row_number() OVER (PARTITION BY competition_id ORDER BY dia)::int),
       dia + time '09:00', 600, dia + time '07:00', dia + time '08:30'
FROM (SELECT DISTINCT competition_id, dia FROM jornada_atletas) j;
INSERT INTO flight_atletas (flight_id, competition_id, atleta_id, orden)
SELECT f.id, j.competition_id, j.atleta_id, j.orden FROM jornada_atletas j JOIN flights f ON f.competition_id = j.competition_id AND f.dia = j.dia;
CREATE TABLE directo (
    flight_id      uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    estado         text        NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'en_curso', 'finalizado')),
    retraso_min    integer     NOT NULL DEFAULT 0 CHECK (retraso_min BETWEEN 0 AND 600),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
DROP TABLE directo_jornada;
DROP TABLE jornada_atletas;
