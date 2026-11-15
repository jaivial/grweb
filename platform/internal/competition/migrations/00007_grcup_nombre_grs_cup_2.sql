-- +goose Up
-- Jaime 14-nov (R007): la edición 2026 se llama «GRS Cup 2» y no «GR Strength Cup 2026» ni «GR Cup». GR Strength sigue
-- siendo el club organizador (evento.organizador). Solo cambia si conserva el nombre sembrado (no pisa uno editado en el BO).
UPDATE competiciones SET nombre = 'GRS Cup 2' WHERE slug = 'grcup' AND nombre = 'GR Strength Cup 2026';
UPDATE competiciones SET nombre_corto = 'GRS Cup 2' WHERE slug = 'grcup' AND nombre_corto = 'GR Cup';

-- +goose Down
UPDATE competiciones SET nombre = 'GR Strength Cup 2026' WHERE slug = 'grcup' AND nombre = 'GRS Cup 2';
UPDATE competiciones SET nombre_corto = 'GR Cup' WHERE slug = 'grcup' AND nombre_corto = 'GRS Cup 2';
