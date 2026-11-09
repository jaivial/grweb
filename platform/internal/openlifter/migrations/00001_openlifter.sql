-- +goose Up
-- OpenLifter desk (fork of OpenLifter at the competition): its entries, the link of each entry with an athlete of
-- the competition, and what was already sent to athletes (weigh-in) and live (attempts).

-- One row per OpenLifter meet («mesa»: its name and date, or the key the desk pinned) and the last device revision.
CREATE TABLE mesas (
    competition_id uuid        NOT NULL,
    mesa           text        NOT NULL,
    dispositivo    text        NOT NULL DEFAULT '',
    rev            bigint      NOT NULL DEFAULT 0,
    grupo          jsonb,
    por            text        NOT NULL DEFAULT '',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, mesa)
);

-- Last state of each OpenLifter entry and its link: auto (matched with confidence), confirmado (by the desk),
-- sugerido (candidates to confirm), sin_coincidencia, ignorado (not synchronised).
CREATE TABLE entradas (
    competition_id uuid        NOT NULL,
    mesa           text        NOT NULL,
    entry_id       integer     NOT NULL,
    datos          jsonb       NOT NULL DEFAULT '{}',
    atleta_id      uuid,
    vinculo        text        NOT NULL DEFAULT 'sin_coincidencia' CHECK (vinculo IN ('auto', 'confirmado', 'sugerido', 'sin_coincidencia', 'ignorado')),
    puntuacion     real        NOT NULL DEFAULT 0,
    motivo         text        NOT NULL DEFAULT '',
    pesaje_hash    text        NOT NULL DEFAULT '',
    intentos_hash  text        NOT NULL DEFAULT '',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, mesa, entry_id)
);
-- An athlete is one entry of a desk at most.
CREATE UNIQUE INDEX entradas_atleta ON entradas (competition_id, mesa, atleta_id) WHERE atleta_id IS NOT NULL;

-- Names the desk confirmed by hand (order-free key without accents or particles): the same spelling links again
-- on its own, on any desk of the competition.
CREATE TABLE alias (
    competition_id uuid        NOT NULL,
    clave          text        NOT NULL,
    atleta_id      uuid        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, clave)
);

-- +goose Down
DROP TABLE alias;
DROP TABLE entradas;
DROP TABLE mesas;
