-- +goose Up
-- Home sections: a draft that the team edits and the published copy the web reads (Figma page 54 · «Web · home»).
CREATE TABLE secciones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    clave           text        NOT NULL,
    orden           integer     NOT NULL DEFAULT 0,
    visible         boolean     NOT NULL DEFAULT true,
    borrador        jsonb       NOT NULL DEFAULT '{}',
    publicado       jsonb,
    publicado_at    timestamptz,
    version         integer     NOT NULL DEFAULT 1,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, clave)
);
CREATE TABLE secciones_versiones (
    id            uuid PRIMARY KEY,
    seccion_id    uuid        NOT NULL REFERENCES secciones (id) ON DELETE CASCADE,
    datos         jsonb       NOT NULL,
    publicado_por uuid,
    publicado_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE faq (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    categoria       text        NOT NULL DEFAULT 'General',
    pregunta        text        NOT NULL,
    respuesta       text        NOT NULL,
    orden           integer     NOT NULL DEFAULT 0,
    destacada       boolean     NOT NULL DEFAULT false,
    publicada       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faq_comp ON faq (competition_id, orden);

CREATE TABLE patrocinadores (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    nombre          text        NOT NULL,
    nivel           text        NOT NULL DEFAULT 'colaborador' CHECK (nivel IN ('principal', 'oro', 'plata', 'colaborador', 'institucional')),
    logo_url        text        NOT NULL DEFAULT '',
    url             text        NOT NULL DEFAULT '',
    orden           integer     NOT NULL DEFAULT 0,
    activo          boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seo (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    ruta            text        NOT NULL,
    title           text        NOT NULL DEFAULT '',
    description     text        NOT NULL DEFAULT '',
    imagen_url      text        NOT NULL DEFAULT '',
    indexable       boolean     NOT NULL DEFAULT true,
    orden           integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, ruta)
);

CREATE TABLE redirecciones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    desde           text        NOT NULL,
    hacia           text        NOT NULL,
    codigo          smallint    NOT NULL DEFAULT 301 CHECK (codigo IN (301, 302, 308)),
    orden           integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, desde)
);

-- Legal texts are versioned and immutable once published; the newest published one is in force.
CREATE TABLE legal (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    tipo            text        NOT NULL CHECK (tipo IN ('privacidad', 'terminos', 'cookies', 'consentimiento', 'bases-sorteo')),
    version         text        NOT NULL,
    titulo          text        NOT NULL,
    contenido       text        NOT NULL,
    hash            text        NOT NULL,
    publicado_at    timestamptz,
    publicado_por   uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, tipo, version)
);

-- Content pages (reglamento, categorías, marcas mínimas, público, clubs…) and blog posts.
CREATE TABLE paginas (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    tipo            text        NOT NULL DEFAULT 'pagina' CHECK (tipo IN ('pagina', 'blog')),
    slug            text        NOT NULL,
    titulo          text        NOT NULL,
    resumen         text        NOT NULL DEFAULT '',
    cuerpo          text        NOT NULL DEFAULT '',
    portada_url     text        NOT NULL DEFAULT '',
    publicada       boolean     NOT NULL DEFAULT false,
    publicar_at     timestamptz,
    orden           integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, tipo, slug)
);

CREATE TABLE albumes (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    titulo          text        NOT NULL,
    slug            text        NOT NULL,
    fotos           jsonb       NOT NULL DEFAULT '[]',
    publicado       boolean     NOT NULL DEFAULT false,
    orden           integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, slug)
);

-- Volunteer applications from the public form (minors need a guardian authorisation).
CREATE TABLE voluntarios (
    id                uuid PRIMARY KEY,
    competition_id    uuid        NOT NULL,
    nombre            text        NOT NULL,
    email             citext      NOT NULL,
    telefono          text        NOT NULL DEFAULT '',
    disponibilidad    text        NOT NULL DEFAULT '',
    puesto            text        NOT NULL DEFAULT '',
    es_menor          boolean     NOT NULL DEFAULT false,
    autorizacion_url  text        NOT NULL DEFAULT '',
    notas             text        NOT NULL DEFAULT '',
    estado            text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'descartado')),
    consentimiento_at timestamptz NOT NULL,
    legal_version     text        NOT NULL DEFAULT '',
    orden             integer     NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Uploaded files (served by GET /api/medios/{id}); focal point drives object-position in the web.
CREATE TABLE medios (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    nombre          text        NOT NULL,
    tipo            text        NOT NULL,
    bytes           bigint      NOT NULL,
    ancho           integer     NOT NULL DEFAULT 0,
    alto            integer     NOT NULL DEFAULT 0,
    focal_x         smallint    NOT NULL DEFAULT 50,
    focal_y         smallint    NOT NULL DEFAULT 50,
    alt             text        NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE medios, voluntarios, albumes, paginas, legal, redirecciones, seo, patrocinadores, faq, secciones_versiones, secciones;
