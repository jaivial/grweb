-- +goose Up
-- English overrides of the visible CMS texts: a partial object with the same keys as the translatable fields.
-- Public endpoints with ?lang=en overlay the non-empty values on the Spanish record.
ALTER TABLE faq ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE paginas ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE legal ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE seo ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE albumes ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE mapas_acceso ADD COLUMN en jsonb NOT NULL DEFAULT '{}';
ALTER TABLE secciones ADD COLUMN en_borrador jsonb NOT NULL DEFAULT '{}', ADD COLUMN en_publicado jsonb NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE secciones DROP COLUMN en_borrador, DROP COLUMN en_publicado;
ALTER TABLE mapas_acceso DROP COLUMN en;
ALTER TABLE albumes DROP COLUMN en;
ALTER TABLE seo DROP COLUMN en;
ALTER TABLE legal DROP COLUMN en;
ALTER TABLE paginas DROP COLUMN en;
ALTER TABLE faq DROP COLUMN en;
