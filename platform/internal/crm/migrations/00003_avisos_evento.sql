-- +goose Up
-- BIZ-165: «Avísame» de las próximas competiciones (GRS Cup 3). Un email por evento y competición, sin duplicados.
CREATE TABLE IF NOT EXISTS avisos_evento (
    competicion_id uuid        NOT NULL,
    evento         text        NOT NULL,
    email          text        NOT NULL,
    creado_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (competicion_id, evento, email)
);

-- +goose Down
DROP TABLE IF EXISTS avisos_evento;
