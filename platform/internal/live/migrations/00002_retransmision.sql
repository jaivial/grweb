-- +goose Up
-- /en-directo shows the broadcast in every phase (scheduled, live, replay) unless the organiser hides it
-- (Backoffice › Directo › Retransmisión).
ALTER TABLE estado ADD COLUMN stream_visible boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE estado DROP COLUMN stream_visible;
