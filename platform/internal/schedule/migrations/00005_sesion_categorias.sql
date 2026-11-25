-- +goose Up
-- BIZ-202: each session has its own sex (one per session: two sessions may share a time for different sexes),
-- weight classes (several, of that sex) and AEP level (AEP-1/2/3), editable from the backoffice. '' / '{}' = derived
-- from its athletes, as before.
ALTER TABLE sesiones ADD COLUMN sexo text NOT NULL DEFAULT '' CHECK (sexo IN ('', 'F', 'M'));
ALTER TABLE sesiones ADD COLUMN categorias text[] NOT NULL DEFAULT '{}';
ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS flights_prueba_check;
ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS sesiones_prueba_check;
ALTER TABLE sesiones ADD CONSTRAINT sesiones_prueba_check CHECK (prueba IN ('', 'aep1', 'aep2', 'aep3'));

-- +goose Down
UPDATE sesiones SET prueba = '' WHERE prueba = 'aep1';
ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS sesiones_prueba_check;
ALTER TABLE sesiones ADD CONSTRAINT flights_prueba_check CHECK (prueba IN ('', 'aep2', 'aep3'));
ALTER TABLE sesiones DROP COLUMN categorias;
ALTER TABLE sesiones DROP COLUMN sexo;
