-- +goose Up
-- BO Rifa · Historial (Figma 60): every winner registered or removed, with who did it and when.
CREATE TABLE rifa_ganadores_historial (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    item_id        uuid        NOT NULL,
    item_nombre    text        NOT NULL,
    boleto         text,
    nombre         text,
    actor          text        NOT NULL,
    at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rifa_ganadores_historial_comp_at ON rifa_ganadores_historial (competition_id, at DESC);

-- +goose Down
DROP TABLE rifa_ganadores_historial;
