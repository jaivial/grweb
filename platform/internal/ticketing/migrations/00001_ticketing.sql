-- +goose Up
-- Accent-insensitive search at the door («Gomez» finds «Gómez»).
-- +goose StatementBegin
CREATE FUNCTION unaccent_es(text) RETURNS text AS $$
    SELECT translate($1, 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunAEIOUUNaeiouAEIOU')
$$ LANGUAGE sql IMMUTABLE;
-- +goose StatementEnd

-- Free tickets with capacity per session, waiting list and door check-in (Figma pages 37, 38, 58 and 59).

CREATE TABLE sesiones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    nombre          text        NOT NULL,
    detalle         text        NOT NULL DEFAULT '',
    inicio          timestamptz NOT NULL,
    fin             timestamptz NOT NULL,
    puertas         timestamptz NOT NULL,
    aforo           integer     NOT NULL CHECK (aforo BETWEEN 1 AND 20000),
    max_por_reserva integer     NOT NULL DEFAULT 6 CHECK (max_por_reserva BETWEEN 1 AND 20),
    apertura_at     timestamptz,
    cierre_at       timestamptz,
    publicada       boolean     NOT NULL DEFAULT true,
    lista_espera    boolean     NOT NULL DEFAULT true,
    orden           integer     NOT NULL DEFAULT 0,
    version         integer     NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (fin > inicio)
);
CREATE INDEX sesiones_comp ON sesiones (competition_id, inicio);

CREATE TABLE entradas (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    sesion_id      uuid        NOT NULL REFERENCES sesiones (id),
    codigo         text        NOT NULL,
    nombre         text        NOT NULL,
    apellidos      text        NOT NULL DEFAULT '',
    email          citext,
    telefono       text        NOT NULL DEFAULT '',
    personas       integer     NOT NULL CHECK (personas BETWEEN 1 AND 20),
    dentro         integer     NOT NULL DEFAULT 0 CHECK (dentro >= 0),
    estado         text        NOT NULL DEFAULT 'reservada' CHECK (estado IN ('reservada', 'usada', 'anulada')),
    origen         text        NOT NULL DEFAULT 'web',
    utm            jsonb       NOT NULL DEFAULT '{}',
    -- {"privacidad": "v2026-10", "novedades": true, "ip": "83.45.12.x", "at": "…"} (proof; crm keeps the contact)
    consentimientos jsonb      NOT NULL DEFAULT '{}',
    manual         boolean     NOT NULL DEFAULT false,
    nota           text        NOT NULL DEFAULT '',
    token_hash     text        NOT NULL DEFAULT '',
    recordado7_at  timestamptz,
    recordado1_at  timestamptz,
    anulada_at     timestamptz,
    motivo         text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, codigo)
);
CREATE INDEX entradas_sesion ON entradas (sesion_id, estado);
CREATE INDEX entradas_token ON entradas (token_hash) WHERE token_hash <> '';
CREATE INDEX entradas_email ON entradas (competition_id, email);

-- Waiting list per session: offers go out in order when places free up (automatic or by hand).
CREATE TABLE lista_espera (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    sesion_id       uuid        NOT NULL REFERENCES sesiones (id) ON DELETE CASCADE,
    nombre          text        NOT NULL DEFAULT '',
    email           citext      NOT NULL,
    personas        integer     NOT NULL CHECK (personas BETWEEN 1 AND 20),
    estado          text        NOT NULL DEFAULT 'en_espera' CHECK (estado IN ('en_espera', 'oferta', 'aceptada', 'caducada', 'retirada')),
    oferta_expira_at timestamptz,
    token_hash      text        NOT NULL DEFAULT '',
    entrada_id      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sesion_id, email)
);
CREATE INDEX espera_orden ON lista_espera (sesion_id, estado, created_at);

CREATE TABLE ajustes (
    competition_id   uuid PRIMARY KEY,
    auto_promocion   boolean NOT NULL DEFAULT true,
    plazo_horas      integer NOT NULL DEFAULT 24 CHECK (plazo_horas BETWEEN 1 AND 168),
    permitir_parcial boolean NOT NULL DEFAULT false
);

-- Door and box-office stations (their last ping and offline queue are shown in «Taquilla»).
CREATE TABLE puestos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    nombre         text        NOT NULL,
    tipo           text        NOT NULL DEFAULT 'puerta' CHECK (tipo IN ('puerta', 'taquilla', 'pesaje')),
    detalle        text        NOT NULL DEFAULT '',
    ultimo_ping_at timestamptz,
    cola           integer     NOT NULL DEFAULT 0,
    orden          integer     NOT NULL DEFAULT 0,
    UNIQUE (competition_id, nombre)
);

-- Every scan (online or replayed from an offline queue), idempotent by the device's key.
CREATE TABLE escaneos (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    entrada_id      uuid,
    codigo          text        NOT NULL DEFAULT '',
    puesto          text        NOT NULL DEFAULT '',
    usuario         text        NOT NULL DEFAULT '',
    resultado       text        NOT NULL CHECK (resultado IN ('valida', 'ya_usada', 'otra_sesion', 'invalida', 'anulada', 'manual')),
    personas        integer     NOT NULL DEFAULT 0,
    idempotency_key text        UNIQUE,
    offline         boolean     NOT NULL DEFAULT false,
    escaneado_at    timestamptz NOT NULL,
    recibido_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX escaneos_comp ON escaneos (competition_id, escaneado_at DESC);

-- +goose Down
DROP TABLE escaneos;
DROP TABLE puestos;
DROP TABLE ajustes;
DROP TABLE lista_espera;
DROP TABLE entradas;
DROP TABLE sesiones;
DROP FUNCTION unaccent_es(text);
