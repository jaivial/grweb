-- +goose Up
-- Athletes of a competition (Figma page 55 · «Atletas»): registered by the AEP (imported from its list) or by hand.
CREATE TABLE atletas (
    id               uuid PRIMARY KEY,
    competition_id   uuid        NOT NULL,
    licencia         text        NOT NULL DEFAULT '',
    nombre           text        NOT NULL,
    apellidos        text        NOT NULL DEFAULT '',
    email            citext,
    telefono         text        NOT NULL DEFAULT '',
    sexo             text        NOT NULL CHECK (sexo IN ('F', 'M')),
    fecha_nacimiento date,
    categoria        text        NOT NULL DEFAULT '',
    division         text        NOT NULL DEFAULT 'open',
    club             text        NOT NULL DEFAULT '',
    ciudad           text        NOT NULL DEFAULT '',
    estado           text        NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'reserva', 'baja')),
    orden_reserva    integer,
    origen           text        NOT NULL DEFAULT 'aep' CHECK (origen IN ('aep', 'manual', 'propia')),
    -- Schedule: written by the schedule service when flights are published.
    flight           text        NOT NULL DEFAULT '',
    plataforma       integer,
    hora_inicio      timestamptz,
    pesaje_inicio    timestamptz,
    pesaje_fin       timestamptz,
    -- Weigh-in (the athlete can pre-fill rack heights and openers from the athlete area).
    peso_corporal    numeric(5, 2),
    rack_sq          integer,
    rack_bp          text        NOT NULL DEFAULT '',
    seguros_bp       integer,
    intento_sq       numeric(5, 1),
    intento_bp       numeric(5, 1),
    intento_dl       numeric(5, 1),
    pesaje_estado    text        NOT NULL DEFAULT 'pendiente' CHECK (pesaje_estado IN ('pendiente', 'ok', 'fuera', 'no_compite')),
    pesaje_sugerencia text       NOT NULL DEFAULT '',
    pesado_at        timestamptz,
    pesado_por       text        NOT NULL DEFAULT '',
    version          integer     NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX atletas_licencia ON atletas (competition_id, licencia) WHERE licencia <> '';
CREATE INDEX atletas_lista ON atletas (competition_id, estado, sexo, categoria);

-- Public profile (1:1). Photo, bio, social links and best lifts are shown only with visible + image consent
-- (and, for minors, the guardian's authorisation).
CREATE TABLE perfiles (
    atleta_id          uuid PRIMARY KEY REFERENCES atletas (id) ON DELETE CASCADE,
    competition_id     uuid        NOT NULL,
    slug               text        NOT NULL,
    foto_url           text        NOT NULL DEFAULT '',
    focal_x            smallint    NOT NULL DEFAULT 50,
    focal_y            smallint    NOT NULL DEFAULT 50,
    frase              text        NOT NULL DEFAULT '',
    bio                text        NOT NULL DEFAULT '',
    instagram          text        NOT NULL DEFAULT '',
    entrenador         text        NOT NULL DEFAULT '',
    historial          text        NOT NULL DEFAULT '',
    marca_sq           numeric(5, 1),
    marca_bp           numeric(5, 1),
    marca_dl           numeric(5, 1),
    visible            boolean     NOT NULL DEFAULT true,
    mostrar_marcas     boolean     NOT NULL DEFAULT true,
    permite_seguir     boolean     NOT NULL DEFAULT true,
    autorizacion_url   text        NOT NULL DEFAULT '',
    imagen_at          timestamptz,
    imagen_version     text        NOT NULL DEFAULT '',
    imagen_hash        text        NOT NULL DEFAULT '',
    imagen_origen      text        NOT NULL DEFAULT '',
    imagen_ip          text        NOT NULL DEFAULT '',
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, slug)
);

-- «Avísame cuando compita»: email alerts (confirmed by email before any alert is sent).
CREATE TABLE seguimientos (
    id                uuid PRIMARY KEY,
    atleta_id         uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    competition_id    uuid        NOT NULL,
    email             citext      NOT NULL,
    token_hash        text        NOT NULL,
    consentimiento_at timestamptz NOT NULL,
    legal_version     text        NOT NULL DEFAULT '',
    confirmado_at     timestamptz,
    baja_at           timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (atleta_id, email)
);
CREATE INDEX seguimientos_token ON seguimientos (token_hash);

-- Import of the AEP list (.xlsx/.csv): upload → column mapping → reviewed diff → confirmed in batches.
CREATE TABLE importaciones (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    archivo        text        NOT NULL,
    estado         text        NOT NULL DEFAULT 'subida' CHECK (estado IN ('subida', 'revisada', 'importando', 'confirmada', 'fallida')),
    columnas       jsonb       NOT NULL DEFAULT '[]',
    mapeo          jsonb       NOT NULL DEFAULT '{}',
    resumen        jsonb       NOT NULL DEFAULT '{}',
    total          integer     NOT NULL DEFAULT 0,
    hechas         integer     NOT NULL DEFAULT 0,
    creado_por     text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE importacion_filas (
    importacion_id uuid    NOT NULL REFERENCES importaciones (id) ON DELETE CASCADE,
    fila           integer NOT NULL,
    datos          jsonb   NOT NULL,
    accion         text    NOT NULL DEFAULT '',
    cambios        jsonb   NOT NULL DEFAULT '[]',
    error          text    NOT NULL DEFAULT '',
    atleta_id      uuid,
    PRIMARY KEY (importacion_id, fila)
);

-- Athlete area: one-time links (30 min) and sessions (cookie, 30 days).
CREATE TABLE area_tokens (
    hash       text PRIMARY KEY,
    atleta_id  uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE area_sesiones (
    id           uuid PRIMARY KEY,
    atleta_id    uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    token_hash   text        NOT NULL UNIQUE,
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Per-athlete history shown in the backoffice record («Historial»).
CREATE TABLE historial (
    id        uuid PRIMARY KEY,
    atleta_id uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    actor     text        NOT NULL,
    accion    text        NOT NULL,
    detalle   text        NOT NULL DEFAULT '',
    at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historial_atleta ON historial (atleta_id, at DESC);

-- +goose Down
DROP TABLE historial;
DROP TABLE area_sesiones;
DROP TABLE area_tokens;
DROP TABLE importacion_filas;
DROP TABLE importaciones;
DROP TABLE seguimientos;
DROP TABLE perfiles;
DROP TABLE atletas;
