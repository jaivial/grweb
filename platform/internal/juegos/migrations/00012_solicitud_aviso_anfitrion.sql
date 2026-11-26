-- +goose Up
-- Aviso al anfitrión (email y WhatsApp) cuando alguien pide unirse a su sala de GRS Fantasy: como mucho uno por
-- jugador y sala (volver a pedirlo tras cancelar no lo repite).
ALTER TABLE sala_solicitudes ADD COLUMN IF NOT EXISTS anfitrion_avisado_at timestamptz;

-- +goose Down
ALTER TABLE sala_solicitudes DROP COLUMN IF EXISTS anfitrion_avisado_at;
