-- +goose Up
-- QA U04-R1-4: «Section / Alta de atleta» with the texts of Figma 74 (only where the old example texts are still in place).
UPDATE secciones SET
  borrador = borrador || '{"eyebrow": "GR Cup 2026 · Alta de atleta", "titulo": "Crea tu perfil de atleta", "texto": "Si compites en la GR Cup 2026, crea tu perfil de atleta: foto, club y mejores marcas. Lo revisamos a mano y lo publicamos en la lista de atletas."}'::jsonb,
  publicado = publicado || '{"eyebrow": "GR Cup 2026 · Alta de atleta", "titulo": "Crea tu perfil de atleta", "texto": "Si compites en la GR Cup 2026, crea tu perfil de atleta: foto, club y mejores marcas. Lo revisamos a mano y lo publicamos en la lista de atletas."}'::jsonb
WHERE clave = 'alta-atleta' AND publicado->>'titulo' = 'Completa tu ficha de atleta' AND borrador->>'titulo' = 'Completa tu ficha de atleta';

-- +goose Down
SELECT 1;
