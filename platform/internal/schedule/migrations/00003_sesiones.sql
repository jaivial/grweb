-- +goose Up
-- No flights (Jaime, 14/15-nov): one platform («tarima») and, on each date, sessions by time (women / men, groups of
-- weight classes). flights → sesiones without letter or platform; the planner loses platforms, order and «separar
-- por sexo» (always separated; order: weight class and expected total). Published snapshots follow.
ALTER TABLE flights RENAME TO sesiones;
ALTER TABLE sesiones DROP COLUMN codigo;
ALTER TABLE sesiones DROP COLUMN plataforma;
ALTER INDEX flights_comp RENAME TO sesiones_comp;

ALTER TABLE flight_atletas RENAME TO sesion_atletas;
ALTER TABLE sesion_atletas RENAME COLUMN flight_id TO sesion_id;

ALTER TABLE directo RENAME COLUMN flight_id TO sesion_id;

ALTER TABLE config RENAME COLUMN max_por_flight TO max_por_sesion;
ALTER TABLE config DROP COLUMN plataformas;
ALTER TABLE config DROP COLUMN orden;
ALTER TABLE config DROP COLUMN separar_sexo;

UPDATE versiones v SET snapshot = jsonb_set(v.snapshot, '{dias}', COALESCE((
    SELECT jsonb_agg((d.val - 'flights') || jsonb_build_object('sesiones', COALESCE((
        SELECT jsonb_agg(f.val - 'codigo' - 'plataforma' ORDER BY f.ord)
        FROM jsonb_array_elements(COALESCE(d.val->'flights', '[]')) WITH ORDINALITY f(val, ord)), '[]'::jsonb)) ORDER BY d.ord)
    FROM jsonb_array_elements(v.snapshot->'dias') WITH ORDINALITY d(val, ord)), '[]'::jsonb));

-- +goose Down
UPDATE versiones v SET snapshot = jsonb_set(v.snapshot, '{dias}', COALESCE((
    SELECT jsonb_agg((d.val - 'sesiones') || jsonb_build_object('flights', COALESCE((
        SELECT jsonb_agg(f.val || jsonb_build_object('codigo', chr(64 + f.ord::int), 'plataforma', 1) ORDER BY f.ord)
        FROM jsonb_array_elements(COALESCE(d.val->'sesiones', '[]')) WITH ORDINALITY f(val, ord)), '[]'::jsonb)) ORDER BY d.ord)
    FROM jsonb_array_elements(v.snapshot->'dias') WITH ORDINALITY d(val, ord)), '[]'::jsonb));
ALTER TABLE config ADD COLUMN separar_sexo boolean NOT NULL DEFAULT true;
ALTER TABLE config ADD COLUMN orden text NOT NULL DEFAULT 'total' CHECK (orden IN ('total', 'categoria'));
ALTER TABLE config ADD COLUMN plataformas integer NOT NULL DEFAULT 1 CHECK (plataformas BETWEEN 1 AND 4);
ALTER TABLE config RENAME COLUMN max_por_sesion TO max_por_flight;
ALTER TABLE directo RENAME COLUMN sesion_id TO flight_id;
ALTER TABLE sesion_atletas RENAME COLUMN sesion_id TO flight_id;
ALTER TABLE sesion_atletas RENAME TO flight_atletas;
ALTER INDEX sesiones_comp RENAME TO flights_comp;
ALTER TABLE sesiones ADD COLUMN plataforma integer NOT NULL DEFAULT 1 CHECK (plataforma BETWEEN 1 AND 4);
ALTER TABLE sesiones ADD COLUMN codigo text NOT NULL DEFAULT '?';
ALTER TABLE sesiones RENAME TO flights;
