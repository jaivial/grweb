-- +goose Up
-- Athlete area: optional password (email + password login besides the email link).
ALTER TABLE atletas ADD COLUMN password_hash text;

-- +goose Down
ALTER TABLE atletas DROP COLUMN password_hash;
