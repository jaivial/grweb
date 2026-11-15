-- +goose Up
-- No flights (15-nov): the desk runs the sessions (time slots) of the published schedule on the only platform.
ALTER TABLE estado RENAME COLUMN flight_id TO sesion_id;
ALTER TABLE intentos RENAME COLUMN flight_id TO sesion_id;
ALTER INDEX intentos_flight RENAME TO intentos_sesion;

-- +goose Down
ALTER INDEX intentos_sesion RENAME TO intentos_flight;
ALTER TABLE intentos RENAME COLUMN sesion_id TO flight_id;
ALTER TABLE estado RENAME COLUMN sesion_id TO flight_id;
