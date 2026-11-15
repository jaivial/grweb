-- +goose Up
-- One editor for email and WhatsApp (16-nov): the WhatsApp message of a campaign is derived from the email design
-- unless the team (or the assistant) writes its own version, built from the email or from pasted HTML. The buttons
-- go out as real URL buttons (evo-weai sendButtons) and as «texto: enlace» lines when the gateway refuses them.
ALTER TABLE campanas ADD COLUMN wa_personalizado jsonb;
ALTER TABLE campanas ADD COLUMN wa_botones jsonb NOT NULL DEFAULT '[]';

-- +goose Down
ALTER TABLE campanas DROP COLUMN wa_botones;
ALTER TABLE campanas DROP COLUMN wa_personalizado;
