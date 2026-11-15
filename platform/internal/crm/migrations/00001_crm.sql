-- +goose Up
-- Contacts of a competition (Figma page 61 · «Contactos»): people who registered, follow an athlete, volunteered or
-- subscribed to the news, with the proof of each consent, unsubscribes and bounces (suppressions), segments and
-- an activity timeline. Personal data lives only here and in the service that collected it.

CREATE TABLE contactos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    email          citext,
    telefono       text,
    nombre         text        NOT NULL DEFAULT '',
    origen         text        NOT NULL DEFAULT 'web',
    etiquetas      text[]      NOT NULL DEFAULT '{}',
    -- {"atleta": true, "sigue": ["Laura Gómez Ruiz"], "voluntario": true, "reserva": true, "novedades": true}
    relacion       jsonb       NOT NULL DEFAULT '{}',
    anonimizado_at timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    actividad_at   timestamptz NOT NULL DEFAULT now(),
    version        integer     NOT NULL DEFAULT 1,
    CHECK (email IS NOT NULL OR telefono IS NOT NULL OR anonimizado_at IS NOT NULL)
);
CREATE UNIQUE INDEX contactos_email ON contactos (competition_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX contactos_telefono ON contactos (competition_id, telefono) WHERE telefono IS NOT NULL;
CREATE INDEX contactos_lista ON contactos (competition_id, actividad_at DESC);

-- One row per purpose: the exact text accepted (version + hash), where, when, the anonymised IP and the double
-- opt-in. Never pre-ticked; revoking keeps the proof.
CREATE TABLE consentimientos (
    id              uuid PRIMARY KEY,
    contacto_id     uuid        NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
    finalidad       text        NOT NULL CHECK (finalidad IN ('privacidad', 'novedades_email', 'avisos_whatsapp', 'imagen', 'avisos_atleta')),
    canal           text        NOT NULL DEFAULT '' CHECK (canal IN ('', 'email', 'whatsapp')),
    estado          text        NOT NULL CHECK (estado IN ('pendiente', 'confirmado', 'revocado')),
    texto_version   text        NOT NULL DEFAULT '',
    texto_hash      text        NOT NULL DEFAULT '',
    origen          text        NOT NULL DEFAULT '',
    ip              text        NOT NULL DEFAULT '',
    aceptado_at     timestamptz NOT NULL DEFAULT now(),
    doi_at          timestamptz,
    revocado_at     timestamptz,
    revocado_motivo text        NOT NULL DEFAULT '',
    token_hash      text        NOT NULL DEFAULT '',
    recordado_at    timestamptz,
    UNIQUE (contacto_id, finalidad)
);
CREATE INDEX consentimientos_token ON consentimientos (token_hash) WHERE token_hash <> '';

-- Never send to these destinations. The destination is kept as a hash (it must survive the erasure of the contact)
-- plus a mask for the backoffice.
CREATE TABLE supresiones (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    canal           text        NOT NULL CHECK (canal IN ('email', 'whatsapp')),
    destino_hash    text        NOT NULL,
    destino_mascara text        NOT NULL,
    contacto_id     uuid,
    tipo            text        NOT NULL CHECK (tipo IN ('baja', 'email_invalido', 'whatsapp_invalido', 'rebote')),
    motivo          text        NOT NULL DEFAULT '',
    origen          text        NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, canal, destino_hash)
);

CREATE TABLE segmentos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    nombre         text        NOT NULL,
    condiciones    jsonb       NOT NULL DEFAULT '[]',
    ultimo_uso     text        NOT NULL DEFAULT '',
    version        integer     NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, nombre)
);

CREATE TABLE actividad (
    id          uuid PRIMARY KEY,
    contacto_id uuid        NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
    tipo        text        NOT NULL,
    titulo      text        NOT NULL,
    detalle     text        NOT NULL DEFAULT '',
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX actividad_contacto ON actividad (contacto_id, at DESC);

-- +goose Down
DROP TABLE actividad;
DROP TABLE segmentos;
DROP TABLE supresiones;
DROP TABLE consentimientos;
DROP TABLE contactos;
