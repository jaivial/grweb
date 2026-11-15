-- +goose Up
-- Sections belong to a page built from sections: the home and the /publico and /en landings
-- (Figma pages 03, 29 and 35), each with its own draft → publish flow.
ALTER TABLE secciones ADD COLUMN pagina text NOT NULL DEFAULT 'home';
ALTER TABLE secciones DROP CONSTRAINT secciones_competition_id_clave_key;
ALTER TABLE secciones ADD CONSTRAINT secciones_pagina_clave_key UNIQUE (competition_id, pagina, clave);

-- Club directory of /clubs (Figma page 32). Public submissions arrive as «pendiente» and are moderated.
CREATE TABLE clubs (
    id                uuid PRIMARY KEY,
    competition_id    uuid        NOT NULL,
    nombre            text        NOT NULL,
    ciudad            text        NOT NULL DEFAULT '',
    provincia         text        NOT NULL DEFAULT '',
    logo_url          text        NOT NULL DEFAULT '',
    web               text        NOT NULL DEFAULT '',
    instagram         text        NOT NULL DEFAULT '',
    etiquetas         text        NOT NULL DEFAULT '',
    rol               text        NOT NULL DEFAULT 'club' CHECK (rol IN ('organizador', 'colaborador', 'club')),
    afiliado_aep      boolean     NOT NULL DEFAULT false,
    estado            text        NOT NULL DEFAULT 'publicado' CHECK (estado IN ('publicado', 'pendiente', 'oculto')),
    contacto_email    text        NOT NULL DEFAULT '',
    consentimiento_at timestamptz,
    legal_version     text        NOT NULL DEFAULT '',
    orden             integer     NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clubs_competition_estado ON clubs (competition_id, estado, orden);

-- +goose Down
DROP TABLE clubs;
DELETE FROM secciones WHERE pagina <> 'home';
ALTER TABLE secciones DROP CONSTRAINT secciones_pagina_clave_key;
ALTER TABLE secciones ADD CONSTRAINT secciones_competition_id_clave_key UNIQUE (competition_id, clave);
ALTER TABLE secciones DROP COLUMN pagina;
