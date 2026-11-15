-- +goose Up
CREATE TABLE competiciones (
    id             uuid PRIMARY KEY,
    slug           text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
    nombre         text        NOT NULL,
    nombre_corto   text        NOT NULL DEFAULT '',
    edicion        integer     NOT NULL DEFAULT 1,
    estado         text        NOT NULL DEFAULT 'borrador'
                   CHECK (estado IN ('borrador', 'proximamente', 'inscripciones', 'completas', 'hoy', 'finalizado', 'archivada')),
    fecha_inicio   date,
    fecha_fin      date,
    zona_horaria   text        NOT NULL DEFAULT 'Europe/Madrid',
    sede           jsonb       NOT NULL DEFAULT '{}',
    evento         jsonb       NOT NULL DEFAULT '{}',
    modulos        jsonb       NOT NULL DEFAULT '{}',
    inscripcion    jsonb       NOT NULL DEFAULT '{}',
    como_llegar    jsonb       NOT NULL DEFAULT '[]',
    logo_url       text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    version        integer     NOT NULL DEFAULT 1,
    archived_at    timestamptz
);

-- Scheduled state changes (e.g. open registrations on a date): applied by the worker.
CREATE TABLE estados_programados (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL REFERENCES competiciones (id) ON DELETE CASCADE,
    estado          text        NOT NULL,
    en              timestamptz NOT NULL,
    creado_por      uuid,
    ejecutado_at    timestamptz,
    cancelado_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX estados_programados_pendientes ON estados_programados (en) WHERE ejecutado_at IS NULL AND cancelado_at IS NULL;

CREATE TABLE checklist (
    competition_id  uuid        NOT NULL REFERENCES competiciones (id) ON DELETE CASCADE,
    paso            text        NOT NULL,
    hecho           boolean     NOT NULL DEFAULT false,
    hecho_at        timestamptz,
    hecho_por       uuid,
    automatico      boolean     NOT NULL DEFAULT false,
    PRIMARY KEY (competition_id, paso)
);

-- Integration settings per competition. Secrets are AES-256-GCM sealed (aad = "<competition>/<tipo>").
CREATE TABLE integraciones (
    competition_id   uuid        NOT NULL REFERENCES competiciones (id) ON DELETE CASCADE,
    tipo             text        NOT NULL CHECK (tipo IN ('smtp', 'stripe', 'whatsapp', 'bunny', 'aep')),
    config           jsonb       NOT NULL DEFAULT '{}',
    secreto          bytea,
    secreto_mascara  text        NOT NULL DEFAULT '',
    estado           text        NOT NULL DEFAULT 'sin_configurar' CHECK (estado IN ('sin_configurar', 'configurada', 'ok', 'error')),
    probado_at       timestamptz,
    error            text        NOT NULL DEFAULT '',
    updated_at       timestamptz NOT NULL DEFAULT now(),
    version          integer     NOT NULL DEFAULT 1,
    PRIMARY KEY (competition_id, tipo)
);

-- +goose Down
DROP TABLE integraciones, checklist, estados_programados, competiciones;
