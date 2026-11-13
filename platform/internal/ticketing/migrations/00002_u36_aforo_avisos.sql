-- +goose Up
-- Figma 58: pavilion capacity (simultaneous places per day), «Último aviso» of a waiting-list offer,
-- bounced ticket emails and the news double opt-in confirmed in crm.
ALTER TABLE ajustes ADD COLUMN ultimo_aviso_horas integer NOT NULL DEFAULT 2 CHECK (ultimo_aviso_horas BETWEEN 0 AND 72);
ALTER TABLE ajustes ADD COLUMN aforo_pabellon integer NOT NULL DEFAULT 0 CHECK (aforo_pabellon BETWEEN 0 AND 100000);
ALTER TABLE lista_espera ADD COLUMN aviso_at timestamptz;
ALTER TABLE entradas ADD COLUMN email_rebotado_at timestamptz;
ALTER TABLE entradas ADD COLUMN novedades_confirmada_at timestamptz;

-- +goose Down
ALTER TABLE entradas DROP COLUMN novedades_confirmada_at;
ALTER TABLE entradas DROP COLUMN email_rebotado_at;
ALTER TABLE lista_espera DROP COLUMN aviso_at;
ALTER TABLE ajustes DROP COLUMN aforo_pabellon;
ALTER TABLE ajustes DROP COLUMN ultimo_aviso_horas;
