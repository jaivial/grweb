-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE usuarios (
    id             uuid PRIMARY KEY,
    email          citext      NOT NULL UNIQUE,
    nombre         text        NOT NULL DEFAULT '',
    password_hash  text,
    root           boolean     NOT NULL DEFAULT false,
    estado         text        NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido')),
    ultimo_acceso  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    version        integer     NOT NULL DEFAULT 1
);

-- Roles belong to a competition (competition service owns competitions; referenced by id only).
CREATE TABLE roles (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    slug            text        NOT NULL,
    nombre          text        NOT NULL,
    sistema         boolean     NOT NULL DEFAULT false,
    bloqueado       boolean     NOT NULL DEFAULT false,
    permisos        text[]      NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         integer     NOT NULL DEFAULT 1,
    UNIQUE (competition_id, slug)
);

CREATE TABLE membresias (
    usuario_id      uuid        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    competition_id  uuid        NOT NULL,
    rol_id          uuid        NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    estado          text        NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, competition_id)
);
CREATE INDEX membresias_competition ON membresias (competition_id);

-- One row per session; the refresh secret rotates in place. Presenting an old secret revokes the session.
CREATE TABLE sesiones (
    id            uuid PRIMARY KEY,
    usuario_id    uuid        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    refresh_hash  bytea       NOT NULL,
    origen        text        NOT NULL DEFAULT 'web',
    user_agent    text        NOT NULL DEFAULT '',
    ip            text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    revoked_at    timestamptz
);
CREATE INDEX sesiones_usuario ON sesiones (usuario_id) WHERE revoked_at IS NULL;

CREATE TABLE enlaces_magicos (
    id          uuid PRIMARY KEY,
    usuario_id  uuid        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    token_hash  bytea       NOT NULL UNIQUE,
    siguiente   text        NOT NULL DEFAULT '',
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- OAuth 2.0 device authorization grant (RFC 8628) for the grcup CLI.
CREATE TABLE autorizaciones_dispositivo (
    id           uuid PRIMARY KEY,
    device_hash  bytea       NOT NULL UNIQUE,
    user_code    text        NOT NULL UNIQUE,
    cliente      text        NOT NULL DEFAULT '',
    usuario_id   uuid REFERENCES usuarios (id) ON DELETE CASCADE,
    aprobado_at  timestamptz,
    denegado_at  timestamptz,
    consumido_at timestamptz,
    expires_at   timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Personal access tokens (grc_…): scopes ⊆ the user's permissions, optionally bound to a competition.
CREATE TABLE tokens_acceso (
    id              uuid PRIMARY KEY,
    usuario_id      uuid        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    nombre          text        NOT NULL,
    token_hash      bytea       NOT NULL UNIQUE,
    prefijo         text        NOT NULL,
    scopes          text[]      NOT NULL DEFAULT '{}',
    competition_id  uuid,
    expires_at      timestamptz,
    last_used_at    timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitaciones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    email           citext      NOT NULL,
    rol_id          uuid        NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    token_hash      bytea       NOT NULL UNIQUE,
    invitado_por    uuid REFERENCES usuarios (id) ON DELETE SET NULL,
    expires_at      timestamptz NOT NULL,
    aceptada_at     timestamptz,
    revocada_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitaciones_competition ON invitaciones (competition_id) WHERE aceptada_at IS NULL AND revocada_at IS NULL;

CREATE TABLE vistas_guardadas (
    id          uuid PRIMARY KEY,
    usuario_id  uuid        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    recurso     text        NOT NULL,
    nombre      text        NOT NULL,
    filtros     jsonb       NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, recurso, nombre)
);

CREATE TABLE preferencias (
    usuario_id  uuid PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
    datos       jsonb       NOT NULL DEFAULT '{}',
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE preferencias, vistas_guardadas, invitaciones, tokens_acceso, autorizaciones_dispositivo, enlaces_magicos, sesiones, membresias, roles, usuarios;
