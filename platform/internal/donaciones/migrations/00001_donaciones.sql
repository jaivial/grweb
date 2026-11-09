-- +goose Up
-- Donations announced in the live chat (Figma page 70 · /en-directo): fans pay with Stripe or the simulated
-- gateway, the webhook confirms them and the chat and the ranking show them as GRS coins (announced only, never
-- spendable). The día is the creation date in Europe/Madrid.

CREATE TABLE config_donaciones (
    competition_id     uuid        PRIMARY KEY,
    activo             boolean     NOT NULL DEFAULT false,
    minimo             integer     NOT NULL DEFAULT 100   CHECK (minimo BETWEEN 1 AND 500000),   -- céntimos
    maximo             integer     NOT NULL DEFAULT 50000 CHECK (maximo BETWEEN 1 AND 500000),   -- céntimos
    coins_por_euro     integer     NOT NULL DEFAULT 100   CHECK (coins_por_euro BETWEEN 1 AND 10000),
    importes_sugeridos integer[]   NOT NULL DEFAULT '{500,1000,2500,5000}',
    version            integer     NOT NULL DEFAULT 1,
    updated_por        text        NOT NULL DEFAULT '',
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (minimo <= maximo)
);

CREATE TABLE donaciones (
    id             uuid        PRIMARY KEY,
    competition_id uuid        NOT NULL,
    dia            date        NOT NULL,
    fan_id         uuid        NOT NULL,
    alias          text        NOT NULL DEFAULT '',
    importe        integer     NOT NULL CHECK (importe > 0),
    coins          integer     NOT NULL DEFAULT 0 CHECK (coins >= 0),
    mensaje        text        NOT NULL DEFAULT '',
    anonimo        boolean     NOT NULL DEFAULT false,
    estado         text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'caducada', 'reembolsada')),
    proveedor      text        NOT NULL DEFAULT '',
    session_id     text        NOT NULL DEFAULT '',
    payment_id     text        NOT NULL DEFAULT '',
    motivo         text        NOT NULL DEFAULT '',
    reembolso_id   text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    pagada_at      timestamptz,
    reembolsada_at timestamptz
);
CREATE INDEX donaciones_ranking ON donaciones (competition_id, dia) WHERE estado = 'pagada';
CREATE INDEX donaciones_fan ON donaciones (competition_id, fan_id, created_at DESC);
CREATE UNIQUE INDEX donaciones_sesion ON donaciones (session_id) WHERE session_id <> '';

-- Payment events already processed (idempotency of the webhook).
CREATE TABLE webhook_eventos (
    id         text        PRIMARY KEY,
    tipo       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE webhook_eventos;
DROP TABLE donaciones;
DROP TABLE config_donaciones;
