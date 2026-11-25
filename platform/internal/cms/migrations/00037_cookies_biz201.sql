-- +goose Up
-- BIZ-201 (cookies conforme a la UE): política de cookies completa (ES + EN) con las cookies propias, el
-- almacenamiento del navegador, los terceros (Stripe, YouTube, Twitch) y el consentimiento. Se publica la versión
-- 2026-11 de «cookies» a partir de la publicada y se despublica la anterior (las filas se conservan).
CREATE TEMP TABLE biz201_base ON COMMIT DROP AS
SELECT DISTINCT ON (competition_id) competition_id, version FROM legal
WHERE tipo = 'cookies' AND publicado_at IS NOT NULL AND version <> '2026-11'
ORDER BY competition_id, publicado_at DESC;

UPDATE legal l SET publicado_at = NULL
FROM biz201_base b
WHERE l.competition_id = b.competition_id AND l.tipo = 'cookies' AND l.version = b.version;

-- +goose StatementBegin
INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, en, hash, publicado_at)
SELECT gen_random_uuid(), competition_id, 'cookies', '2026-11', 'Política de cookies', nuevo,
       jsonb_build_object('titulo', 'Cookie policy', 'contenido', $en$Last updated: 25 November 2026.

## What cookies are

Cookies are small files that a website stores in your browser to remember information between visits. This policy also covers similar technologies, such as the browser's local storage (localStorage and sessionStorage), which keeps data on your own device.

The GRS Cup 2 website does not use analytics, advertising or tracking cookies, and we do not build profiles of visitors.

## Who is responsible

GR Strength (GRStrength), organiser of GRS Cup 2. Website: https://www.grteam.net. Contact email: admin@grstrength.com.

## Our own cookies

They are technical cookies, strictly necessary to provide the service you ask for (signing in). They are only set when you sign in to the relevant area and are exempt from consent (art. 22.2 of the Spanish LSSI).

| Name | Purpose | Duration | Type |
| --- | --- | --- | --- |
| `gr_area` | Keep your athlete area session | 30 days | Technical, necessary |
| `grcup_fan` | Keep your session in the pool, the fantasy game and the live chat | 30 days | Technical, necessary |
| `gr_rt` | Keep the organising team's back-office session (not used on the public website) | 30 days | Technical, necessary |

All of them are secure cookies (`Secure` and `HttpOnly`): they only travel over encrypted connections and cannot be read by the page's code.

## Storage in your browser

We keep some data on your device to remember preferences or what you were doing. It is never sent to third parties and you can delete it whenever you like.

| Key | Purpose | Duration |
| --- | --- | --- |
| `grcup_cookies` | Remember your cookie choice (version, date and whether you accept third-party content) | Until you delete it or this policy changes |
| `grcup_sobre_ok` | Remember that you have read the home page notice | Until you delete it |
| `gr-favoritos` | Athletes you follow («My schedule») | Until you delete it |
| `grcup.fantasy.salas.favoritas` | Your favourite fantasy rooms | Until you delete it |
| `gr-inscripcion-borrador` | Draft of your registration, so you do not lose what you typed | Until you finish or delete it |
| `gr-story-zoom` | Zoom chosen when sharing your athlete card | Until you delete it |
| `grcup:alta-atleta:borrador` | Draft of the athlete sign-up | Until you close the tab |
| `gr.entradas.borrador` | Draft of the ticket booking | Until you close the tab |
| `grcup_borrador_voluntario` | Draft of the volunteer form | Until you close the tab |
| `gr-intencion` | Pending action after signing in (for example, following an athlete) | Until you close the tab |

## Third-party cookies

- **Stripe** (payments): only when you pay for a ticket or make a donation, Stripe loads its payment form and sets cookies needed to process the payment and prevent fraud. They are necessary for the service you ask for. [Stripe privacy policy](https://stripe.com/privacy) and [Stripe cookies](https://stripe.com/legal/cookies-policy).
- **YouTube (Google)**: the live broadcast may be streamed from YouTube, in its privacy-enhanced mode (youtube-nocookie.com). It only loads **if you accept** third-party content. [Google privacy policy](https://policies.google.com/privacy).
- **Twitch (Amazon)**: the broadcast may also be streamed from Twitch. It only loads **if you accept** third-party content. [Twitch privacy notice](https://www.twitch.tv/p/legal/privacy-notice/) and [Twitch cookie policy](https://www.twitch.tv/p/legal/cookie-policy/).

Until you accept, instead of the video you will see a notice with a button to accept and watch it.

## Legal basis

Necessary cookies and storage are exempt from consent because they are essential to provide the service you request (art. 22.2 of Spanish Law 34/2002, LSSI, and art. 5(3) of Directive 2002/58/EC). Third-party content (YouTube and Twitch) is only loaded with your consent, which you can give or withdraw at any time.

## How to accept, reject or change your choice

On your first visit you will see a notice with two buttons of the same size: «Accept» and «Reject optional». Closing or ignoring the notice does not count as accepting. You can change your choice at any time from the «Cookie settings» link in the footer. If you withdraw your consent we stop loading third-party content; any cookies those third parties had already set can be deleted from your browser.

## How to delete or block cookies in your browser

You can delete cookies and site data, or block them, from your browser settings:

- [Google Chrome](https://support.google.com/chrome/answer/95647)
- [Mozilla Firefox](https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox)
- [Safari](https://support.apple.com/guide/safari/sfri11471/mac)
- [Microsoft Edge](https://support.microsoft.com/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09)

If you block necessary cookies, you will not be able to sign in to the athlete area or the games.

## Changes to this policy

If we change the cookies we use, we will update this page and ask for your choice again.

## Contact

For any question about this policy, write to admin@grstrength.com.$en$),
       encode(sha256(convert_to(nuevo, 'UTF8')), 'hex'), '2026-11-25 10:00:00+01'
FROM (SELECT competition_id, $es$Última actualización: 25 de noviembre de 2026.

## Qué son las cookies

Las cookies son pequeños archivos que una web guarda en tu navegador para recordar información entre una visita y otra. Esta política también cubre tecnologías similares, como el almacenamiento local del navegador (localStorage y sessionStorage), que guarda datos en tu propio dispositivo.

En la web de la GRS Cup 2 no usamos cookies de analítica, de publicidad ni de seguimiento, y no elaboramos perfiles de los visitantes.

## Responsable

GR Strength (GRStrength), organizador de la GRS Cup 2. Sitio web: https://www.grteam.net. Email de contacto: admin@grstrength.com.

## Cookies propias

Son cookies técnicas, estrictamente necesarias para prestar el servicio que pides (iniciar sesión). Solo se instalan cuando inicias sesión en la zona correspondiente y están exentas de consentimiento (art. 22.2 de la LSSI).

| Nombre | Finalidad | Duración | Tipo |
| --- | --- | --- | --- |
| `gr_area` | Mantener la sesión del área de atleta | 30 días | Técnica, necesaria |
| `grcup_fan` | Mantener tu sesión en la porra, el fantasy y el chat del directo | 30 días | Técnica, necesaria |
| `gr_rt` | Mantener la sesión del equipo organizador en el backoffice (no se usa en la web pública) | 30 días | Técnica, necesaria |

Todas son cookies seguras (`Secure` y `HttpOnly`): solo viajan por conexión cifrada y no son accesibles desde el código de la página.

## Almacenamiento en tu navegador

Guardamos en tu dispositivo algunos datos para recordar preferencias o lo que estabas haciendo. No se envían a ningún tercero y puedes borrarlos cuando quieras.

| Clave | Finalidad | Duración |
| --- | --- | --- |
| `grcup_cookies` | Recordar tu elección sobre cookies (versión, fecha y si aceptas el contenido de terceros) | Hasta que la borres o cambie esta política |
| `grcup_sobre_ok` | Recordar que ya has leído el aviso de la página de inicio | Hasta que lo borres |
| `gr-favoritos` | Atletas que sigues («Mi horario») | Hasta que lo borres |
| `grcup.fantasy.salas.favoritas` | Tus salas favoritas del fantasy | Hasta que lo borres |
| `gr-inscripcion-borrador` | Borrador de tu inscripción para no perder lo escrito | Hasta que termines o lo borres |
| `gr-story-zoom` | Zoom elegido al compartir tu tarjeta del área de atleta | Hasta que lo borres |
| `grcup:alta-atleta:borrador` | Borrador del alta de atleta | Hasta cerrar la pestaña |
| `gr.entradas.borrador` | Borrador de la reserva de entradas | Hasta cerrar la pestaña |
| `grcup_borrador_voluntario` | Borrador del formulario de voluntarios | Hasta cerrar la pestaña |
| `gr-intencion` | Acción pendiente al volver de iniciar sesión (por ejemplo, seguir a un atleta) | Hasta cerrar la pestaña |

## Cookies de terceros

- **Stripe** (pagos): solo cuando pagas una entrada o haces una donación, Stripe carga su formulario de pago e instala cookies necesarias para procesar el pago y prevenir el fraude. Son necesarias para el servicio que pides. [Política de privacidad de Stripe](https://stripe.com/es/privacy) y [cookies de Stripe](https://stripe.com/es/legal/cookies-policy).
- **YouTube (Google)**: la retransmisión en directo puede emitirse desde YouTube, en su modo de privacidad mejorada (youtube-nocookie.com). Solo se carga **si aceptas** el contenido de terceros. [Política de privacidad de Google](https://policies.google.com/privacy).
- **Twitch (Amazon)**: la retransmisión también puede emitirse desde Twitch. Solo se carga **si aceptas** el contenido de terceros. [Aviso de privacidad de Twitch](https://www.twitch.tv/p/legal/privacy-notice/) y [política de cookies de Twitch](https://www.twitch.tv/p/legal/cookie-policy/).

Mientras no aceptes, en lugar del vídeo verás un aviso con un botón para aceptar y verlo.

## Base legal

Las cookies y el almacenamiento necesarios están exentos de consentimiento porque son imprescindibles para prestar el servicio que solicitas (art. 22.2 de la Ley 34/2002, LSSI, y art. 5.3 de la Directiva 2002/58/CE). El contenido de terceros (YouTube y Twitch) solo se carga con tu consentimiento, que puedes dar o retirar en cualquier momento.

## Cómo aceptar, rechazar o cambiar tu elección

En tu primera visita verás un aviso con dos botones del mismo tamaño: «Aceptar» y «Rechazar opcionales». Cerrar o ignorar el aviso no equivale a aceptar. Puedes cambiar tu elección cuando quieras desde el enlace «Configurar cookies» del pie de página. Si retiras el consentimiento dejamos de cargar el contenido de terceros; las cookies que esos terceros ya hubieran instalado puedes borrarlas desde tu navegador.

## Cómo borrar o bloquear las cookies en tu navegador

Puedes borrar las cookies y los datos de sitios, o bloquearlos, desde la configuración de tu navegador:

- [Google Chrome](https://support.google.com/chrome/answer/95647?hl=es)
- [Mozilla Firefox](https://support.mozilla.org/es/kb/Borrar%20cookies)
- [Safari](https://support.apple.com/es-es/guide/safari/sfri11471/mac)
- [Microsoft Edge](https://support.microsoft.com/es-es/microsoft-edge/eliminar-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09)

Si bloqueas las cookies necesarias, no podrás iniciar sesión en el área de atleta ni en los juegos.

## Cambios en esta política

Si cambiamos las cookies que usamos, actualizaremos esta página y te volveremos a pedir tu elección.

## Contacto

Para cualquier duda sobre esta política escribe a admin@grstrength.com.$es$ AS nuevo FROM biz201_base) b
ON CONFLICT (competition_id, tipo, version) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
UPDATE legal SET publicado_at = '2026-04-01 10:00:00+02'
WHERE tipo = 'cookies' AND version = '2026-04'
  AND competition_id IN (SELECT competition_id FROM legal WHERE tipo = 'cookies' AND version = '2026-11');
DELETE FROM legal WHERE tipo = 'cookies' AND version = '2026-11';
