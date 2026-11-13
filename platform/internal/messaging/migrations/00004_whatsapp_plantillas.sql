-- +goose Up
-- WhatsApp templates (Figma 62 · «WhatsApp · plantillas Meta»): utility templates of the platform (seeded from the
-- catalogue) and the ones sent to review. Their state comes from the provider webhook (message_template_status_update).
CREATE TABLE whatsapp_plantillas (
    competition_id uuid        NOT NULL,
    nombre         text        NOT NULL,
    categoria      text        NOT NULL CHECK (categoria IN ('utilidad', 'marketing')),
    idioma         text        NOT NULL DEFAULT 'es_ES',
    cuerpo         text        NOT NULL,
    variables      jsonb       NOT NULL DEFAULT '[]',
    botones        jsonb       NOT NULL DEFAULT '[]',
    uso            text        NOT NULL DEFAULT '',
    estado         text        NOT NULL DEFAULT 'PENDING' CHECK (estado IN ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED')),
    calidad        text        NOT NULL DEFAULT '',
    meta_id        text        NOT NULL DEFAULT '',
    motivo         text        NOT NULL DEFAULT '',
    version        integer     NOT NULL DEFAULT 1,
    aprobada_at    timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, nombre)
);

-- +goose Down
DROP TABLE whatsapp_plantillas;
