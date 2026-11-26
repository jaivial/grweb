-- +goose Up
-- The official Instagram of GR Strength is @grstrengthclub: the event links pointed to @grstrength (another account).
-- Only the known old values change; an account typed by hand in the backoffice is kept.
UPDATE competiciones SET evento = jsonb_set(evento, '{instagram}', '"https://www.instagram.com/grstrengthclub?avpt=ZGwzY2JrdWhteXZo"')
WHERE evento->>'instagram' IN ('https://instagram.com/grstrength', 'https://instagram.com/grstrengthclub', 'https://www.instagram.com/grstrengthclub/');

-- +goose Down
UPDATE competiciones SET evento = jsonb_set(evento, '{instagram}', '"https://instagram.com/grstrength"')
WHERE slug = 'grcup' AND evento->>'instagram' = 'https://www.instagram.com/grstrengthclub?avpt=ZGwzY2JrdWhteXZo';
UPDATE competiciones SET evento = jsonb_set(evento, '{instagram}', '"https://instagram.com/grstrengthclub"')
WHERE slug = 'grcup-2025' AND evento->>'instagram' = 'https://www.instagram.com/grstrengthclub?avpt=ZGwzY2JrdWhteXZo';
