-- +goose Up
-- Home «Cierre de apuestas» (Figma 05-home-juegos): local time (Europe/Madrid) of the jornada day when the bets close.
-- Optional: without it the home shows the day instead of the countdown. Edited in the backoffice (juegos · config).
ALTER TABLE jornadas ADD COLUMN hora_cierre time;

-- +goose Down
ALTER TABLE jornadas DROP COLUMN hora_cierre;
