-- +goose Up
-- BIZ-200 QA r2: the athlete's public name is kept on the bet, so «mis apuestas» still shows it once the athlete
-- left the scoreboard and the market (the very case of the automatic refund). Backfill from the known roster.
ALTER TABLE apuestas ADD COLUMN atleta_nombre text NOT NULL DEFAULT '';
UPDATE apuestas a SET atleta_nombre = COALESCE((SELECT x.nombre_publico FROM fantasy_atletas x
    WHERE x.competition_id = a.competition_id AND x.atleta_id = a.atleta_id ORDER BY x.updated_at DESC LIMIT 1), '');

-- +goose Down
ALTER TABLE apuestas DROP COLUMN atleta_nombre;
