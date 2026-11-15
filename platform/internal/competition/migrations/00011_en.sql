-- +goose Up
-- English texts of the public competition data (evento, cómo llegar by position), overlaid on ?lang=en.
ALTER TABLE competiciones ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
UPDATE competiciones SET en = '{"evento": {"descripcion": "The most awaited powerlifting competition of the year", "nivel": "AEP-2 · AEP-3"}, "comoLlegar": [
  {"titulo": "By car", "detalle": "About 20 km south of Valencia on the V-31 towards Silla.", "nota": "≈ 25 min from Valencia"},
  {"titulo": "By train", "detalle": "Cercanías C-2 commuter line, Benifaió-Almussafes station.", "nota": "Check Renfe timetables"},
  {"titulo": "By plane", "detalle": "Valencia Airport (Manises), about 35 km away.", "nota": "≈ 35 min by car"},
  {"titulo": "By bus", "detalle": "Intercity lines from Valencia.", "nota": "Timetables to be confirmed"},
  {"titulo": "Parking", "detalle": "Street parking around the sports hall. A reserved area is pending confirmation with the Town Council."},
  {"titulo": "Accessibility", "detalle": "We will confirm adapted access, toilets and a reserved stand area for people with reduced mobility."}
]}'::jsonb WHERE slug = 'grcup' AND en = '{}'::jsonb;
UPDATE competiciones SET en = '{"evento": {"descripcion": "The first edition brought together athletes from the Valencian Community, Murcia and the Balearic Islands in an AEP-2 level regional competition, with certified referees and loaders.", "nivel": "AEP-2 Regional Valencia, Murcia and Balearic Islands"}}'::jsonb
WHERE slug = 'grcup-2025' AND en = '{}'::jsonb;

-- +goose Down
ALTER TABLE competiciones DROP COLUMN en;
