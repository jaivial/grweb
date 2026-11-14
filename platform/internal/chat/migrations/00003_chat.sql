-- +goose Up
-- Interruptor «Chat activo» del backoffice (una sola sala por competición): apagado, el chat público muestra
-- «El chat está durmiendo» y enviar responde 403 chat_disabled.
ALTER TABLE config_chat ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE config_chat DROP COLUMN IF EXISTS chat_enabled;
