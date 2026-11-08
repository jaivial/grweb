-- +goose Up
-- Alta de atleta (Figma p. 74–78): la sección «inscripciones» de la home pasa a «alta-atleta», los textos
-- legales nuevos quedan como borrador, la página /alta-atleta entra en el SEO y el FAQ habla del alta.

-- 1) Tipo de texto legal nuevo: «whatsapp» (consentimiento de WhatsApp).
ALTER TABLE legal DROP CONSTRAINT IF EXISTS legal_tipo_check;
ALTER TABLE legal ADD CONSTRAINT legal_tipo_check CHECK (tipo IN ('privacidad', 'terminos', 'cookies', 'consentimiento', 'whatsapp', 'bases-sorteo'));

-- 2) Textos legales nuevos como BORRADOR (publicado_at NULL): los revisa y publica la organización.
INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash)
SELECT gen_random_uuid(), c.competition_id, v.tipo, v.version, v.titulo, v.contenido, encode(sha256(v.contenido::bytea), 'hex')
FROM (SELECT DISTINCT competition_id FROM secciones) c
CROSS JOIN (VALUES
  ('consentimiento', '2026-11', 'Consentimiento de datos e imagen', $txt$> **Datos de ejemplo.** Texto provisional pendiente de revisión por la asesoría legal antes de publicar la web.

## Qué autorizas
Al marcar esta casilla autorizas a GR Strength (organizador de la GR Strength Cup) a publicar tu nombre, tus datos deportivos (club, categoría, división y marcas) y tu foto en la web de la competición, en la pantalla del pabellón y en la retransmisión en directo de la GR Cup.

## Quién ve esos datos
El público que visite la web o la pantalla del pabellón y los espectadores de la retransmisión en directo. Tu email y tu teléfono no se publican.

## La foto
Se publica en blanco y negro, recortada y comprimida para que todas las fichas sean uniformes. Puedes pedir que se retire en cualquier momento.

## Menores
Si tienes menos de 18 años, necesitaremos la autorización firmada de tu madre, padre o tutor antes de publicar tu ficha.

## Retirada
Escribe a admin@grstrength.com para pedir que retiremos tu foto y tu ficha de la web y del CDN.$txt$),
  ('whatsapp', 'whatsapp-2026-11', 'Consentimiento de WhatsApp', $txt$> **Datos de ejemplo.** Texto provisional pendiente de revisión por la asesoría legal antes de publicar la web.

## Qué mensajes recibes
Si marcas esta casilla, GR Strength te escribe por WhatsApp para avisarte de tu alta de atleta (recibida, aprobada o rechazada) y de los avisos de la competición (pesaje, horarios y cambios de última hora).

## Quién recibe los mensajes
Tú y, si tu solicitud se acepta, el equipo de la organización. No hay grupos ni terceros.

## Tu número
Guardamos tu número solo para estos avisos, junto con la fecha en que aceptaste y la versión de este texto.

## Cómo darte de baja
Responde BAJA a cualquiera de nuestros mensajes: dejamos de escribirte y retiramos el consentimiento. También puedes escribir a admin@grstrength.com.$txt$)
) AS v(tipo, version, titulo, contenido)
ON CONFLICT (competition_id, tipo, version) DO NOTHING;

-- 3) La sección «inscripciones» de la home pasa a «alta-atleta» (contenido del diseño aceptado).
UPDATE secciones
SET borrador = '{"eyebrow":"GR Cup 2026 · Plantilla completa","titulo":"Completa tu ficha de atleta","texto":"La plantilla de la GR Cup 2026 está completa. Si compites, completa tu ficha de atleta: foto, club y mejores marcas. La revisamos a mano y la publicamos en la lista de atletas.","cta":"Dar de alta mi atleta"}'::jsonb,
    publicado = '{"eyebrow":"GR Cup 2026 · Plantilla completa","titulo":"Completa tu ficha de atleta","texto":"La plantilla de la GR Cup 2026 está completa. Si compites, completa tu ficha de atleta: foto, club y mejores marcas. La revisamos a mano y la publicamos en la lista de atletas.","cta":"Dar de alta mi atleta"}'::jsonb,
    visible = true, pub_visible = true, publicado_at = COALESCE(publicado_at, now()), updated_at = now()
WHERE pagina = 'home' AND clave = 'alta-atleta';

UPDATE secciones s
SET clave = 'alta-atleta',
    borrador = '{"eyebrow":"GR Cup 2026 · Plantilla completa","titulo":"Completa tu ficha de atleta","texto":"La plantilla de la GR Cup 2026 está completa. Si compites, completa tu ficha de atleta: foto, club y mejores marcas. La revisamos a mano y la publicamos en la lista de atletas.","cta":"Dar de alta mi atleta"}'::jsonb,
    publicado = '{"eyebrow":"GR Cup 2026 · Plantilla completa","titulo":"Completa tu ficha de atleta","texto":"La plantilla de la GR Cup 2026 está completa. Si compites, completa tu ficha de atleta: foto, club y mejores marcas. La revisamos a mano y la publicamos en la lista de atletas.","cta":"Dar de alta mi atleta"}'::jsonb,
    visible = true, pub_visible = true, publicado_at = COALESCE(publicado_at, now()), updated_at = now()
WHERE s.pagina = 'home' AND s.clave = 'inscripciones'
  AND NOT EXISTS (SELECT 1 FROM secciones o WHERE o.competition_id = s.competition_id AND o.pagina = 'home' AND o.clave = 'alta-atleta');

DELETE FROM secciones WHERE pagina = 'home' AND clave = 'inscripciones';

