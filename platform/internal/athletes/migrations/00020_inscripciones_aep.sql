-- +goose Up
-- BIZ-210 · Padrón AEP: the published AEP lists of entries (one xlsx per competition level) are the roll of each
-- competition and level. A person is identified by competition, level, normalised name and birth year, so a
-- reimport updates the same row. openlifter_lifter_id is the entry of the level's OpenLifter meet; atleta_id and
-- estado_enlace are the link with an athlete of the platform (BIZ-211).
CREATE TABLE inscripciones_aep (
    id                   uuid PRIMARY KEY,
    competition_id       uuid        NOT NULL,
    nivel                text        NOT NULL CHECK (nivel IN ('aep2', 'aep3')),
    nombre               text        NOT NULL,
    apellidos            text        NOT NULL DEFAULT '',
    nombre_norm          text        NOT NULL,
    sexo                 text        NOT NULL CHECK (sexo IN ('M', 'F')),
    anio                 integer     NOT NULL,
    club                 text        NOT NULL DEFAULT '',
    division             text        NOT NULL DEFAULT '',
    equipamiento         text        NOT NULL DEFAULT 'raw' CHECK (equipamiento IN ('raw', 'equipado')),
    categoria            text        NOT NULL,
    total_anterior       numeric(7, 2),
    fila                 integer     NOT NULL DEFAULT 0,
    openlifter_lifter_id integer,
    atleta_id            uuid,
    estado_enlace        text        NOT NULL DEFAULT 'pendiente' CHECK (estado_enlace IN ('pendiente', 'auto', 'sugerido', 'manual', 'rechazado')),
    importado_por        text        NOT NULL DEFAULT '',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inscripciones_aep_persona ON inscripciones_aep (competition_id, nivel, nombre_norm, anio);
CREATE INDEX inscripciones_aep_atleta ON inscripciones_aep (atleta_id) WHERE atleta_id IS NOT NULL;

-- +goose Down
DROP TABLE inscripciones_aep;
