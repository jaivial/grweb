-- +goose Up
-- Each competition of the event (AEP-2 / AEP-3) is planned and published on its own (Figma 56 · 219:167365).
-- flights.prueba: competition of the flight ('' = sin competición). Existing flights are backfilled by the service
-- from their athletes' competition on the first load (the athletes live in another database).
ALTER TABLE flights ADD COLUMN prueba text NOT NULL DEFAULT '' CHECK (prueba IN ('', 'aep2', 'aep3'));
-- versiones.prueba: competition published by that version ('' = whole event, the versions before this migration);
-- numero_prueba: «v1 · AEP-3». The snapshot still holds the whole event (the public page serves one snapshot).
ALTER TABLE versiones ADD COLUMN prueba text NOT NULL DEFAULT '';
ALTER TABLE versiones ADD COLUMN numero_prueba integer NOT NULL DEFAULT 0;
UPDATE versiones SET numero_prueba = numero;

-- +goose Down
ALTER TABLE versiones DROP COLUMN numero_prueba;
ALTER TABLE versiones DROP COLUMN prueba;
ALTER TABLE flights DROP COLUMN prueba;
