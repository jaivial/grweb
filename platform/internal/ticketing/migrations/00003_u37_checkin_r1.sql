-- +goose Up
-- Figma 59 (U37 r1): who to call when a station goes offline, and campaign markers on the entries chart.
ALTER TABLE puestos ADD COLUMN responsable text NOT NULL DEFAULT '';
ALTER TABLE puestos ADD COLUMN telefono text NOT NULL DEFAULT '';
CREATE TABLE checkin_hitos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    etiqueta       text        NOT NULL,
    at             timestamptz NOT NULL
);
CREATE INDEX checkin_hitos_comp ON checkin_hitos (competition_id, at);
-- «usada en A y B»: the first door of each ticket is looked up per scan row.
CREATE INDEX escaneos_entrada ON escaneos (entrada_id, escaneado_at) WHERE entrada_id IS NOT NULL;

-- +goose Down
DROP INDEX escaneos_entrada;
DROP TABLE checkin_hitos;
ALTER TABLE puestos DROP COLUMN telefono;
ALTER TABLE puestos DROP COLUMN responsable;
