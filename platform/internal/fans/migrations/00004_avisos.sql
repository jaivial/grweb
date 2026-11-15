-- +goose Up
-- Avisos al público (Jaime 15-nov): baja de los avisos del directo y registro de lo ya enviado (una vez por cuenta y clave:
-- anuncio-juegos, anuncio-chat, horarios-publicados, competicion-cerca, directo-AAAA-MM-DD, bienvenida).
ALTER TABLE fans ADD COLUMN IF NOT EXISTS avisos_baja_at timestamptz;
CREATE TABLE IF NOT EXISTS fan_avisos (
    fan_id     uuid        NOT NULL REFERENCES fans (id) ON DELETE CASCADE,
    clave      text        NOT NULL,
    enviado_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fan_id, clave)
);

-- +goose Down
DROP TABLE IF EXISTS fan_avisos;
ALTER TABLE fans DROP COLUMN IF EXISTS avisos_baja_at;
