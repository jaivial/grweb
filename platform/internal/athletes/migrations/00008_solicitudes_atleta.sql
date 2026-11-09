-- +goose Up
-- Public «alta de atleta» requests: each form fills one of these rows and a person of the team
-- reviews it (approve → the athlete and their profile are created/updated; reject → the request
-- and its private photo are deleted). Nothing is written to «atletas» until it is approved.
CREATE TABLE solicitudes_atleta (
    id                uuid PRIMARY KEY,
    competition_id    uuid        NOT NULL,
    -- Automatic match (licence → unique active email → name suggestion); the reviewer can change it.
    match_atleta_id   uuid        REFERENCES atletas (id) ON DELETE SET NULL,
    match_tipo        text        NOT NULL DEFAULT '' CHECK (match_tipo IN ('', 'licencia', 'email', 'nombre')),
    -- Data declared by the athlete (a snapshot: it never writes «atletas» or «perfiles»).
    licencia          text        NOT NULL DEFAULT '',
    nombre            text        NOT NULL,
    apellidos         text        NOT NULL DEFAULT '',
    email             citext      NOT NULL,
    telefono          text        NOT NULL DEFAULT '',
    sexo              text        NOT NULL CHECK (sexo IN ('F', 'M')),
    fecha_nacimiento  date,
    club              text        NOT NULL DEFAULT '',
    ciudad            text        NOT NULL DEFAULT '',
    frase             text        NOT NULL DEFAULT '',
    bio               text        NOT NULL DEFAULT '',
    instagram         text        NOT NULL DEFAULT '',
    entrenador        text        NOT NULL DEFAULT '',
    historial         text        NOT NULL DEFAULT '',
    marca_sq          numeric(5, 1),
    marca_bp          numeric(5, 1),
    marca_dl          numeric(5, 1),
    focal_x           smallint    NOT NULL DEFAULT 50,
    focal_y           smallint    NOT NULL DEFAULT 35,
    es_menor          boolean     NOT NULL DEFAULT false,
    -- Private file of the processed photo (the original is never stored) and its digest.
    foto_clave        text        NOT NULL DEFAULT '',
    foto_sha256       text        NOT NULL DEFAULT '',
    -- Signed authorisation of the guardian (minors): private file, never in the public library.
    autorizacion_clave text       NOT NULL DEFAULT '',
    -- Review.
    estado            text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'revision', 'aprobada', 'rechazada')),
    notas             text        NOT NULL DEFAULT '',
    motivo_rechazo    text        NOT NULL DEFAULT '',
    revisado_at       timestamptz,
    revisado_por      text        NOT NULL DEFAULT '',
    -- Proof of the consents: per box, its legal version, hash and whether it was ticked.
    consentimientos   jsonb       NOT NULL DEFAULT '{}',
    consentimiento_at timestamptz,
    ip                text        NOT NULL DEFAULT '',
    user_agent        text        NOT NULL DEFAULT '',
    version           integer     NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solicitudes_atleta_estado ON solicitudes_atleta (competition_id, estado, created_at DESC);
CREATE INDEX solicitudes_atleta_atleta ON solicitudes_atleta (match_atleta_id);
-- One live request per email: a second one gets «SOLICITUD_EN_CURSO».
CREATE UNIQUE INDEX solicitudes_atleta_email_viva ON solicitudes_atleta (competition_id, email)
    WHERE estado IN ('pendiente', 'revision');

-- +goose Down
DROP TABLE solicitudes_atleta;
