-- +goose Up
-- Schedule of a competition (Figma page 56 · «Horarios y flights», public page 41 · /horarios).
-- The planner edits a draft (config + flights + flight_atletas + agenda); publishing freezes it into an
-- immutable snapshot (versiones) that the public web serves, and writes the athletes' flight and times
-- through the athletes service.

-- Planner settings and the days of the competition. rev is the draft revision (ETag / If-Match): every
-- change of flights, athletes or agenda increments it.
CREATE TABLE config (
    competition_id      uuid PRIMARY KEY,
    max_por_flight      integer     NOT NULL DEFAULT 14 CHECK (max_por_flight BETWEEN 2 AND 30),
    plataformas         integer     NOT NULL DEFAULT 1 CHECK (plataformas BETWEEN 1 AND 4),
    orden               text        NOT NULL DEFAULT 'total' CHECK (orden IN ('total', 'categoria')),
    separar_sexo        boolean     NOT NULL DEFAULT true,
    min_por_atleta      integer     NOT NULL DEFAULT 7 CHECK (min_por_atleta BETWEEN 3 AND 20),
    descanso_min        integer     NOT NULL DEFAULT 10 CHECK (descanso_min BETWEEN 0 AND 120),
    pesaje_antes_min    integer     NOT NULL DEFAULT 120 CHECK (pesaje_antes_min BETWEEN 30 AND 240),
    pesaje_duracion_min integer     NOT NULL DEFAULT 90 CHECK (pesaje_duracion_min BETWEEN 15 AND 180),
    mesas_pesaje        integer     NOT NULL DEFAULT 1 CHECK (mesas_pesaje BETWEEN 1 AND 4),
    -- [{fecha, inicio, fin, puertas, pausaInicio, pausaFin, notas[]}] (local times of the competition)
    dias                jsonb       NOT NULL DEFAULT '[]',
    publicado           boolean     NOT NULL DEFAULT false,
    rev                 integer     NOT NULL DEFAULT 1,
    rev_publicada       integer     NOT NULL DEFAULT 0,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

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
    CHECK (pesaje_fin > pesaje_inicio)
);
CREATE INDEX flights_comp ON flights (competition_id, dia, inicio);

-- Athletes of a flight in lot order. An athlete is in at most one flight of a competition.
CREATE TABLE flight_atletas (
    flight_id      uuid    NOT NULL REFERENCES flights (id) ON DELETE CASCADE,
    competition_id uuid    NOT NULL,
    atleta_id      uuid    NOT NULL,
    orden          integer NOT NULL,
    PRIMARY KEY (flight_id, atleta_id),
    UNIQUE (competition_id, atleta_id)
);

-- Other moments of the day shown between flights (doors, awards, raffle…).
CREATE TABLE agenda (
    id             uuid PRIMARY KEY,
    competition_id uuid    NOT NULL,
    dia            date    NOT NULL,
    hora           text    NOT NULL CHECK (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
    titulo         text    NOT NULL,
    icono          text    NOT NULL DEFAULT 'clock',
    orden          integer NOT NULL DEFAULT 0
);
CREATE INDEX agenda_comp ON agenda (competition_id, dia, hora);

-- Published versions (immutable snapshot). Only one is «publicada» at a time.
CREATE TABLE versiones (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    numero         integer     NOT NULL,
    snapshot       jsonb       NOT NULL,
    estado         text        NOT NULL CHECK (estado IN ('publicada', 'sustituida', 'retirada')),
    cambios        integer     NOT NULL DEFAULT 0,
    avisos         integer     NOT NULL DEFAULT 0,
    seguidores     integer     NOT NULL DEFAULT 0,
    publicado_por  text        NOT NULL DEFAULT '',
    publicado_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, numero)
);
CREATE UNIQUE INDEX versiones_publicada ON versiones (competition_id) WHERE estado = 'publicada';

-- Live state of published flights on the day (the «Directo» desk of step 11 drives it).
CREATE TABLE directo (
    flight_id      uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    estado         text        NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'en_curso', 'finalizado')),
    retraso_min    integer     NOT NULL DEFAULT 0 CHECK (retraso_min BETWEEN 0 AND 600),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE directo;
DROP TABLE versiones;
DROP TABLE agenda;
DROP TABLE flight_atletas;
DROP TABLE flights;
DROP TABLE config;
