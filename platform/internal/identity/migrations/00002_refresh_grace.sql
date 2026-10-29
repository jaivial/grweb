-- +goose Up
-- Grace window for concurrent refreshes (several backoffice tabs share the refresh cookie):
-- the immediately previous secret is accepted for a few seconds without revoking the session.
ALTER TABLE sesiones ADD COLUMN prev_hash bytea, ADD COLUMN rotated_at timestamptz;

-- +goose Down
ALTER TABLE sesiones DROP COLUMN prev_hash, DROP COLUMN rotated_at;
