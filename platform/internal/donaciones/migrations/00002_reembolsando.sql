-- +goose Up
-- El reembolso pasa la donación por «reembolsando»: la fila se bloquea y se marca antes de llamar a la pasarela
-- (y se vuelve a «pagada» si la pasarela falla), así que dos intentos concurrentes no devuelven el dinero dos
-- veces (PR review I2). El CHECK de «estado» necesita ese valor nuevo.
ALTER TABLE donaciones DROP CONSTRAINT IF EXISTS donaciones_estado_check;
ALTER TABLE donaciones ADD CONSTRAINT donaciones_estado_check CHECK (estado IN ('pendiente', 'pagada', 'caducada', 'reembolsando', 'reembolsada'));

-- +goose Down
ALTER TABLE donaciones DROP CONSTRAINT IF EXISTS donaciones_estado_check;
ALTER TABLE donaciones ADD CONSTRAINT donaciones_estado_check CHECK (estado IN ('pendiente', 'pagada', 'caducada', 'reembolsada'));
