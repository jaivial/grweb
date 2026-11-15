-- +goose Up
-- U30-R1 (Figma 54): scheduled publishing of home sections («Programar»), sponsor photo with focal point and alt text,
-- organiser/federation levels, and whether publishing a legal version asks for a new acceptance.
ALTER TABLE secciones ADD COLUMN programada_at timestamptz;
ALTER TABLE patrocinadores
    ADD COLUMN foto_url text NOT NULL DEFAULT '',
    ADD COLUMN focal_x smallint NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
    ADD COLUMN focal_y smallint NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
    ADD COLUMN alt text NOT NULL DEFAULT '';
ALTER TABLE patrocinadores DROP CONSTRAINT IF EXISTS patrocinadores_nivel_check;
ALTER TABLE patrocinadores ADD CONSTRAINT patrocinadores_nivel_check
    CHECK (nivel IN ('organizador', 'federacion', 'principal', 'oro', 'plata', 'colaborador', 'institucional'));
ALTER TABLE legal ADD COLUMN pedir_aceptacion boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE legal DROP COLUMN pedir_aceptacion;
UPDATE patrocinadores SET nivel = 'institucional' WHERE nivel IN ('organizador', 'federacion');
ALTER TABLE patrocinadores DROP CONSTRAINT IF EXISTS patrocinadores_nivel_check;
ALTER TABLE patrocinadores ADD CONSTRAINT patrocinadores_nivel_check CHECK (nivel IN ('principal', 'oro', 'plata', 'colaborador', 'institucional'));
ALTER TABLE patrocinadores DROP COLUMN foto_url, DROP COLUMN focal_x, DROP COLUMN focal_y, DROP COLUMN alt;
ALTER TABLE secciones DROP COLUMN programada_at;
