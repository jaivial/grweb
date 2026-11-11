-- +goose Up
-- «¿En qué competición compites?» del alta: AEP-2, AEP-3 o vacío («Aún no lo sé»).
ALTER TABLE solicitudes_atleta ADD COLUMN prueba text NOT NULL DEFAULT '' CHECK (prueba IN ('', 'aep2', 'aep3'));

-- +goose Down
ALTER TABLE solicitudes_atleta DROP COLUMN prueba;
