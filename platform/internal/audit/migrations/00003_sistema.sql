-- +goose Up
-- Sistema e integraciones (Figma 64): provider webhooks received (one row per provider event, retries counted),
-- full exports of a competition (ZIP kept 24 h) and the nightly backups (written by the copias-postgres CronJob).
CREATE TABLE webhooks (
    competition_id  uuid        NOT NULL,
    clave           text        NOT NULL,
    proveedor       text        NOT NULL,
    servicio        text        NOT NULL,
    tipo            text        NOT NULL DEFAULT '',
    respuesta       integer     NOT NULL,
    intentos        integer     NOT NULL DEFAULT 1,
    recibido_at     timestamptz NOT NULL,
    PRIMARY KEY (competition_id, clave)
);
CREATE INDEX webhooks_lista ON webhooks (competition_id, recibido_at DESC);

CREATE TABLE exportaciones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    tipo            text        NOT NULL DEFAULT 'completa',
    estado          text        NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'lista', 'error')),
    archivo         bytea,
    bytes           bigint      NOT NULL DEFAULT 0,
    error           text        NOT NULL DEFAULT '',
    pedida_por      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    terminada_at    timestamptz,
    expira_at       timestamptz
);
CREATE INDEX exportaciones_comp ON exportaciones (competition_id, created_at DESC);

CREATE TABLE copias (
    hecha_at        timestamptz NOT NULL DEFAULT now(),
    bases           integer     NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE copias, exportaciones, webhooks;
