-- +goose Up
-- Every athlete registered up to this deploy has the image consent active and approved (Jaime, 27/11: they gave it to
-- the organiser before being added, as the WhatsApp one, 00026/00027). The text is the image consent in force here:
-- the version and hash the other athletes accepted (2026.11 in production). An athlete whose last image action was
-- a withdrawal keeps it withdrawn.
UPDATE perfiles p SET imagen_at = now(),
    imagen_version = COALESCE((SELECT x.imagen_version FROM perfiles x WHERE x.imagen_at IS NOT NULL AND x.imagen_version <> '' ORDER BY x.imagen_at DESC LIMIT 1), '2026.11'),
    imagen_hash = COALESCE((SELECT x.imagen_hash FROM perfiles x WHERE x.imagen_at IS NOT NULL AND x.imagen_version <> '' ORDER BY x.imagen_at DESC LIMIT 1),
        '882915755763930ca9ba9c256dd090a17eabc65d43852236514e20aece52fb87'),
    imagen_origen = 'otorgado expresamente al organizador antes del alta', imagen_ip = ''
WHERE p.imagen_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM historial h WHERE h.atleta_id = p.atleta_id AND h.accion = 'Consentimiento de imagen retirado'
      AND NOT EXISTS (SELECT 1 FROM historial h2 WHERE h2.atleta_id = p.atleta_id AND h2.accion ILIKE 'Consentimiento%imagen%' AND h2.accion <> 'Consentimiento de imagen retirado' AND h2.at > h.at));

INSERT INTO historial (id, atleta_id, actor, accion, detalle)
SELECT gen_random_uuid(), p.atleta_id, 'Sistema (migración)', 'Consentimiento de imagen registrado', p.imagen_version || ' · otorgado expresamente al organizador antes del alta'
FROM perfiles p WHERE p.imagen_origen = 'otorgado expresamente al organizador antes del alta' AND p.imagen_at > now() - interval '1 minute';

-- +goose Down
SELECT 1;
