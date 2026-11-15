-- +goose Up
-- Backoffice › Voluntarios (Figma page 68): a request is reviewed («revision»), accepted with a role, a shift and a person in
-- charge, or turned down with a reason. Each role has a target number of people (the team's coverage).
ALTER TABLE voluntarios ADD COLUMN turno          text NOT NULL DEFAULT '';
ALTER TABLE voluntarios ADD COLUMN responsable    text NOT NULL DEFAULT '';
ALTER TABLE voluntarios ADD COLUMN motivo_rechazo text NOT NULL DEFAULT '';
ALTER TABLE voluntarios ADD COLUMN revisado_at    timestamptz;
ALTER TABLE voluntarios ADD COLUMN revisado_por   text NOT NULL DEFAULT '';
ALTER TABLE voluntarios DROP CONSTRAINT voluntarios_estado_check;
ALTER TABLE voluntarios ADD CONSTRAINT voluntarios_estado_check CHECK (estado IN ('pendiente', 'revision', 'confirmado', 'descartado'));

CREATE TABLE voluntario_puestos (
    competition_id uuid    NOT NULL,
    rol            text    NOT NULL,
    objetivo       integer NOT NULL CHECK (objetivo BETWEEN 0 AND 200),
    PRIMARY KEY (competition_id, rol)
);

-- +goose Down
DROP TABLE voluntario_puestos;
UPDATE voluntarios SET estado = 'pendiente' WHERE estado = 'revision';
ALTER TABLE voluntarios DROP CONSTRAINT voluntarios_estado_check;
ALTER TABLE voluntarios ADD CONSTRAINT voluntarios_estado_check CHECK (estado IN ('pendiente', 'confirmado', 'descartado'));
ALTER TABLE voluntarios DROP COLUMN turno, DROP COLUMN responsable, DROP COLUMN motivo_rechazo, DROP COLUMN revisado_at, DROP COLUMN revisado_por;
