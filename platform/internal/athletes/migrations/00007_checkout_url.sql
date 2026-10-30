-- +goose Up
-- Payment page of a registration in progress: «Reintentar el pago» after cancelling or a declined card (Figma 06b).
ALTER TABLE inscripciones ADD COLUMN checkout_url text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE inscripciones DROP COLUMN checkout_url;
