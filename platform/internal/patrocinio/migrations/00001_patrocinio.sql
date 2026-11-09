-- +goose Up
-- Sponsor banners of the live chat (Figma pages 70 and 73): tiers with weights, the appearance record per día
-- (everyone out at least once), clicks (deduplicated per IP) and the service config.

CREATE TABLE banners (
    id               uuid        PRIMARY KEY,
    competition_id   uuid        NOT NULL,
    patrocinador     text        NOT NULL,
    imagen_url       text        NOT NULL,
    imagen_movil_url text        NOT NULL DEFAULT '',
    url_destino      text        NOT NULL,
    tier             text        NOT NULL DEFAULT 'bronce' CHECK (tier IN ('oro', 'plata', 'bronce')),
    activo           boolean     NOT NULL DEFAULT true,
    desde            timestamptz,
    hasta            timestamptz,
    orden            integer     NOT NULL DEFAULT 0,
    version          integer     NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX banners_comp ON banners (competition_id, activo, orden);

CREATE TABLE config_patrocinio (
    competition_id   uuid        PRIMARY KEY,
    intervalo_seg    integer     NOT NULL DEFAULT 90 CHECK (intervalo_seg BETWEEN 15 AND 3600),
    peso_oro         integer     NOT NULL DEFAULT 3 CHECK (peso_oro BETWEEN 0 AND 10),
    peso_plata       integer     NOT NULL DEFAULT 2 CHECK (peso_plata BETWEEN 0 AND 10),
    peso_bronce      integer     NOT NULL DEFAULT 1 CHECK (peso_bronce BETWEEN 0 AND 10),
    solo_en_directo  boolean     NOT NULL DEFAULT true,
    activo           boolean     NOT NULL DEFAULT false,
    version          integer     NOT NULL DEFAULT 1,
    updated_por      text        NOT NULL DEFAULT '',
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apariciones (
    id             uuid        PRIMARY KEY,
    competition_id uuid        NOT NULL,
    banner_id      uuid        NOT NULL,
    dia            date        NOT NULL,
    mostrado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX apariciones_dia ON apariciones (competition_id, dia, banner_id);

-- One counted click per banner, día and IP (the límite por IP); repeats insert nothing.
CREATE TABLE clics (
    id             uuid        PRIMARY KEY,
    competition_id uuid        NOT NULL,
    banner_id      uuid        NOT NULL,
    dia            date        NOT NULL,
    at             timestamptz NOT NULL DEFAULT now(),
    ip_hash        text        NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX clics_unico ON clics (banner_id, dia, ip_hash);
CREATE INDEX clics_informe ON clics (competition_id, dia, banner_id);

-- +goose Down
DROP TABLE clics;
DROP TABLE apariciones;
DROP TABLE config_patrocinio;
DROP TABLE banners;
