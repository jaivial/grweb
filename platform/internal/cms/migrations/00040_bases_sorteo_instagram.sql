-- +goose Up
-- The bases del sorteo named @grstrength as the official Instagram; it is @grstrengthclub. A published legal text never
-- changes: this publishes a new version (<vigente>.1) with the account fixed in ES and EN and its own hash. It is a
-- factual correction, so the acceptances already given stay valid (pedir_aceptacion = false).
INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash, publicado_at, pedir_aceptacion, en)
SELECT gen_random_uuid(), v.competition_id, v.tipo, v.version || '.1', v.titulo, n.contenido,
       encode(sha256(convert_to(n.contenido, 'UTF8')), 'hex'), now(), false,
       CASE WHEN v.en ? 'contenido'
            THEN jsonb_set(v.en, '{contenido}', to_jsonb(regexp_replace(v.en->>'contenido', '(?<![[:alnum:]._-])@grstrength(?![[:alnum:]._])', '@grstrengthclub', 'g')))
            ELSE v.en END
FROM (SELECT DISTINCT ON (competition_id) * FROM legal
      WHERE tipo = 'bases-sorteo' AND publicado_at IS NOT NULL
      ORDER BY competition_id, publicado_at DESC) v
CROSS JOIN LATERAL (SELECT regexp_replace(v.contenido, '(?<![[:alnum:]._-])@grstrength(?![[:alnum:]._])', '@grstrengthclub', 'g') AS contenido) n
WHERE (v.contenido ~ '(?<![[:alnum:]._-])@grstrength(?![[:alnum:]._])' OR coalesce(v.en->>'contenido', '') ~ '(?<![[:alnum:]._-])@grstrength(?![[:alnum:]._])')
  AND length(v.version) <= 18
  AND NOT EXISTS (SELECT 1 FROM legal x WHERE x.competition_id = v.competition_id AND x.tipo = v.tipo AND x.version = v.version || '.1');

-- +goose Down
DELETE FROM legal WHERE tipo = 'bases-sorteo' AND version LIKE '%.1' AND pedir_aceptacion = false
  AND contenido ~ '@grstrengthclub' AND publicado_por IS NULL;
