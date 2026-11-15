-- +goose Up
-- BIZ-143: the magic link remembers where the fan was going (an invitation to a fantasy room), so the redemption
-- can send him back there, also when the email is opened on another device.
ALTER TABLE accesos ADD COLUMN next text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE accesos DROP COLUMN next;
