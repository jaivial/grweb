-- +goose Up
-- Stripe Connect: the connected account of each competition (acct_…, a Stripe identifier, not a secret) and its
-- last known onboarding state, refreshed from Stripe when the backoffice reads it and by the account.updated webhook.
CREATE TABLE stripe_connect (
    competition_id  uuid        PRIMARY KEY REFERENCES competiciones (id) ON DELETE CASCADE,
    cuenta          text        NOT NULL UNIQUE,
    estado          text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'verificando', 'restringida', 'activa')),
    cobros          boolean     NOT NULL DEFAULT false,
    pagos           boolean     NOT NULL DEFAULT false,
    datos_enviados  boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE stripe_connect;
