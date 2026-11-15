-- +goose Up
-- BIZ-144 (QA U04-R1-5): the hero row shows only the sponsors picked in the backoffice. New sponsors start hidden
-- from the hero, the existing ones are switched off and the three logos of Figma (GRStrength, GRS Powerlifting
-- Coaching, Ajuntament d'Almussafes) are added (when missing) and switched on for every edition.
ALTER TABLE patrocinadores ALTER COLUMN mostrar_en_hero SET DEFAULT false;
UPDATE patrocinadores SET mostrar_en_hero = false;
INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, mostrar_en_hero, orden)
SELECT gen_random_uuid(), c.competition_id, v.nombre, v.nivel, v.logo_url, v.url, true, true,
       COALESCE((SELECT max(orden) FROM patrocinadores p WHERE p.competition_id = c.competition_id), 0) + v.o
FROM (SELECT DISTINCT competition_id FROM patrocinadores) c
CROSS JOIN (VALUES ('GRStrength', 'principal', '/img/home/patro-str.webp', 'https://grstrength.com', 1),
                   ('GRS Powerlifting Coaching', 'principal', '/img/home/patro-coa.webp', '', 2),
                   ('Ajuntament d''Almussafes', 'institucional', '/img/home/patro-alm.webp', 'https://www.almussafes.net', 3)) v(nombre, nivel, logo_url, url, o)
WHERE NOT EXISTS (SELECT 1 FROM patrocinadores p WHERE p.competition_id = c.competition_id AND p.nombre = v.nombre);
UPDATE patrocinadores SET mostrar_en_hero = true WHERE nombre IN ('GRStrength', 'GRS Powerlifting Coaching', 'Ajuntament d''Almussafes');

-- +goose Down
ALTER TABLE patrocinadores ALTER COLUMN mostrar_en_hero SET DEFAULT true;
