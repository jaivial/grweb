-- +goose Up
-- «Cambiada por la organización» in the athlete area: when the backoffice moves the athlete to another competition.
ALTER TABLE atletas ADD COLUMN prueba_org_at timestamptz;

-- +goose Down
ALTER TABLE atletas DROP COLUMN prueba_org_at;
