-- +goose Up
-- «Tu perfil de atleta ya existe» (Jaime 25-nov): when the access was sent (the batch never sends it twice unless asked)
-- and whether the password is the admin-issued initial one (the area asks to change it on the first login).
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS acceso_enviado_at timestamptz;
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS password_temporal boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE atletas DROP COLUMN IF EXISTS password_temporal;
ALTER TABLE atletas DROP COLUMN IF EXISTS acceso_enviado_at;
