-- +goose Up
-- Gmail via Google OAuth (Sistema e integraciones): new integration type «gmail».
ALTER TABLE integraciones DROP CONSTRAINT IF EXISTS integraciones_tipo_check;
ALTER TABLE integraciones ADD CONSTRAINT integraciones_tipo_check CHECK (tipo IN ('gmail', 'smtp', 'stripe', 'whatsapp', 'bunny', 'aep'));

-- +goose Down
DELETE FROM integraciones WHERE tipo = 'gmail';
ALTER TABLE integraciones DROP CONSTRAINT IF EXISTS integraciones_tipo_check;
ALTER TABLE integraciones ADD CONSTRAINT integraciones_tipo_check CHECK (tipo IN ('smtp', 'stripe', 'whatsapp', 'bunny', 'aep'));
