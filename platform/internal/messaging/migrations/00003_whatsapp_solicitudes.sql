-- +goose Up
-- Alta de atleta: la foto en los emails (una URL firmada por variable) y la configuración de WhatsApp
-- (instancia de evo-weai creada desde el backoffice, teléfonos de aviso e interruptores del alta).

-- Una imagen propia en la plantilla (por defecto {{foto}}: la URL firmada de la foto de la solicitud).
ALTER TABLE plantillas ADD COLUMN imagen text NOT NULL DEFAULT '';
-- La nota del pie (por qué recibe este email): vacía ⇒ la de la plataforma.
ALTER TABLE plantillas ADD COLUMN nota text NOT NULL DEFAULT '';

-- Instancia de evo-weai de la competición: la crea «Sistema › WhatsApp» y messaging la usa para enviar.
CREATE TABLE whatsapp_instancia (
    competition_id  uuid        PRIMARY KEY,
    instancia       text        NOT NULL,
    url             text        NOT NULL DEFAULT '',
    numero          text        NOT NULL DEFAULT '',
    estado          text        NOT NULL DEFAULT 'sin_instancia'
                    CHECK (estado IN ('sin_instancia', 'conectando', 'conectado', 'desconectado', 'error')),
    conectado_desde timestamptz,
    creado_at       timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Teléfonos de los organizadores y los interruptores de los avisos del alta.
CREATE TABLE whatsapp_avisos (
    competition_id  uuid        PRIMARY KEY,
    telefonos       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    al_atleta       boolean     NOT NULL DEFAULT true,
    a_organizadores boolean     NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE whatsapp_avisos;
DROP TABLE whatsapp_instancia;
ALTER TABLE plantillas DROP COLUMN nota;
ALTER TABLE plantillas DROP COLUMN imagen;
