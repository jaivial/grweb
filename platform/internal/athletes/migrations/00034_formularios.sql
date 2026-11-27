-- +goose Up
-- Formularios (backoffice → email / WhatsApp → web): el formulario (esquema jsonb con su versión), sus versiones, los
-- envíos, los destinatarios (un atleta por formulario), las entregas por canal y la respuesta de cada destinatario.
-- El esquema se valida en la aplicación (pkg/formularios); aquí solo van los límites que protegen los datos.
CREATE TABLE formularios (
    id             uuid        PRIMARY KEY,
    competition_id uuid        NOT NULL,
    nombre         text        NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 160),
    estado         text        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activo', 'cerrado')),
    esquema        jsonb       NOT NULL CHECK (jsonb_typeof(esquema) = 'object'),
    version        int         NOT NULL DEFAULT 1 CHECK (version >= 1),
    email          jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(email) = 'object'),
    whatsapp       jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(whatsapp) = 'object'),
    creado_por     text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX formularios_competicion ON formularios (competition_id, updated_at DESC);

-- Cada versión del esquema (se crea al guardar un esquema distinto): las respuestas siguen siendo legibles.
CREATE TABLE formulario_versiones (
    formulario_id uuid        NOT NULL REFERENCES formularios (id) ON DELETE CASCADE,
    version       int         NOT NULL CHECK (version >= 1),
    esquema       jsonb       NOT NULL CHECK (jsonb_typeof(esquema) = 'object'),
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (formulario_id, version)
);

CREATE TABLE formulario_envios (
    id             uuid        PRIMARY KEY,
    formulario_id  uuid        NOT NULL REFERENCES formularios (id) ON DELETE CASCADE,
    competition_id uuid        NOT NULL,
    canales        text[]      NOT NULL DEFAULT '{}' CHECK (canales <@ ARRAY['email', 'whatsapp']::text[]),
    filtro         jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filtro) = 'object'),
    total          int         NOT NULL DEFAULT 0 CHECK (total >= 0),
    omitidos       int         NOT NULL DEFAULT 0 CHECK (omitidos >= 0),
    creado_por     text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    -- Idempotency-Key del POST de envío: el mismo formulario y la misma clave devuelven el envío ya creado.
    clave_idempotencia text    NULL CHECK (clave_idempotencia IS NULL OR char_length(clave_idempotencia) BETWEEN 1 AND 80),
    -- Huella del envío: sha256 hex de los canales ordenados y del filtro canónico. Una clave repetida con otra huella es
    -- un error (422), y un envío igual hace menos de dos minutos pide confirmación (409).
    huella         text        NOT NULL CHECK (char_length(huella) = 64)
);
CREATE INDEX formulario_envios_formulario ON formulario_envios (formulario_id, created_at DESC);
CREATE UNIQUE INDEX formulario_envios_idempotencia ON formulario_envios (formulario_id, clave_idempotencia);
CREATE INDEX formulario_envios_huella ON formulario_envios (formulario_id, huella, created_at DESC);

-- Un destinatario por (formulario, atleta). Su token se deriva con la clave del servicio: no se guarda.
CREATE TABLE formulario_destinatarios (
    id             uuid        PRIMARY KEY,
    formulario_id  uuid        NOT NULL REFERENCES formularios (id) ON DELETE CASCADE,
    competition_id uuid        NOT NULL,
    atleta_id      uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    abierto_at     timestamptz,
    UNIQUE (formulario_id, atleta_id)
);
CREATE INDEX formulario_destinatarios_atleta ON formulario_destinatarios (atleta_id);

-- Archivos subidos por un destinatario en un campo de archivo. La subida reserva su fila en estado 'subiendo' (url vacía)
-- antes de enviar el archivo al CDN, y la pasa a 'ok' con su url cuando el CDN responde (o la borra si falla). La
-- respuesta solo acepta archivos 'ok' que existan aquí para ese destinatario y campo.
CREATE TABLE formulario_archivos (
    id              uuid        PRIMARY KEY,
    destinatario_id uuid        NOT NULL REFERENCES formulario_destinatarios (id) ON DELETE CASCADE,
    campo_id        text        NOT NULL CHECK (char_length(campo_id) BETWEEN 1 AND 40),
    url             text        NOT NULL CHECK (char_length(url) <= 2000),
    nombre          text        NOT NULL CHECK (char_length(nombre) <= 255),
    tamano          bigint      NOT NULL CHECK (tamano >= 0),
    tipo            text        NOT NULL,
    estado          text        NOT NULL DEFAULT 'subiendo' CHECK (estado IN ('subiendo', 'ok')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((estado = 'ok' AND char_length(url) BETWEEN 1 AND 2000) OR (estado = 'subiendo' AND url = ''))
);
CREATE INDEX formulario_archivos_destinatario ON formulario_archivos (destinatario_id, campo_id, created_at);

CREATE TABLE formulario_entregas (
    id              uuid        PRIMARY KEY,
    envio_id        uuid        NOT NULL REFERENCES formulario_envios (id) ON DELETE CASCADE,
    destinatario_id uuid        NOT NULL REFERENCES formulario_destinatarios (id) ON DELETE CASCADE,
    canal           text        NOT NULL CHECK (canal IN ('email', 'whatsapp')),
    evento_id       uuid        UNIQUE,
    estado          text        NOT NULL CHECK (estado IN ('encolado', 'omitido')),
    motivo          text        NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX formulario_entregas_envio ON formulario_entregas (envio_id);

-- La respuesta de un destinatario: datos por id de campo, archivos aparte y la versión con la que se contestó.
CREATE TABLE formulario_respuestas (
    id              uuid        PRIMARY KEY,
    formulario_id   uuid        NOT NULL REFERENCES formularios (id) ON DELETE CASCADE,
    destinatario_id uuid        NOT NULL UNIQUE REFERENCES formulario_destinatarios (id) ON DELETE CASCADE,
    atleta_id       uuid        NOT NULL,
    competition_id  uuid        NOT NULL,
    version         int         NOT NULL CHECK (version >= 1),
    datos           jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(datos) = 'object'),
    archivos        jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(archivos) = 'array'),
    estado          text        NOT NULL CHECK (estado IN ('parcial', 'completa')),
    porcentaje      int         NOT NULL DEFAULT 0 CHECK (porcentaje BETWEEN 0 AND 100),
    origen          text        NOT NULL CHECK (origen IN ('web', 'email')),
    enviado_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX formulario_respuestas_formulario ON formulario_respuestas (formulario_id, estado);

-- +goose Down
DROP TABLE IF EXISTS formulario_respuestas;
DROP TABLE IF EXISTS formulario_archivos;
DROP TABLE IF EXISTS formulario_entregas;
DROP TABLE IF EXISTS formulario_destinatarios;
DROP TABLE IF EXISTS formulario_envios;
DROP TABLE IF EXISTS formulario_versiones;
DROP TABLE IF EXISTS formularios;
