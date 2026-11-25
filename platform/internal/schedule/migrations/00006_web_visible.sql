-- +goose Up
-- «Publicar horarios» switch of the backoffice: false keeps the published version off the web (the pages show the
-- fallback and the athletes' profiles have no time) while the team keeps planning; true shows it. Default true:
-- what is published today stays visible.
ALTER TABLE config ADD COLUMN web_visible boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE config DROP COLUMN web_visible;
