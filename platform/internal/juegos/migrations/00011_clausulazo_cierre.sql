-- +goose Up
-- Cierre de los clausulazos (Juegos › Configuración): por defecto, al empezar la última sesión del horario del último
-- día; con «manual», el último día a la hora elegida (Europe/Madrid).
ALTER TABLE config_juegos ADD COLUMN IF NOT EXISTS clausulazo_cierre_manual boolean NOT NULL DEFAULT false;
ALTER TABLE config_juegos ADD COLUMN IF NOT EXISTS clausulazo_cierre_hora time;

-- +goose Down
ALTER TABLE config_juegos DROP COLUMN IF EXISTS clausulazo_cierre_hora;
ALTER TABLE config_juegos DROP COLUMN IF EXISTS clausulazo_cierre_manual;
