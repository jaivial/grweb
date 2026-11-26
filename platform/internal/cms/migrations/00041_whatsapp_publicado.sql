-- +goose Up
-- The «Texto de avisos por WhatsApp» was only a draft (whatsapp-2026-11, with the «Datos de ejemplo» note): the alta
-- form hides the WhatsApp box until it is published, so no athlete could accept the notices. Publishes 2026.11 (the
-- draft without the note, naming the notices of the profile changes too, plus English) for every competition that
-- has no WhatsApp text in force.
-- +goose StatementBegin
INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash, publicado_at, pedir_aceptacion, en)
SELECT gen_random_uuid(), c.competition_id, 'whatsapp', '2026.11', 'Consentimiento de WhatsApp', t.es,
       encode(sha256(convert_to(t.es, 'UTF8')), 'hex'), now(), false,
       jsonb_build_object('titulo', 'WhatsApp consent', 'contenido', t.en)
FROM (SELECT DISTINCT competition_id FROM legal) c
CROSS JOIN (SELECT
$es$## Qué mensajes recibes
Si marcas esta casilla, GR Strength te escribe por WhatsApp para avisarte de tu alta de atleta (recibida, aprobada o rechazada), de los cambios de tu ficha (aprobados o rechazados) y de los avisos de la competición (pesaje, horarios y cambios de última hora).

## Quién recibe los mensajes
Tú y, si tu solicitud se acepta, el equipo de la organización. No hay grupos ni terceros.

## Tu número
Guardamos tu número solo para estos avisos, junto con la fecha en que aceptaste y la versión de este texto.

## Cómo darte de baja
Responde BAJA a cualquiera de nuestros mensajes: dejamos de escribirte y retiramos el consentimiento. También puedes escribir a admin@grstrength.com.$es$ AS es,
$en$## What messages you receive
If you tick this box, GR Strength writes to you on WhatsApp about your athlete registration (received, approved or rejected), the changes to your profile (approved or rejected) and the notices of the competition (weigh-in, schedules and last-minute changes).

## Who receives the messages
You and, if your request is accepted, the organising team. There are no groups or third parties.

## Your number
We keep your number only for these notices, together with the date you accepted and the version of this text.

## How to unsubscribe
Reply BAJA to any of our messages: we stop writing to you and withdraw the consent. You can also write to admin@grstrength.com.$en$ AS en) t
WHERE NOT EXISTS (SELECT 1 FROM legal x WHERE x.competition_id = c.competition_id AND x.tipo = 'whatsapp' AND x.publicado_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM legal x WHERE x.competition_id = c.competition_id AND x.tipo = 'whatsapp' AND x.version = '2026.11');
-- +goose StatementEnd

-- +goose Down
DELETE FROM legal WHERE tipo = 'whatsapp' AND version = '2026.11' AND publicado_por IS NULL AND pedir_aceptacion = false;
