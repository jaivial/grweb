-- +goose Up
-- Two-step verification (TOTP, Figma 63): encrypted secret (pending until confirmed), activation time and
-- the hashes of the one-time recovery codes. Roles can require it (exige_2fa).
ALTER TABLE usuarios
    ADD COLUMN totp_secreto bytea,
    ADD COLUMN totp_activado_at timestamptz,
    ADD COLUMN codigos_recuperacion text[] NOT NULL DEFAULT '{}';
ALTER TABLE roles ADD COLUMN exige_2fa boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE roles DROP COLUMN exige_2fa;
ALTER TABLE usuarios DROP COLUMN totp_secreto, DROP COLUMN totp_activado_at, DROP COLUMN codigos_recuperacion;
