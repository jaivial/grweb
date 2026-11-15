-- +goose Up
-- Backoffice › Directo › Retransmisión: the home page also shows the broadcast while the event is live (off by default).
ALTER TABLE estado ADD COLUMN stream_home boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE estado DROP COLUMN stream_home;
