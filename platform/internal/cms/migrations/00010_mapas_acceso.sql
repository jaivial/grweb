-- +goose Up
-- Access maps of /mapa-de-accesos: images the staff uploads for athletes and public (the file lives in the CDN,
-- only its URL is kept), shown in this order with an optional title, subtitle and description.
CREATE TABLE mapas_acceso (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    imagen_url      text        NOT NULL,
    titulo          text        NOT NULL DEFAULT '',
    subtitulo       text        NOT NULL DEFAULT '',
    descripcion     text        NOT NULL DEFAULT '',
    orden           integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mapas_acceso_comp_idx ON mapas_acceso (competition_id, orden);

-- +goose Down
DROP TABLE mapas_acceso;
