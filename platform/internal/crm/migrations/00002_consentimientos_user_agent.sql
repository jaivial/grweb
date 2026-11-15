-- +goose Up
-- Prueba del consentimiento: el navegador desde el que se aceptó (además de la IP anonimizada).
ALTER TABLE consentimientos ADD COLUMN user_agent text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE consentimientos DROP COLUMN user_agent;
