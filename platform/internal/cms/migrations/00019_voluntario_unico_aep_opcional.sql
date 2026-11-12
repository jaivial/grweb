-- +goose Up
-- U22: one volunteer request per person and competition (the form upserts), and «¿Afiliado a la AEP?» may be unanswered.
-- Duplicates: keep the most advanced request (reviewed first, then the oldest).
DELETE FROM voluntarios v USING (
    SELECT id, row_number() OVER (PARTITION BY competition_id, email ORDER BY (estado <> 'pendiente') DESC, created_at) AS n FROM voluntarios
) d WHERE v.id = d.id AND d.n > 1;
CREATE UNIQUE INDEX voluntarios_competicion_email ON voluntarios (competition_id, email);
ALTER TABLE clubs ALTER COLUMN afiliado_aep DROP NOT NULL, ALTER COLUMN afiliado_aep DROP DEFAULT;

-- +goose Down
UPDATE clubs SET afiliado_aep = false WHERE afiliado_aep IS NULL;
ALTER TABLE clubs ALTER COLUMN afiliado_aep SET DEFAULT false, ALTER COLUMN afiliado_aep SET NOT NULL;
DROP INDEX voluntarios_competicion_email;
