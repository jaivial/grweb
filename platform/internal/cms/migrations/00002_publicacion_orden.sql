-- +goose Up
-- Visibility and order of the home are part of the draft: the public home reads the published copies,
-- which only change on «Publicar». rev is the draft revision behind ETag / If-Match (409 CONFLICTO_EDICION).
ALTER TABLE secciones
  ADD COLUMN pub_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN pub_orden   int     NOT NULL DEFAULT 0,
  ADD COLUMN rev         int     NOT NULL DEFAULT 1;
UPDATE secciones SET pub_visible = visible, pub_orden = orden;

-- +goose Down
ALTER TABLE secciones DROP COLUMN pub_visible, DROP COLUMN pub_orden, DROP COLUMN rev;
