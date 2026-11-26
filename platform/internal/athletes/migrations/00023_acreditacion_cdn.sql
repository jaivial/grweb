-- +goose Up
-- Accreditation QR on the CDN (Jaime 26-nov): the PNG is generated once on the server and published to Bunny; the
-- athlete area only loads the stored URL. acreditacion_qr keeps the payload the PNG was generated from, so it is
-- regenerated only when the signed content changes. The payload check-in scans is untouched.
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS acreditacion_url text NOT NULL DEFAULT '';
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS acreditacion_qr text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE atletas DROP COLUMN IF EXISTS acreditacion_qr;
ALTER TABLE atletas DROP COLUMN IF EXISTS acreditacion_url;
