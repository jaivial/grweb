-- +goose Up
-- D-RIFA (Figma 07 «Rifa · escaparate» and 60 · BO): the raffle is only at the venue and in cash. The public page shows
-- the objects that are raffled (managed in the backoffice) and the cash ticket info; nothing is sold online.

CREATE TABLE rifa_items (
    id                   uuid PRIMARY KEY,
    competition_id       uuid        NOT NULL,
    nombre               text        NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
    descripcion          text        NOT NULL DEFAULT '',
    imagen_url           text,
    valor_estimado_cents integer CHECK (valor_estimado_cents >= 0),
    donante              text,
    unidades             integer     NOT NULL DEFAULT 1 CHECK (unidades >= 1),
    orden                integer     NOT NULL,
    visible              boolean     NOT NULL DEFAULT true,
    ganador_boleto       text,
    ganador_nombre       text,
    ganador_at           timestamptz,
    version              integer     NOT NULL DEFAULT 1,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rifa_items_orden ON rifa_items (competition_id, orden);
CREATE INDEX rifa_items_visibles ON rifa_items (competition_id, orden) WHERE visible;

CREATE TABLE rifa_config (
    competition_id               uuid PRIMARY KEY,
    precio_boleto_efectivo_cents integer     NOT NULL DEFAULT 200 CHECK (precio_boleto_efectivo_cents BETWEEN 0 AND 100000),
    texto_info                   text        NOT NULL DEFAULT '',
    lugar                        text        NOT NULL DEFAULT '',
    horario                      text        NOT NULL DEFAULT '',
    fecha_sorteo                 timestamptz,
    visible                      boolean     NOT NULL DEFAULT true,
    version                      integer     NOT NULL DEFAULT 1,
    updated_por                  text        NOT NULL DEFAULT '',
    updated_at                   timestamptz NOT NULL DEFAULT now()
);

-- Keep the ticket price and the draw date already configured for the old online sale.
INSERT INTO rifa_config (competition_id, precio_boleto_efectivo_cents, fecha_sorteo, updated_por)
SELECT competition_id, precio, fecha_sorteo, 'Migración 00002' FROM config ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE rifa_config;
DROP TABLE rifa_items;
