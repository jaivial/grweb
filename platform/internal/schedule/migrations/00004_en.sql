-- +goose Up
-- English texts of the public schedule (Spanish text → English text), applied to the published snapshot on ?lang=en.
ALTER TABLE config ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
UPDATE config SET en = '{
  "Entrada de público por la puerta principal con tu QR.": "Public entry through the main door with your QR code.",
  "Pesaje en la Sala 2 (planta baja).": "Weigh-in in Room 2 (ground floor).",
  "Sorteo en directo tras la entrega de premios.": "Live raffle after the awards ceremony.",
  "Entrega de premios y sorteo en directo": "Awards ceremony and live raffle",
  "Apertura de puertas · primer pesaje a las 07:00 (Sala 2)": "Doors open · first weigh-in at 07:00 (Room 2)",
  "Apertura de puertas": "Doors open"
}'::jsonb WHERE en = '{}'::jsonb;

-- +goose Down
ALTER TABLE config DROP COLUMN en;
