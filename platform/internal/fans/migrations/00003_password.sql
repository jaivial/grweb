-- +goose Up
-- Contraseña de las cuentas de directo (público/atleta): argon2id en PHC (pkg/passhash), nunca texto plano.
-- '' = sin contraseña (cuenta anterior o recién creada): se fija tras canjear un enlace, que verifica el email.
ALTER TABLE fans ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';
-- Ventana para fijar una contraseña nueva abierta al canjear un enlace de «he olvidado mi contraseña».
ALTER TABLE fans ADD COLUMN IF NOT EXISTS password_reset_hasta timestamptz;

-- +goose Down
ALTER TABLE fans DROP COLUMN IF EXISTS password_reset_hasta;
ALTER TABLE fans DROP COLUMN IF EXISTS password_hash;
