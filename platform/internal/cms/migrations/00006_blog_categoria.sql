-- +goose Up
-- /blog (Figma 34): category of a post (filter chips, label on the cards) and the source line under its header.
ALTER TABLE paginas ADD COLUMN categoria text NOT NULL DEFAULT '';
ALTER TABLE paginas ADD COLUMN fuente text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE paginas DROP COLUMN fuente;
ALTER TABLE paginas DROP COLUMN categoria;
