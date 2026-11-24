-- +goose Up
-- BIZ-159: FER Entrenamiento official logo, every competition.
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/FER-Entrenamiento-logo-sin-fondo.webp', updated_at = now() WHERE nombre = 'FER Entrenamiento';

-- +goose Down
-- Data change: previous logo can be restored from the backoffice.
SELECT 1;
