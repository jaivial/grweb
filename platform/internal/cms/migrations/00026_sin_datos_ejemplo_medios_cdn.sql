-- +goose Up
-- Auditoría R018/R051 (Jaime 14-nov): fuera las marcas «Datos de ejemplo» de las FAQ y novedades sembradas, y «GR Cup» → «GRS Cup 2».
UPDATE faq SET respuesta = btrim(replace(replace(respuesta, ' *Datos de ejemplo: pendiente de confirmar por la organización.*', ''), ' *Datos de ejemplo.*', '')), updated_at = now()
WHERE respuesta LIKE '%Datos de ejemplo%';
UPDATE faq SET pregunta = replace(pregunta, 'la GR Cup', 'la GRS Cup 2'), respuesta = replace(respuesta, 'la GR Cup', 'la GRS Cup 2'), updated_at = now()
WHERE pregunta LIKE '%la GR Cup%' OR respuesta LIKE '%la GR Cup%';
UPDATE paginas SET cuerpo = replace(cuerpo, 'para la GR Strength Cup. *Datos de ejemplo.*', 'para la GRS Cup 2.'), updated_at = now()
WHERE cuerpo LIKE '%para la GR Strength Cup. *Datos de ejemplo.*%';
-- R121: copia en Bunny CDN de cada medio subido (vacío = solo en el volumen del servicio, p. ej. QA sin Bunny).
ALTER TABLE medios ADD COLUMN IF NOT EXISTS cdn_url text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE medios DROP COLUMN IF EXISTS cdn_url;
