-- +goose Up
-- «Comparte tu cuenta atrás» (Figma 83 · /area-atleta/compartir): the story is composed in the browser
-- (canvas 1080×1920); here only the shares are counted for the organisation's KPIs.
CREATE TABLE story_comparticiones (
    id             uuid PRIMARY KEY,
    competition_id uuid NOT NULL,
    atleta_id      uuid NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    modo           text NOT NULL CHECK (modo IN ('cuenta_atras', 'fecha')),
    formato        text NOT NULL CHECK (formato IN ('story', 'sticker')),
    canal          text NOT NULL CHECK (canal IN ('compartir', 'descarga')),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_comparticiones_atleta ON story_comparticiones (atleta_id, created_at DESC);

-- +goose Down
DROP TABLE story_comparticiones;
