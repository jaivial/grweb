-- +goose Up
-- WhatsApp consent on the athlete record (besides the box of the alta): the organiser can record a consent given to
-- them outside the form. The athletes registered so far gave it expressly to the organiser before being added (Jaime,
-- 26/11): it is recorded for all of them, with that origin. Version 2026.11 = the «Texto de avisos por WhatsApp»
-- published by cms 00041.
ALTER TABLE atletas
    ADD COLUMN whatsapp_at      timestamptz,
    ADD COLUMN whatsapp_version text NOT NULL DEFAULT '',
    ADD COLUMN whatsapp_origen  text NOT NULL DEFAULT '';

UPDATE atletas SET whatsapp_at = now(), whatsapp_version = '2026.11',
    whatsapp_origen = 'otorgado expresamente al organizador antes del alta'
WHERE whatsapp_at IS NULL;

-- +goose Down
ALTER TABLE atletas DROP COLUMN whatsapp_origen, DROP COLUMN whatsapp_version, DROP COLUMN whatsapp_at;
