-- +goose Up
-- The design a message went out with (the outbox shows what was sent, not the template edited afterwards).
ALTER TABLE mensajes ADD COLUMN contenido jsonb;

-- +goose Down
ALTER TABLE mensajes DROP COLUMN contenido;
