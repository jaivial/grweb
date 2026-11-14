-- +goose Up
-- ST2-R3-2: running per-market/athlete pots so every bet (live odds) and GET /porra/mercados read a handful of
-- rows instead of aggregating every bet of the market/jornada. Kept by a trigger in the same transaction as the
-- insert (atomic, any code version); the backfill runs under a lock so no bet is counted twice or missed.
CREATE TABLE botes (
    mercado_id uuid   NOT NULL REFERENCES mercados(id) ON DELETE CASCADE,
    atleta_id  uuid   NOT NULL,
    jornada_id uuid   NOT NULL,
    apostado   bigint NOT NULL DEFAULT 0,
    n          int    NOT NULL DEFAULT 0,
    PRIMARY KEY (mercado_id, atleta_id)
);
CREATE INDEX botes_jornada ON botes (jornada_id);

-- +goose StatementBegin
CREATE FUNCTION botes_apuesta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO botes (mercado_id, atleta_id, jornada_id, apostado, n) VALUES (NEW.mercado_id, NEW.atleta_id, NEW.jornada_id, NEW.importe, 1)
    ON CONFLICT (mercado_id, atleta_id) DO UPDATE SET apostado = botes.apostado + EXCLUDED.apostado, n = botes.n + 1;
    RETURN NULL;
END $$;
-- +goose StatementEnd

LOCK TABLE apuestas IN SHARE MODE;
INSERT INTO botes (mercado_id, atleta_id, jornada_id, apostado, n)
SELECT mercado_id, atleta_id, min(jornada_id::text)::uuid, sum(importe), count(*) FROM apuestas GROUP BY mercado_id, atleta_id;
CREATE TRIGGER apuestas_botes AFTER INSERT ON apuestas FOR EACH ROW EXECUTE FUNCTION botes_apuesta();

-- +goose Down
DROP TRIGGER IF EXISTS apuestas_botes ON apuestas;
DROP FUNCTION IF EXISTS botes_apuesta();
DROP TABLE IF EXISTS botes;
