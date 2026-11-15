-- +goose Up
-- Módulos del backoffice que una edición puede apagar (orden 15-nov 13:05): «clubs» y «mesa-directo».
-- Las ediciones que ya existen (GRS Cup 2) los apagan: los resultados en vivo los lleva OpenLifter y los clubs no se
-- usan en esta edición. Se reactivan en Evento y módulos › Módulos; no se borra código ni datos.
UPDATE competiciones
SET modulos = modulos || jsonb_build_object('clubs', jsonb_build_object('activo', false, 'bloqueado', false)), updated_at = now()
WHERE NOT (modulos ? 'clubs');
UPDATE competiciones
SET modulos = modulos || jsonb_build_object('mesa-directo', jsonb_build_object('activo', false, 'bloqueado', false)), updated_at = now()
WHERE NOT (modulos ? 'mesa-directo');

-- +goose Down
UPDATE competiciones SET modulos = modulos - 'clubs' - 'mesa-directo';
