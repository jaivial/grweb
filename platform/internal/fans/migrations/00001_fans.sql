-- +goose Up
-- Cuentas de directo («fans», Figma 70 · /en-directo): one account per email and competition, with a public
-- alias, the athlete badge when the email matches a registration, and the session version used for
-- revocation (logout everywhere and bans) together with the Redis key `fans:ver:<fanId>`.
-- The email travels in citext plus a hash (duplicates and admin search); the logs never contain it.

CREATE TABLE fans (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    email          citext      NOT NULL,
    email_hash     text        NOT NULL,
    tipo           text        NOT NULL CHECK (tipo IN ('atleta', 'publico')),
    alias          citext      NOT NULL,
    atleta_id      uuid,                                -- when tipo = atleta and athletes confirmed the email
    baneado_hasta  timestamptz,
    baneado_motivo text        NOT NULL DEFAULT '',
    version        bigint      NOT NULL DEFAULT 0,      -- session version (fanauth revocation)
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, email),
    UNIQUE (competition_id, alias)
);
CREATE INDEX fans_lista ON fans (competition_id, created_at DESC);
CREATE INDEX fans_baneados ON fans (competition_id, baneado_hasta) WHERE baneado_hasta IS NOT NULL;

-- Pending magic links: the account is only created (or recovered) when the link is redeemed.
CREATE TABLE accesos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    token_hash     text        NOT NULL UNIQUE,
    fan_email      citext      NOT NULL,
    email_hash     text        NOT NULL,
    tipo           text        NOT NULL CHECK (tipo IN ('atleta', 'publico')),
    alias          citext      NOT NULL,
    ip             text        NOT NULL DEFAULT '',
    expires_at     timestamptz NOT NULL,
    usado_at       timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accesos_email ON accesos (competition_id, email_hash, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS accesos;
DROP TABLE IF EXISTS fans;
