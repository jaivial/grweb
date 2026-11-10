-- +goose Up
-- Directo social · chat (§4 del contrato): salas por (competición, día) en Redis Streams con persistencia
-- diferida en PostgreSQL, moderación (borrado, silencios, reportes) y configuración de sala versionada.
-- La ruta caliente nunca toca esta base de datos: solo los lotes del consumidor «chat-persistir».

-- Configuración de la sala por competición (ETag con version: If-Match → 409 CONFLICTO_EDICION).
CREATE TABLE config_chat (
    competition_id       uuid        PRIMARY KEY,
    activo               boolean     NOT NULL DEFAULT true,
    modo_lento_seg       integer     NOT NULL DEFAULT 0 CHECK (modo_lento_seg BETWEEN 0 AND 3600),
    palabras_prohibidas  text[]      NOT NULL DEFAULT '{}',
    dominios_permitidos  text[]      NOT NULL DEFAULT '{}',
    max_hitos            integer     NOT NULL DEFAULT 100 CHECK (max_hitos BETWEEN 1 AND 1000),
    version              integer     NOT NULL DEFAULT 1,
    updated_por          text        NOT NULL DEFAULT '',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Mensajes persistidos en lotes desde el stream de la sala (id = id de la entrada de Redis).
CREATE TABLE mensajes (
    id             text        PRIMARY KEY,                    -- «1710000000000-0» (id del stream)
    competition_id uuid        NOT NULL,
    dia            date        NOT NULL,
    fan_id         uuid        NOT NULL,
    alias          text        NOT NULL DEFAULT '',
    tipo           text        NOT NULL DEFAULT 'msg' CHECK (tipo IN ('msg', 'sistema')),
    texto          text        NOT NULL DEFAULT '',
    borrado        boolean     NOT NULL DEFAULT false,
    reportes       integer     NOT NULL DEFAULT 0 CHECK (reportes >= 0),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensajes_sala ON mensajes (competition_id, dia, created_at DESC);
CREATE INDEX mensajes_fan ON mensajes (competition_id, fan_id, created_at DESC);
CREATE INDEX mensajes_reportados ON mensajes (competition_id, dia, reportes DESC) WHERE reportes > 0;

-- Silencios de moderación; el control en la ruta caliente vive en Redis (TTL = hasta).
CREATE TABLE silencios (
    competition_id uuid        NOT NULL,
    fan_id         uuid        NOT NULL,
    hasta          timestamptz NOT NULL,
    motivo         text        NOT NULL DEFAULT '',
    por            text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, fan_id)
);

-- +goose Down
DROP TABLE silencios;
DROP TABLE mensajes;
DROP TABLE config_chat;
