-- +goose Up
-- Where a change came from (Figma 63 «Auditoría» detail): masked IP, browser and request line.
ALTER TABLE auditoria ADD COLUMN actor_ip text NOT NULL DEFAULT '', ADD COLUMN actor_agente text NOT NULL DEFAULT '', ADD COLUMN peticion text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE auditoria DROP COLUMN actor_ip, DROP COLUMN actor_agente, DROP COLUMN peticion;
