-- +goose Up
-- QA U13-R1-2 (D-RIFA): the raffle is cash-only at the venue; the home «entradas» point and the FAQ still sold it online.
UPDATE secciones SET
  borrador  = jsonb_set(borrador,  '{puntos,2}', '{"titulo": "Rifa presencial", "texto": "Durante el evento hay rifa de material: boletos solo en efectivo en el recinto."}'),
  publicado = jsonb_set(publicado, '{puntos,2}', '{"titulo": "Rifa presencial", "texto": "Durante el evento hay rifa de material: boletos solo en efectivo en el recinto."}')
WHERE clave = 'entradas' AND publicado #>> '{puntos,2,titulo}' = 'Sorteo opcional · 1 € por boleto' AND borrador #>> '{puntos,2,titulo}' = 'Sorteo opcional · 1 € por boleto';
UPDATE faq SET pregunta = '¿Cómo funciona la rifa?', respuesta = 'La rifa es presencial: los boletos se compran en efectivo en el stand de la rifa durante el evento. No hay venta online. Consulta los objetos en la [página de la rifa](/sorteo).'
WHERE pregunta = '¿Cómo funciona el sorteo?' AND respuesta LIKE '1 € por boleto.%';
UPDATE secciones SET
  borrador  = borrador  || '{"titulo": "Rifa de *material* en el recinto", "texto": "Durante la competición rifamos material y premios donados. Los boletos se compran en el stand de la rifa, solo en efectivo."}',
  publicado = publicado || '{"titulo": "Rifa de *material* en el recinto", "texto": "Durante la competición rifamos material y premios donados. Los boletos se compran en el stand de la rifa, solo en efectivo."}'
WHERE clave = 'sorteo' AND publicado->>'texto' LIKE 'Elige cuántos boletos quieres y paga con tarjeta%' AND borrador->>'texto' LIKE 'Elige cuántos boletos quieres y paga con tarjeta%';

-- +goose Down
SELECT 1;
