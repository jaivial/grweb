-- +goose Up
-- Campaigns (Figma page 61 · «Contactos y campañas»): one design, two channels. The design is a list of blocks
-- (each one for both channels, email only or WhatsApp only); saving compiles the email HTML and derives the
-- WhatsApp text, so they never diverge. The audience is a crm segment with the channel consent always applied and
-- the suppressions excluded; it is frozen into campana_destinatarios when sending starts (resumable, no duplicates).

CREATE TABLE campanas (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    nombre         text        NOT NULL,
    asunto         text        NOT NULL DEFAULT '',
    preheader      text        NOT NULL DEFAULT '',
    canales        text[]      NOT NULL DEFAULT '{email}',
    estado         text        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'programada', 'enviando', 'pausada', 'enviada', 'cancelada')),
    diseno         jsonb       NOT NULL DEFAULT '[]',
    email_html     text        NOT NULL DEFAULT '',
    wa_texto       text        NOT NULL DEFAULT '',
    wa_imagen      text        NOT NULL DEFAULT '',
    segmento_id    uuid,
    segmento       text        NOT NULL DEFAULT '' ,
    email_por_min  integer     NOT NULL DEFAULT 120 CHECK (email_por_min BETWEEN 1 AND 600),
    wa_por_min     integer     NOT NULL DEFAULT 6 CHECK (wa_por_min BETWEEN 1 AND 60),
    programada_at  timestamptz,
    iniciada_at    timestamptz,
    terminada_at   timestamptz,
    version        integer     NOT NULL DEFAULT 1,
    creada_por     text        NOT NULL DEFAULT '',
    updated_por    text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campanas_lista ON campanas (competition_id, created_at DESC);
CREATE INDEX campanas_activas ON campanas (estado) WHERE estado IN ('programada', 'enviando');

-- Design history: every save and every AI change («Deshacer», restore).
CREATE TABLE campana_revisiones (
    id          uuid PRIMARY KEY,
    campana_id  uuid        NOT NULL REFERENCES campanas (id) ON DELETE CASCADE,
    diseno      jsonb       NOT NULL,
    autor       text        NOT NULL CHECK (autor IN ('usuario', 'ia')),
    por         text        NOT NULL DEFAULT '',
    modelo      text        NOT NULL DEFAULT '',
    nota        text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campana_revisiones_lista ON campana_revisiones (campana_id, created_at DESC);

-- One row per contact and channel. The address is kept only while it is needed to send: on a final state it is
-- replaced by its mask.
CREATE TABLE campana_destinatarios (
    id            uuid PRIMARY KEY,
    campana_id    uuid        NOT NULL REFERENCES campanas (id) ON DELETE CASCADE,
    contacto_id   uuid        NOT NULL,
    canal         text        NOT NULL CHECK (canal IN ('email', 'whatsapp')),
    destino       text        NOT NULL,
    mascara       text        NOT NULL DEFAULT '',
    nombre        text        NOT NULL DEFAULT '',
    baja_url      text        NOT NULL DEFAULT '',
    estado        text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'entregado', 'leido', 'fallido', 'rebotado', 'cancelado')),
    intentos      integer     NOT NULL DEFAULT 0,
    proximo_at    timestamptz NOT NULL DEFAULT now(),
    proveedor_id  text        NOT NULL DEFAULT '',
    detalle       text        NOT NULL DEFAULT '',
    enviado_at    timestamptz,
    entregado_at  timestamptz,
    leido_at      timestamptz,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campana_id, contacto_id, canal)
);
CREATE INDEX campana_destinatarios_cola ON campana_destinatarios (campana_id, canal, proximo_at) WHERE estado = 'pendiente';
CREATE INDEX campana_destinatarios_proveedor ON campana_destinatarios (proveedor_id) WHERE proveedor_id <> '';

-- +goose Down
DROP TABLE campana_destinatarios;
DROP TABLE campana_revisiones;
DROP TABLE campanas;
