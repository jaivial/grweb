-- +goose Up
-- The organiser's club card links to the official Instagram (@grstrengthclub), same URL as the rest of the site.
UPDATE clubs SET web = 'https://www.instagram.com/grstrengthclub?avpt=ZGwzY2JrdWhteXZo'
WHERE web IN ('https://www.instagram.com/grstrengthclub/', 'https://instagram.com/grstrengthclub', 'https://instagram.com/grstrength');

-- +goose Down
UPDATE clubs SET web = 'https://www.instagram.com/grstrengthclub/'
WHERE web = 'https://www.instagram.com/grstrengthclub?avpt=ZGwzY2JrdWhteXZo';
