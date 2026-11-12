-- +goose Up
-- U18 r2: fix the non-Spanish words copied from Figma into the 2026-04 legal texts (00016). Same version, in place:
-- only spelling changes, the hash is recomputed so it still matches the text.
UPDATE legal SET contenido = c, hash = encode(sha256(convert_to(c, 'UTF8')), 'hex')
FROM (SELECT id AS lid, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(contenido,
  'en случаях de', 'en casos de'), 'fines最初的', 'fines iniciales'), 'Certains de', 'Algunos de'),
  'es voluntary', 'es voluntario'), 'software o硬件', 'software o hardware'), 'aceptación penuh', 'aceptación plena'),
  'o consequential', 'o consecuente'), 'disqualificar', 'descalificar'), 'tickets purchased', 'entradas adquiridas'),
  'ticket purchased', 'entrada adquirida') AS c FROM legal WHERE version = '2026-04') f
WHERE id = f.lid AND contenido <> f.c;

-- +goose Down
SELECT 1;

