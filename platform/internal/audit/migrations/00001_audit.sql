-- +goose Up
-- Every domain event of the platform (consumer group "audit" on grcup:<env>:events). id = event id (idempotent).
CREATE TABLE auditoria (
    id                uuid PRIMARY KEY,
    competition_id    uuid,
    tipo              text        NOT NULL,
    source            text        NOT NULL,
    subject           text        NOT NULL DEFAULT '',
    audience          text        NOT NULL,
    permiso           text        NOT NULL DEFAULT '',
    actor_usuario_id  uuid,
    actor_nombre      text        NOT NULL DEFAULT '',
    actor_origen      text        NOT NULL DEFAULT '',
    actor_servicio    text        NOT NULL DEFAULT '',
    datos             jsonb       NOT NULL DEFAULT '{}',
    diff              jsonb,
    request_id        text        NOT NULL DEFAULT '',
    occurred_at       timestamptz NOT NULL,
    recibido_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_comp ON auditoria (competition_id, occurred_at DESC, id DESC);
CREATE INDEX auditoria_actor ON auditoria (actor_usuario_id, occurred_at DESC);
CREATE INDEX auditoria_tipo ON auditoria (tipo);

CREATE TABLE notificaciones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    permiso         text        NOT NULL DEFAULT '' ,
    titulo          text        NOT NULL,
    cuerpo          text        NOT NULL DEFAULT '',
    enlace          text        NOT NULL DEFAULT '',
    nivel           text        NOT NULL DEFAULT 'info' CHECK (nivel IN ('info', 'ok', 'aviso', 'error')),
    evento_id       uuid        NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificaciones_comp ON notificaciones (competition_id, created_at DESC);

CREATE TABLE notificaciones_leidas (
    notificacion_id uuid        NOT NULL REFERENCES notificaciones (id) ON DELETE CASCADE,
    usuario_id      uuid        NOT NULL,
    leida_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (notificacion_id, usuario_id)
);

-- Counters of the dashboard (Inicio) fed by events, plus one value per day for the series.
CREATE TABLE kpis (
    competition_id  uuid        NOT NULL,
    clave           text        NOT NULL,
    valor           bigint      NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, clave)
);
CREATE TABLE kpi_serie (
    competition_id  uuid        NOT NULL,
    clave           text        NOT NULL,
    dia             date        NOT NULL,
    valor           bigint      NOT NULL DEFAULT 0,
    PRIMARY KEY (competition_id, clave, dia)
);

-- +goose Down
DROP TABLE kpi_serie, kpis, notificaciones_leidas, notificaciones, auditoria;