-- 4) Las cifras de la home: «Atletas inscritos» → «Atletas en competición».
UPDATE secciones
SET borrador = jsonb_set(borrador, '{items,0,etiqueta}', '"Atletas en competición"'),
    publicado = CASE WHEN publicado IS NULL THEN NULL ELSE jsonb_set(publicado, '{items,0,etiqueta}', '"Atletas en competición"') END,
    updated_at = now()
WHERE pagina = 'home' AND clave = 'cifras'
  AND (borrador #>> '{items,0,etiqueta}' = 'Atletas inscritos' OR publicado #>> '{items,0,etiqueta}' = 'Atletas inscritos');

-- 5) SEO de la página pública de alta de atleta (indexable).
INSERT INTO seo (id, competition_id, ruta, title, description, indexable)
SELECT gen_random_uuid(), c.competition_id, '/alta-atleta',
       'Alta de atleta de powerlifting | GR Strength Cup',
       'Date de alta como atleta de la GR Strength Cup: crea tu perfil, sube tu foto y tus marcas AEP y compite con tu ficha lista para el pesaje.',
       true
FROM (SELECT DISTINCT competition_id FROM secciones) c
ON CONFLICT (competition_id, ruta) DO NOTHING;

-- 6) FAQ: la pregunta de inscripción pasa a explicar el alta de atleta y aparece la nueva FAQ del alta.
UPDATE faq
SET pregunta = '¿Cómo participo en la GR Cup?',
    respuesta = 'La inscripción y la lista de espera las gestiona la **AEP** y la plantilla está completa. Si compites en esta edición, lo que te falta es la ficha: [da de alta tu atleta](/alta-atleta) y te la revisamos a mano.'
WHERE pregunta = '¿Cómo me inscribo?';

INSERT INTO faq (id, competition_id, categoria, pregunta, respuesta, orden, destacada, publicada)
SELECT gen_random_uuid(), c.competition_id, 'Atletas', '¿Cómo completo mi ficha de atleta?',
       'Rellena el [formulario de alta de atleta](/alta-atleta) con tu nombre, el email con el que te inscribiste en la AEP, tu club y tus mejores marcas. Añade una foto si quieres: se publica en blanco y negro y recortada. El equipo revisa cada solicitud a mano y, cuando la aprueba, tu ficha aparece en la [lista de atletas](/atletas).',
       10, true, true
FROM (SELECT DISTINCT competition_id FROM faq) c
WHERE NOT EXISTS (SELECT 1 FROM faq f WHERE f.competition_id = c.competition_id AND f.pregunta = '¿Cómo completo mi ficha de atleta?');

-- 7) /en: el hero pierde el «Register» y la sección «Compete» lleva al alta de atleta.
UPDATE secciones
SET borrador = jsonb_set(borrador - 'cta', '{texto}',
      '"Registration was managed by the Spanish Powerlifting Association (AEP) and the field is complete. If you compete in this edition, complete your athlete profile (in Spanish): the team reviews it by hand and publishes it in the athlete list."'),
    publicado = CASE WHEN publicado IS NULL THEN NULL ELSE jsonb_set(publicado - 'cta', '{texto}',
      '"Registration was managed by the Spanish Powerlifting Association (AEP) and the field is complete. If you compete in this edition, complete your athlete profile (in Spanish): the team reviews it by hand and publishes it in the athlete list."') END,
    updated_at = now()
WHERE pagina = 'en' AND clave = 'hero';

UPDATE secciones
SET borrador = jsonb_set(jsonb_set(jsonb_set(borrador, '{cta}', '"Athlete sign-up (Spanish)"'),
        '{tituloAcento}', '"compete"'),
        '{texto}', '"Registration was managed by the Spanish Powerlifting Association (AEP) and the field is complete. If you compete in this edition, complete your athlete profile (in Spanish): the team reviews it by hand and publishes it in the athlete list."'),
    publicado = CASE WHEN publicado IS NULL THEN NULL ELSE jsonb_set(jsonb_set(jsonb_set(publicado, '{cta}', '"Athlete sign-up (Spanish)"'),
        '{tituloAcento}', '"compete"'),
        '{texto}', '"Registration was managed by the Spanish Powerlifting Association (AEP) and the field is complete. If you compete in this edition, complete your athlete profile (in Spanish): the team reviews it by hand and publishes it in the athlete list."') END,
    updated_at = now()
WHERE pagina = 'en' AND clave = 'compete';

-- +goose Down
DELETE FROM faq WHERE pregunta = '¿Cómo completo mi ficha de atleta?';
UPDATE faq SET pregunta = '¿Cómo me inscribo?', respuesta = 'La inscripción y la lista de espera las gestiona la **AEP** desde su web. Desde aquí te enlazamos a su formulario.' WHERE pregunta = '¿Cómo participo en la GR Cup?';
DELETE FROM seo WHERE ruta = '/alta-atleta';
DELETE FROM legal WHERE tipo = 'whatsapp' OR (tipo = 'consentimiento' AND version = '2026-11');
ALTER TABLE legal DROP CONSTRAINT IF EXISTS legal_tipo_check;
ALTER TABLE legal ADD CONSTRAINT legal_tipo_check CHECK (tipo IN ('privacidad', 'terminos', 'cookies', 'consentimiento', 'bases-sorteo'));
UPDATE secciones SET clave = 'inscripciones', borrador = '{"titulo":"Inscripciones","plazas":150,"texto":"La inscripción y la lista de espera las gestiona la AEP. Mientras, conoce a quienes compiten y consulta su horario."}'::jsonb,
    publicado = '{"titulo":"Inscripciones","plazas":150,"texto":"La inscripción y la lista de espera la gestiona la AEP. Mientras, conoce a quienes compiten y consulta su horario."}'::jsonb
WHERE pagina = 'home' AND clave = 'alta-atleta';
