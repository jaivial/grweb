-- +goose Up
-- BIZ-159: only the 11 official sponsors stay active. GR Strength Coaching, GR Strength Club, Ayuntamiento de Almussafes and
-- GR Strength Alicante are «principal» (first and bigger, also in the hero). Names without an official logo on the CDN keep
-- logo_url empty and the web shows the name as text until the logo is uploaded from the backoffice.
UPDATE patrocinadores SET nombre = 'GR Strength Club' WHERE nombre = 'GRStrength';
UPDATE patrocinadores SET nombre = 'GR Strength Coaching' WHERE nombre = 'GRS Powerlifting Coaching';
UPDATE patrocinadores SET nombre = 'Ayuntamiento de Almussafes' WHERE nombre = 'Ajuntament d''Almussafes';

CREATE TEMP TABLE biz159 (nombre text, nivel text, logo_url text, url text, orden int, hero boolean);
INSERT INTO biz159 VALUES
  ('GR Strength Coaching', 'principal', '/img/home/patro-coa.webp', '', 1, true),
  ('GR Strength Club', 'principal', '/img/home/patro-str.webp', 'https://grstrength.com', 2, true),
  ('Ayuntamiento de Almussafes', 'principal', '/img/home/patro-alm.webp', 'https://www.almussafes.net', 3, true),
  ('GR Strength Alicante', 'principal', '', '', 4, true),
  ('A7', 'colaborador', 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp', '', 5, false),
  ('Silentworker', 'colaborador', '', '', 6, false),
  ('AEP', 'institucional', 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/compressedAEP.webp', 'https://powerliftingspain.es/', 7, false),
  ('Eleiko', 'colaborador', '', '', 8, false),
  ('ER Strength Club', 'colaborador', '', '', 9, false),
  ('KGXLB', 'colaborador', '', '', 10, false),
  ('FER Entrenamiento', 'colaborador', '', '', 11, false);

UPDATE patrocinadores p SET activo = false, mostrar_en_hero = false, updated_at = now()
WHERE NOT EXISTS (SELECT 1 FROM biz159 b WHERE b.nombre = p.nombre);
UPDATE patrocinadores p SET nivel = b.nivel, orden = b.orden, mostrar_en_hero = b.hero, activo = true,
  logo_url = CASE WHEN p.logo_url = '' THEN b.logo_url ELSE p.logo_url END, updated_at = now()
FROM biz159 b WHERE b.nombre = p.nombre;
INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, orden, mostrar_en_hero)
SELECT gen_random_uuid(), c.competition_id, b.nombre, b.nivel, b.logo_url, b.url, true, b.orden, b.hero
FROM (SELECT DISTINCT competition_id FROM patrocinadores) c CROSS JOIN biz159 b
WHERE NOT EXISTS (SELECT 1 FROM patrocinadores p WHERE p.competition_id = c.competition_id AND p.nombre = b.nombre);
DROP TABLE biz159;

-- +goose Down
-- Data change: the previous list can be restored from the backoffice.
SELECT 1;

