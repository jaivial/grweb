-- +goose Up
-- Grupo de WhatsApp de los organizadores (p. ej. «FER CUP | Web.»): los avisos para organizadores también se envían,
-- una vez, al grupo elegido en «Avisos de solicitudes». Vacío = sin grupo.
ALTER TABLE whatsapp_avisos ADD COLUMN grupo_id text NOT NULL DEFAULT '';
ALTER TABLE whatsapp_avisos ADD COLUMN grupo_nombre text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE whatsapp_avisos DROP COLUMN grupo_nombre;
ALTER TABLE whatsapp_avisos DROP COLUMN grupo_id;
