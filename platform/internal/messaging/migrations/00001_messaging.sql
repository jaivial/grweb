-- +goose Up
-- Transactional email (Figma page 62 · «Emails y avisos»): templates edited per competition (the defaults live in
-- code), the outbox with retries, automation switches and the SMTP state. competition_id = nil uuid for platform
-- emails (backoffice access, team invitations).

CREATE TABLE plantillas (
    competition_id uuid        NOT NULL,
    clave          text        NOT NULL,
    asunto         text        NOT NULL,
    preheader      text        NOT NULL DEFAULT '',
    titulo         text        NOT NULL,
    cuerpo         text        NOT NULL,
    boton_texto    text        NOT NULL DEFAULT '',
    boton_url      text        NOT NULL DEFAULT '',
    pie            text        NOT NULL DEFAULT '',
    version        integer     NOT NULL DEFAULT 1,
    updated_por    text        NOT NULL DEFAULT '',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, clave)
);

-- State of a template per competition (active by default; paused by hand or by a render error).
CREATE TABLE plantilla_estado (
    competition_id uuid        NOT NULL,
    clave          text        NOT NULL,
    estado         text        NOT NULL CHECK (estado IN ('activa', 'pausada', 'error')),
    error          text        NOT NULL DEFAULT '',
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competition_id, clave)
);

CREATE TABLE mensajes (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    evento_id      uuid        UNIQUE,
    canal          text        NOT NULL DEFAULT 'email' CHECK (canal IN ('email', 'whatsapp')),
    plantilla      text        NOT NULL,
    destino        citext      NOT NULL,
    vars           jsonb       NOT NULL DEFAULT '{}',
    prueba         boolean     NOT NULL DEFAULT false,
    asunto         text        NOT NULL DEFAULT '',
    estado         text        NOT NULL DEFAULT 'en_cola' CHECK (estado IN ('en_cola', 'enviando', 'enviado', 'reintentando', 'rebotado', 'fallido', 'cancelado', 'omitido')),
    intentos       integer     NOT NULL DEFAULT 0,
    proximo_at     timestamptz NOT NULL DEFAULT now(),
    proveedor_id   text        NOT NULL DEFAULT '',
    detalle        text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    enviado_at     timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensajes_cola ON mensajes (proximo_at) WHERE estado IN ('en_cola', 'reintentando');
CREATE INDEX mensajes_lista ON mensajes (competition_id, created_at DESC);

-- Automation switches (all on by default) and the global «pause non-essential during the event».
CREATE TABLE automatizaciones (
    competition_id uuid    NOT NULL,
    clave          text    NOT NULL,
    activa         boolean NOT NULL,
    PRIMARY KEY (competition_id, clave)
);
CREATE TABLE ajustes (
    competition_id   uuid PRIMARY KEY,
    pausar_en_evento boolean NOT NULL DEFAULT true,
    ritmo_minuto     integer NOT NULL DEFAULT 120 CHECK (ritmo_minuto BETWEEN 1 AND 2000)
);

-- Addresses that bounced for good (or are malformed): never tried again.
CREATE TABLE destinos_invalidos (
    destino    citext PRIMARY KEY,
    tipo       text        NOT NULL CHECK (tipo IN ('rebote', 'email_invalido')),
    motivo     text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Last known SMTP state per competition (the backoffice banner and the circuit breaker).
CREATE TABLE smtp_estado (
    competition_id uuid PRIMARY KEY,
    ok             boolean     NOT NULL,
    servidor       text        NOT NULL DEFAULT '',
    error          text        NOT NULL DEFAULT '',
    ultimo_envio   timestamptz,
    cambiado_at    timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE smtp_estado;
DROP TABLE destinos_invalidos;
DROP TABLE ajustes;
DROP TABLE automatizaciones;
DROP TABLE mensajes;
DROP TABLE plantilla_estado;
DROP TABLE plantillas;
