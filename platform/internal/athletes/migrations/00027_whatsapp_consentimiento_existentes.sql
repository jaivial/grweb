-- +goose Up
-- Every athlete registered up to this deploy has the WhatsApp notices active and approved (Jaime, 27/11: they gave the
-- consent expressly to the organiser). Covers the ones added since 00026; a withdrawal from the backoffice is kept.
UPDATE atletas SET whatsapp_at = now(), whatsapp_version = '2026.11',
    whatsapp_origen = 'otorgado expresamente al organizador antes del alta'
WHERE whatsapp_at IS NULL AND whatsapp_origen <> 'retirado';

-- +goose Down
SELECT 1;
