-- +goose Up
-- U06-R4-1: one live registration per licence regardless of dashes, dots, spaces or case.
-- Older duplicates by the normalised form (QA mock QAU06R4DUP1 / QAU06R4-DUP1) keep the oldest; the rest are cancelled.
UPDATE inscripciones SET estado = 'cancelada', updated_at = now()
WHERE id IN (
    SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY competition_id, upper(regexp_replace(licencia, '[-.[:space:]]', '', 'g')) ORDER BY created_at, id) AS n
        FROM inscripciones
        WHERE licencia <> '' AND estado IN ('pendiente_pago', 'pagada', 'gratuita', 'reserva')
    ) d WHERE n > 1
);
CREATE UNIQUE INDEX inscripciones_licencia_viva_norm ON inscripciones (competition_id, upper(regexp_replace(licencia, '[-.[:space:]]', '', 'g')))
    WHERE licencia <> '' AND estado IN ('pendiente_pago', 'pagada', 'gratuita', 'reserva');

-- +goose Down
DROP INDEX IF EXISTS inscripciones_licencia_viva_norm;
