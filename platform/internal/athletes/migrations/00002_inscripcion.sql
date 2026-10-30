-- +goose Up
-- Own registration with payment, coupons and referrals (Figma pages 66 and 06b). Amounts in euro cents.
CREATE TABLE inscripcion_config (
    competition_id uuid PRIMARY KEY,
    modo           text        NOT NULL DEFAULT 'externa' CHECK (modo IN ('externa', 'propia')),
    cuota          integer     NOT NULL DEFAULT 3500 CHECK (cuota >= 0),
    abre           timestamptz,
    cierra         timestamptz,
    reserva        boolean     NOT NULL DEFAULT true,
    cupones        boolean     NOT NULL DEFAULT true,
    referidos      jsonb       NOT NULL DEFAULT '{}',
    version        integer     NOT NULL DEFAULT 1,
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cupones (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    codigo         text        NOT NULL,
    tipo           text        NOT NULL CHECK (tipo IN ('porcentaje', 'importe')),
    valor          integer     NOT NULL CHECK (valor > 0) , -- porcentaje: 1–100 · importe: cents
    limite         integer,
    caduca         timestamptz,
    activo         boolean     NOT NULL DEFAULT true,
    usos           integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, codigo)
);

-- One registration attempt; it becomes an athlete (origen = propia) when paid (or free / reserve).
CREATE TABLE inscripciones (
    id                uuid PRIMARY KEY,
    competition_id    uuid        NOT NULL,
    atleta_id         uuid REFERENCES atletas (id) ON DELETE SET NULL,
    datos             jsonb       NOT NULL,
    email             citext      NOT NULL,
    licencia          text        NOT NULL DEFAULT '',
    cuota             integer     NOT NULL,
    desc_cupon        integer     NOT NULL DEFAULT 0,
    desc_referido     integer     NOT NULL DEFAULT 0,
    total             integer     NOT NULL,
    cupon_id          uuid REFERENCES cupones (id) ON DELETE SET NULL,
    cupon_codigo      text        NOT NULL DEFAULT '',
    referido_id       uuid,
    estado            text        NOT NULL CHECK (estado IN ('pendiente_pago', 'pagada', 'gratuita', 'reserva', 'cancelada', 'fallida')),
    proveedor         text        NOT NULL DEFAULT '',
    sesion            text        NOT NULL DEFAULT '',
    pago              text        NOT NULL DEFAULT '',
    tarjeta           text        NOT NULL DEFAULT '',
    devuelto          integer     NOT NULL DEFAULT 0,
    consentimientos   jsonb       NOT NULL DEFAULT '{}',
    expira_at         timestamptz,
    pagada_at         timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inscripciones_estado ON inscripciones (competition_id, estado, created_at DESC);
CREATE INDEX inscripciones_sesion ON inscripciones (sesion) WHERE sesion <> '';
-- One live registration per licence (paid, free, reserve or a payment in progress).
CREATE UNIQUE INDEX inscripciones_licencia_viva ON inscripciones (competition_id, licencia)
    WHERE licencia <> '' AND estado IN ('pendiente_pago', 'pagada', 'gratuita', 'reserva');

CREATE TABLE referido_codigos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    atleta_id      uuid        NOT NULL UNIQUE REFERENCES atletas (id) ON DELETE CASCADE,
    inscripcion_id uuid REFERENCES inscripciones (id) ON DELETE SET NULL,
    codigo         text        NOT NULL,
    ajustes        jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, codigo)
);
ALTER TABLE inscripciones ADD CONSTRAINT inscripciones_referido FOREIGN KEY (referido_id) REFERENCES referido_codigos (id) ON DELETE SET NULL;

-- Each invitee who paid with a code; the referrer's reward is refunded on their own payment (capped at what they paid).
CREATE TABLE referido_usos (
    id             uuid PRIMARY KEY,
    codigo_id      uuid        NOT NULL REFERENCES referido_codigos (id) ON DELETE CASCADE,
    inscripcion_id uuid        NOT NULL UNIQUE REFERENCES inscripciones (id) ON DELETE CASCADE,
    recompensa     integer     NOT NULL,
    estado         text        NOT NULL CHECK (estado IN ('pendiente', 'devuelta', 'sin_devolucion', 'anulada', 'fallida')),
    devolucion     text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    devuelto_at    timestamptz
);

CREATE TABLE devoluciones (
    id             uuid PRIMARY KEY,
    inscripcion_id uuid        NOT NULL REFERENCES inscripciones (id) ON DELETE CASCADE,
    importe        integer     NOT NULL,
    motivo         text        NOT NULL CHECK (motivo IN ('referido', 'manual')),
    detalle        text        NOT NULL DEFAULT '',
    ref            text        NOT NULL DEFAULT '',
    por            text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- Webhook idempotency (Stripe retries; the simulated gateway can redeliver).
CREATE TABLE pagos_eventos (
    id          text PRIMARY KEY,
    tipo        text        NOT NULL,
    recibido_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE pagos_eventos;
DROP TABLE devoluciones;
DROP TABLE referido_usos;
ALTER TABLE inscripciones DROP CONSTRAINT inscripciones_referido;
DROP TABLE referido_codigos;
DROP TABLE inscripciones;
DROP TABLE cupones;
DROP TABLE inscripcion_config;
