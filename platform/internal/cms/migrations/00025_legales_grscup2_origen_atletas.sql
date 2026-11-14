-- +goose Up
-- Jaime 14-nov: (1) la competición se llama «GRS Cup 2», no «GR Cup» (GR Strength sigue como organizador y
-- responsable); (2) los datos de atletas NUNCA proceden de la AEP: vienen de la inscripción y cesión voluntaria
-- de cada atleta al darse de alta en esta web, y así debe constar en los avisos legales.
-- Se publica la versión 2026.11 de los cuatro textos legales de la GR Cup a partir de la 2026-04 en vigor,
-- y se despublica la anterior (las filas se conservan: los consentimientos citan su versión).
CREATE TEMP TABLE grs_legal_base ON COMMIT DROP AS
SELECT competition_id, tipo, titulo, contenido FROM legal
WHERE version = '2026-04' AND publicado_at IS NOT NULL AND tipo IN ('privacidad', 'terminos', 'consentimiento', 'bases-sorteo');

CREATE TEMP TABLE grs_legal_new ON COMMIT DROP AS
SELECT competition_id, tipo, titulo,
  replace(replace(contenido, 'GR Cup 2026', 'GRS Cup 2'), 'GR Cup', 'GRS Cup 2')
  || CASE WHEN tipo IN ('privacidad', 'consentimiento') THEN $sec$

## Origen de los datos de atletas

Los datos de los perfiles de atleta (nombre, club, categoría, marcas, foto y horario de competición) proceden exclusivamente de la inscripción y cesión voluntaria que cada atleta realiza al darse de alta en esta web. No los obtenemos de la Asociación Española de Powerlifting (AEP) ni de ninguna otra federación o tercero.

El perfil es privado hasta que el propio atleta activa su publicación desde el área de atleta. Puedes modificar tus datos, ocultar tu perfil o pedir su supresión en cualquier momento desde el área de atleta o escribiendo a admin@grstrength.com.$sec$ ELSE '' END AS contenido
FROM grs_legal_base;

UPDATE legal l SET publicado_at = NULL
FROM grs_legal_base b
WHERE l.competition_id = b.competition_id AND l.tipo = b.tipo AND l.version = '2026-04';

INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash, publicado_at)
SELECT gen_random_uuid(), competition_id, tipo, '2026.11', titulo, contenido,
       encode(sha256(convert_to(contenido, 'UTF8')), 'hex'), now()
FROM grs_legal_new
ON CONFLICT (competition_id, tipo, version) DO NOTHING;

-- +goose Down
-- Vuelve a publicar la 2026-04 y retira la 2026.11.
UPDATE legal SET publicado_at = '2026-04-01 10:00:00+02'
WHERE version = '2026-04' AND tipo IN ('privacidad', 'terminos', 'consentimiento', 'bases-sorteo')
  AND competition_id IN (SELECT competition_id FROM legal WHERE version = '2026.11');
DELETE FROM legal WHERE version = '2026.11' AND tipo IN ('privacidad', 'terminos', 'consentimiento', 'bases-sorteo');
