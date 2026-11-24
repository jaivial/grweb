-- +goose Up
-- BIZ-178 (Google Cloud brand verification): la política de privacidad debe detallar los datos de Google que usa
-- la app (OAuth de Gmail del organizador: openid, email, gmail.send) y la declaración de «Uso limitado».
-- Se publica la versión 2026.12 de «privacidad» a partir de la 2026.11 en vigor y se despublica la anterior
-- (las filas se conservan: los consentimientos citan su versión).
CREATE TEMP TABLE biz178_base ON COMMIT DROP AS
SELECT competition_id, titulo, contenido, en FROM legal
WHERE tipo = 'privacidad' AND version = '2026.11' AND publicado_at IS NOT NULL;

UPDATE legal l SET publicado_at = NULL
FROM biz178_base b
WHERE l.competition_id = b.competition_id AND l.tipo = 'privacidad' AND l.version = '2026.11';

INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, en, hash, publicado_at)
SELECT gen_random_uuid(), competition_id, 'privacidad', '2026.12', titulo, nuevo,
       CASE WHEN en ? 'contenido' THEN jsonb_set(en, '{contenido}', to_jsonb((en->>'contenido') || $en$

## Google data (Gmail integration)

The public GRS Cup website never asks visitors, athletes or ticket buyers to sign in with Google. The only Google integration is used by the organising team from the back office: it may voluntarily connect a Gmail account so that the championship emails (ticket and registration confirmations, notices and news) are sent from that account.

When the account is connected we only request these permissions:

- `openid` and `email`: to know which Gmail address was connected and show it in the back office.
- `https://www.googleapis.com/auth/gmail.send`: to send emails on behalf of that account.

Data we store: the email address of the connected account and the refresh token issued by Google (encrypted) in our database. We never read, store or analyse the inbox, contacts or any other content of the Google account.

Use of the data: only to send the championship emails configured by the organiser. We do not use Google data for advertising, we do not sell it, we do not share it with third parties and we do not use it to train artificial intelligence models or to generate content.

Retention and revocation: the data is kept while the account stays connected. The organiser can disconnect it at any time from «System and integrations › Integrations · Gmail» (we then delete the token) or revoke access at https://myaccount.google.com/permissions, after which the token stops working. You can also request its deletion by writing to admin@grstrength.com.

GRS Cup's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.$en$)) ELSE en END,
       encode(sha256(convert_to(nuevo, 'UTF8')), 'hex'), now()
FROM (SELECT *, contenido || $es$

## Datos de Google (integración con Gmail)

La web pública de GRS Cup no pide a los visitantes, atletas ni compradores de entradas que inicien sesión con Google. La única integración con Google la usa el equipo organizador desde el backoffice: puede conectar voluntariamente una cuenta de Gmail para que los correos del campeonato (confirmaciones de entradas e inscripciones, avisos y novedades) se envíen desde esa cuenta.

Al conectar la cuenta solicitamos únicamente estos permisos:

- `openid` y `email`: para saber qué dirección de Gmail se ha conectado y mostrarla en el backoffice.
- `https://www.googleapis.com/auth/gmail.send`: para enviar correos en nombre de esa cuenta.

Qué datos guardamos: la dirección de email de la cuenta conectada y el token de actualización que entrega Google (cifrado) en nuestra base de datos. No leemos, guardamos ni analizamos la bandeja de entrada, los contactos ni ningún otro contenido de la cuenta de Google.

Uso de los datos: solo para enviar los correos del campeonato que el propio organizador configura. No usamos los datos de Google para publicidad, no los vendemos, no los compartimos con terceros y no los usamos para entrenar modelos de inteligencia artificial ni para generar contenido.

Conservación y revocación: los datos se conservan mientras la cuenta esté conectada. El organizador puede desconectarla en cualquier momento desde «Sistema e integraciones › Integraciones · Gmail» (al hacerlo eliminamos el token) o revocar el acceso en https://myaccount.google.com/permissions, tras lo cual el token deja de ser válido. También puedes pedir su supresión escribiendo a admin@grstrength.com.

El uso y la transferencia de la información recibida de las APIs de Google por parte de GRS Cup cumplen la [Política de datos de usuario de los servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de Uso limitado.$es$ AS nuevo FROM biz178_base) b
ON CONFLICT (competition_id, tipo, version) DO NOTHING;

-- +goose Down
UPDATE legal SET publicado_at = now()
WHERE tipo = 'privacidad' AND version = '2026.11'
  AND competition_id IN (SELECT competition_id FROM legal WHERE tipo = 'privacidad' AND version = '2026.12');
DELETE FROM legal WHERE tipo = 'privacidad' AND version = '2026.12';
