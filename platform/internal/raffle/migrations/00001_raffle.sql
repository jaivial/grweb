-- +goose Up
-- Charity raffle (Figma pages 07 · /sorteo and 60 · BO · Sorteo): tickets bought online (Stripe or the simulated
-- gateway in QA), numbered in order when paid, and a verifiable draw: the list and a seed are frozen first (their
-- hashes published), the winner is HMAC(seed, list) mod N, and the seed is revealed on confirmation.

CREATE TABLE config (
    competition_id   uuid PRIMARY KEY,
    premio           text        NOT NULL DEFAULT '',
    premio_detalle   text        NOT NULL DEFAULT '',
    premio_imagen    text        NOT NULL DEFAULT '',
    premio_valor     integer     NOT NULL DEFAULT 0,      -- cents
    destino          text        NOT NULL DEFAULT '',     -- charity that receives the money
    precio           integer     NOT NULL DEFAULT 100 CHECK (precio BETWEEN 50 AND 10000),
    max_por_persona  integer     NOT NULL DEFAULT 10 CHECK (max_por_persona BETWEEN 1 AND 100),
    presets          integer[]   NOT NULL DEFAULT '{1,2,5,10}',
    total_max        integer,
    venta_desde      timestamptz,
    venta_hasta      timestamptz,
    fecha_sorteo     timestamptz,
    activa           boolean     NOT NULL DEFAULT false,
    version          integer     NOT NULL DEFAULT 1,
    updated_por      text        NOT NULL DEFAULT '',
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Legal checklist: the sale can only be switched on with every item done (or not applicable).
CREATE TABLE checklist (
    competition_id uuid        NOT NULL,
    clave          text        NOT NULL,
    estado         text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecho', 'no_aplica')),
    nota           text        NOT NULL DEFAULT '',
    por            text        NOT NULL DEFAULT '',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, clave)
);

CREATE TABLE compras (
    id               uuid PRIMARY KEY,
    competition_id   uuid        NOT NULL,
    nombre           text        NOT NULL,
    email            citext,
    telefono         text        NOT NULL DEFAULT '',
    cantidad         integer     NOT NULL CHECK (cantidad BETWEEN 1 AND 100),
    importe          integer     NOT NULL,
    estado           text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'fallida', 'caducada', 'reembolsada')),
    pasarela         text        NOT NULL DEFAULT '',
    sesion           text        NOT NULL DEFAULT '',
    pago             text        NOT NULL DEFAULT '',
    tarjeta          text        NOT NULL DEFAULT '',
    reembolso        text        NOT NULL DEFAULT '',
    motivo           text        NOT NULL DEFAULT '',
    consentimientos  jsonb       NOT NULL DEFAULT '{}',
    token_hash       text        NOT NULL DEFAULT '',
    origen           text        NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    pagada_at        timestamptz,
    reembolsada_at   timestamptz,
    anonimizada_at   timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compras_lista ON compras (competition_id, created_at DESC);
CREATE INDEX compras_email ON compras (competition_id, email);
CREATE UNIQUE INDEX compras_sesion ON compras (sesion) WHERE sesion <> '';

CREATE TABLE boletos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    compra_id      uuid        NOT NULL REFERENCES compras (id),
    numero         integer     NOT NULL,
    anulado        boolean     NOT NULL DEFAULT false,
    motivo         text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, numero)
);
CREATE INDEX boletos_compra ON boletos (compra_id);

-- Draws: frozen (list + seed committed), drawn (winner known to the team), confirmed (public, seed revealed) or
-- repeated (with the reason).
CREATE TABLE sorteos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    semilla        text        NOT NULL,
    semilla_hash   text        NOT NULL,
    lista          integer[]   NOT NULL,
    hash_lista     text        NOT NULL,
    total          integer     NOT NULL,
    indice         integer,
    numero         integer,
    compra_id      uuid,
    estado         text        NOT NULL DEFAULT 'congelado' CHECK (estado IN ('congelado', 'sorteado', 'confirmado', 'repetido')),
    motivo         text        NOT NULL DEFAULT '',
    testigo        text        NOT NULL DEFAULT '',
    por            text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    sorteado_at    timestamptz,
    confirmado_at  timestamptz
);
CREATE INDEX sorteos_lista ON sorteos (competition_id, created_at DESC);

-- Payment events already processed (idempotency of the webhook).
CREATE TABLE pagos_eventos (
    id         text PRIMARY KEY,
    tipo       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE pagos_eventos;
DROP TABLE sorteos;
DROP TABLE boletos;
DROP TABLE compras;
DROP TABLE checklist;
DROP TABLE config;
