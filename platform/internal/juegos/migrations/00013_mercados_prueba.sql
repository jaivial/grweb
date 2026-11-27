-- +goose Up
-- Mercados por competición (AEP-2 / AEP-3): un ganador de categoría, un mejor IPF GL y un mayor levantamiento por
-- sexo y competición, con su propio bote y sus cuotas. '' = atleta sin competición (los mercados que ya existen).
ALTER TABLE mercados ADD COLUMN IF NOT EXISTS prueba text NOT NULL DEFAULT '' CHECK (prueba IN ('', 'aep2', 'aep3'));
ALTER TABLE mercados DROP CONSTRAINT IF EXISTS mercados_jornada_id_tipo_sexo_categoria_movimiento_key;
ALTER TABLE mercados ADD CONSTRAINT mercados_uq_mercado UNIQUE (jornada_id, tipo, sexo, prueba, categoria, movimiento);

-- +goose Down
ALTER TABLE mercados DROP CONSTRAINT IF EXISTS mercados_uq_mercado;
ALTER TABLE mercados ADD CONSTRAINT mercados_jornada_id_tipo_sexo_categoria_movimiento_key UNIQUE (jornada_id, tipo, sexo, categoria, movimiento);
ALTER TABLE mercados DROP COLUMN IF EXISTS prueba;
