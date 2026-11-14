-- +goose Up
-- Contraseña de las cuentas de directo (público/atleta): argon2id en PHC (pkg/passhash), nunca texto plano.
-- '' = cuenta anterior sin contraseña: la fija canjeando un enlace pedido con contraseña (verifica el email).
ALTER TABLE fans ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';
-- The hash of the password chosen when asking for the link; it is applied to the account when the link is redeemed.
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE accesos DROP COLUMN password_hash;
ALTER TABLE fans DROP COLUMN password_hash;
