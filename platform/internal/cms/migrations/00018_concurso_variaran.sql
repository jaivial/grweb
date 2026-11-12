-- +goose Up
-- U19: «varierán» → «variarán» in the contest rules (00016). Same version, in place; the hash follows the text.
UPDATE legal SET contenido = c, hash = encode(sha256(convert_to(c, 'UTF8')), 'hex')
FROM (SELECT id AS lid, replace(contenido, 'varierán', 'variarán') AS c FROM legal WHERE contenido LIKE '%varierán%') f
WHERE id = f.lid;

-- +goose Down
SELECT 1;
