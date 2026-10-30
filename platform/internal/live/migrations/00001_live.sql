-- +goose Up
-- Live competition (Figma page 57 · «Directo y resultados», public pages 25 and 27): the desk declares weights and
-- the three judges' lights, the public follows it by SSE, results are computed (best valid lift, total, IPF GL)
-- and published per category.

-- Live state of a competition (one row): current flight and lift, pause, delay, stream and arena screen settings.
CREATE TABLE estado (
    competition_id uuid PRIMARY KEY,
    fase           text        NOT NULL DEFAULT 'antes' CHECK (fase IN ('antes', 'en_directo', 'finalizado')),
    flight_id      uuid,
    movimiento     text        NOT NULL DEFAULT 'sq' CHECK (movimiento IN ('sq', 'bp', 'dl')),
    pausa          boolean     NOT NULL DEFAULT false,
    retraso_min    integer     NOT NULL DEFAULT 0 CHECK (retraso_min BETWEEN 0 AND 600),
    stream_url     text        NOT NULL DEFAULT '',
    replay_url     text        NOT NULL DEFAULT '',
    -- when the athlete on the platform was called (the 1-minute clock of the desk and the screen)
    turno_at       timestamptz,
    -- arena screen: what it shows and the version of its signed URL (bumped to revoke a leaked link)
    pantalla       jsonb       NOT NULL DEFAULT '{"siguientes": true, "carrusel": true, "qr": false, "ver": 1}',
    -- «Publicación programada al cerrar el flight»: complete categories are published when their last flight ends
    publicar_auto  boolean     NOT NULL DEFAULT true,
    version        integer     NOT NULL DEFAULT 1,
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One row per athlete, lift and attempt: declared weight, then the lights (L1, C, L2: B = white, R = red).
CREATE TABLE intentos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    flight_id      uuid        NOT NULL,
    movimiento     text        NOT NULL CHECK (movimiento IN ('sq', 'bp', 'dl')),
    numero         integer     NOT NULL CHECK (numero BETWEEN 1 AND 3),
    peso           numeric(5, 1) NOT NULL CHECK (peso > 0),
    votos          text        NOT NULL DEFAULT '' CHECK (votos ~ '^[BR]{0,3}$'),
    resultado      text        NOT NULL DEFAULT 'pendiente' CHECK (resultado IN ('pendiente', 'valido', 'nulo', 'renuncia')),
    corregido_por  text        NOT NULL DEFAULT '',
    motivo         text        NOT NULL DEFAULT '',
    juzgado_at     timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, atleta_id, movimiento, numero)
);
CREATE INDEX intentos_flight ON intentos (competition_id, flight_id, movimiento);

-- Published ranking of a category (frozen when published; the public page reads only this).
CREATE TABLE resultados (
    competition_id uuid        NOT NULL,
    categoria      text        NOT NULL,
    datos          jsonb       NOT NULL,
    version        integer     NOT NULL DEFAULT 1,
    publicado_por  text        NOT NULL DEFAULT '',
    publicado_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, categoria)
);

-- Records to beat (regional), for the «Récord» badge.
CREATE TABLE records (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    ambito         text        NOT NULL DEFAULT 'CV',
    sexo           text        NOT NULL CHECK (sexo IN ('F', 'M')),
    categoria      text        NOT NULL,
    movimiento     text        NOT NULL CHECK (movimiento IN ('sq', 'bp', 'dl', 'total')),
    peso           numeric(6, 1) NOT NULL,
    UNIQUE (competition_id, ambito, sexo, categoria, movimiento)
);

-- +goose Down
DROP TABLE records;
DROP TABLE resultados;
DROP TABLE intentos;
DROP TABLE estado;
