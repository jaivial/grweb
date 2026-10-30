# Migración de la web anterior y corte · GR Cup

Cómo pasan los datos de la web anterior (ASP.NET Core + MySQL `grcup`, en `/var/www/grweb`) a la plataforma y cómo
se cambia el tráfico con una vuelta atrás posible. **El corte en producción necesita la aprobación expresa del
organizador**; hasta entonces la web anterior sigue sirviendo sin cambios.

> Reglas que no se rompen: el ETL **solo lee** MySQL: sesión `READ ONLY` y un usuario con solo `SELECT`. Lee
> siempre una **copia restaurada**, nunca la base en marcha. QA **nunca** recibe datos personales de producción: se
> ensaya con la base sintética (`deploy/scripts/legado-qa.sh`).

> **El sistema anterior también es el de FER.** `grcup-api.service` (127.0.0.1:5006) y su MySQL atienden también a
> fercup.com y backoffice.fercup.com (`Competiciones.Tipo = 'fer'`). El corte **solo mueve GR Cup**:
> - el backend y la MySQL anteriores **siguen en marcha** para FER;
> - el ETL no migra competiciones de FER ni usuarios que solo pertenecen a FER;
> - el webhook de Stripe que entra por el dominio de GR Cup sigue llegando al backend anterior (sección 6).

## 1. Qué se migra

Un comando `etl-mysql` por servicio, ejecutado como Job con la imagen, la base y los secretos del propio servicio
(`deploy/scripts/migrar-legado.sh`).

**Cómo funciona:**
- **Orden:** competition → identity → athletes → raffle → live → cms.
- **Una transacción por servicio:** si falla, ese servicio no escribe nada.
- **Ids derivados de los antiguos (UUIDv5):** repetirlo solo añade lo que falte.
- **`--dry-run`:** informa sin escribir.

| Web anterior (MySQL) | Plataforma | Regla |
|---|---|---|
| `Competiciones` | competition · `competiciones` | Solo `Tipo = 'grcup'`: GR Cup 2025 → `grcup-2025`, GR Cup 2026 → `grcup`, otra de GR Cup → su slug; las de FER, no. `--mapa id=slug` (o `id=-`) manda. Una edición que ya existe conserva sus datos. Las celebradas quedan `finalizado`. Al final deja el mapa de ediciones en Redis (`legado:ediciones`, 30 días) para los demás pasos. |
| `Usuarios` | identity · `usuarios` | Solo quien tiene una membresía aceptada en una edición migrada, más los Root antiguos. Misma contraseña: el hash PBKDF2-SHA256 se guarda como `$pbkdf2-sha256$…` y pasa a argon2id en el primer acceso. `IsRoot`/`IsSuperadmin` → Root; `IsActive = 0` → suspendido. Un email que ya existe conserva su cuenta. |
| `UsuariosCompeticiones` | identity · `membresias` | root/admin → Admin, staff → Staff, registrador → Taquilla. Las invitaciones sin aceptar no se migran (se reinvita desde Equipo). |
| `UsuariosPermissions` | — | Aquí los permisos van por rol: el informe los cuenta para revisarlos en «Equipo y permisos». |
| `Inscripciones` | athletes · `inscripciones`, `atletas`, `perfiles`, `historial` | Pagada o confirmada → atleta `confirmado` (origen `propia`) con perfil y la inscripción `pagada`/`gratuita`. Un pago abandonado → inscripción `cancelada`, sin atleta ni contacto. Importes en céntimos; el cupón y el referido, con su descuento. |
| `Inscripciones` (personas) | crm · `contactos` (por evento) | Solo atletas confirmados: relación «atleta» y el consentimiento de **privacidad** (`AceptaTerminos`, versión `web-anterior`). **Ningún consentimiento de novedades ni WhatsApp**: la web anterior no los recogía. |
| `CuponesDescuento` | athletes · `cupones` | porcentaje → porcentaje; fijo → importe. Usos = inscripciones pagadas con él. En ediciones celebradas quedan inactivos. |
| `CodigosReferido`, `NewUserReferrals` | athletes · `referido_codigos`, `referido_usos` | Usos devueltos → `devuelta`. El resto → `sin_devolucion`, **nunca `pendiente`**: el proceso de devoluciones no debe actuar sobre pagos de la web anterior. |
| `RifaConfigs` | raffle · `config` | Solo si la edición no tiene sorteo configurado. La venta queda **cerrada** (se activa tras el checklist legal). El ganador antiguo va al informe; no se crea un sorteo porque no fue verificable. |
| `RifaTickets` | raffle · `compras`, `boletos` (+ crm por evento) | Una compra por pago (o comprador y minuto). Los boletos conservan su número. Las compras sin pagar → `caducada`, sin boletos. |
| `LiftEntriesInscripcion` | live · `intentos`, `resultados`, `estado` | Solo ediciones celebradas: una mesa por categoría y la misma clasificación que el directo; quedan publicadas y en `finalizado`. Dos blancas → válido, dos rojas → nulo. Sin decisión, o un intento que falta entre otros → renuncia. Sustituye los resultados de «Datos de ejemplo». |
| Rutas públicas antiguas | cms · `redirecciones` | 301 `/raffle`, `/checkout`, `/success` → `/sorteo`; `/privacy` → `/privacidad`; `/terms` → `/terminos`. Las demás rutas conservan su path. |

## 2. Qué no se migra

| Web anterior | Por qué | Qué hacer |
|---|---|---|
| `Schedules`, `SchedulePublishedConfig` | El horario nuevo son flights con lotes y plataformas. | Rehacerlo en «Horarios» con el planificador. |
| `InscripcionConfig`, `ReferidosConfig`, `ReferidosUserSetting` | Cuota, plazos y recompensas se revisan para la edición. | «Atletas › Inscripción». |
| `EmailConfig`, `StripeConfig` | Son secretos. | Configurarlos en «Sistema e integraciones» (SMTP, Stripe), con su prueba. |
| `NewsletterEmails*`, `NewsletterSendProgress` | Historial de envíos sin destinatarios con consentimiento. | Queda en la copia de MySQL. |
| Competiciones de FER (`Tipo = 'fer'`), sus inscripciones, cupones, sorteo y los usuarios que solo son de FER | Son de otra web que sigue en el sistema anterior. | Nada: el ETL las deja fuera por defecto y lo dice en el informe. |
| `Participants`, `Draws`, `Athletes`, `LiftEntries` | Tablas de la primera versión, sin competición. Vacías en la copia del 03/06/2026. | El informe las cuenta. |
| `TutorialInteractions`, `InscripcionesPreparadas`, `ResponsableInscripcion`, `UrlInscripcion` | Estado de la interfaz antigua. | — |
| QR y hora de check-in de `Inscripciones` | Las entradas y el check-in son nuevos. | El informe cuenta los check-ins. |

**Para la asesoría (RGPD):**
- Se migran los contactos de atletas y compradores solo con la base de privacidad que ya tenían, sin consentimiento de marketing.
- Para enviarles novedades hace falta una campaña de re-permiso con doble opt-in, o tratarlos como interés legítimo si la asesoría lo valida.
- La copia de MySQL se conserva cifrada el plazo de retención que se decida (propuesta: 12 meses) y después se borra.

## 3. Ensayo en QA (base sintética)

```bash
cd platform
deploy/scripts/legado-qa.sh                                   # MySQL sintético en grcup-qa (usuario etl, solo SELECT)
deploy/scripts/migrar-legado.sh --dry-run --mapa 2=grcup-etl,3=- --etiqueta "Datos de ejemplo" --web grcup
deploy/scripts/migrar-legado.sh           --mapa 2=grcup-etl,3=- --etiqueta "Datos de ejemplo" --web grcup
deploy/scripts/migrar-legado.sh           --mapa 2=grcup-etl,3=- --etiqueta "Datos de ejemplo" --web grcup   # 2.ª vez: nada nuevo
deploy/scripts/legado-qa.sh --borrar                          # al terminar
```

**Por qué esas opciones en QA:**
- `2=grcup-etl` lleva la edición 2026 sintética a una edición nueva, para no mezclarla con la de QA.
- `3=-` excluye la competición de pruebas.
- `--etiqueta "Datos de ejemplo"` mantiene el aviso de ejemplo en `/resultados/2025`.

Resultado del ensayo: ver la sección 8.

## 4. Requisitos antes del corte (bloqueantes)

1. **Aprobación expresa del organizador**, y fecha fuera de un plazo de inscripción abierto y lejos del evento.
2. **Producción preparada** (docs/runbooks/PRODUCCION.md › 10):
   - `overlays/prod` con los dominios y el SMTP confirmados;
   - `secretos.sh prod`, `redis-acl.sh prod` y `copias-remotas.sh prod`;
   - `desplegar.sh prod --confirmo-produccion`. No ejecuta ningún seed de «Datos de ejemplo»; solo crea el Root.
3. **Integraciones reales** probadas desde «Sistema»:
   - SMTP con SPF, DKIM y DMARC correctos;
   - Stripe en modo live, con los webhooks de inscripción, entradas y sorteo apuntando a la API nueva;
   - en el panel de Stripe, la lista de endpoints que usan `https://grcup.jaimedigitalstudio.com/api/webhooks/stripe`:
     - los de FER se pasan a `https://fercup.com/api/webhooks/stripe` (fercup.com ya envía `/api/` al backend anterior);
     - o se mantiene la excepción de nginx de la sección 6;
   - WhatsApp (evo-weai), si se usa.
4. **Usuarios Root revisados**: el informe de identity lista quién pasa a Root. En la web anterior lo eran del sistema
   entero (GR Cup y FER); quien no deba administrar GR Cup se baja de rol en «Equipo y permisos» antes de abrir.
5. **FER avisado**:
   - su backoffice es `backoffice.fercup.com`; `grcup.jaimedigitalstudio.com/backoffice` deja de existir con el corte;
   - FER no cambia nada más.
6. **Asesoría:** textos legales, sorteo, consentimientos y menores. Checklist legal del sorteo hecho por el organizador.
7. **Ensayo general (T-7)** con una copia real de producción, en el namespace de producción antes de abrirlo (nunca en QA):
   - ejecutar `--dry-run`, después el ETL real y la conciliación (sección 7);
   - borrar las bases y volver a empezar limpio.

## 5. Dominios, DNS y CDN

**Decidido el 30/10/2026:** la plataforma vive en subdominios de `menustudioai.com`, como QA:

| Host | Uso |
|---|---|
| `grcup.menustudioai.com` | web pública |
| `grcup-bo.menustudioai.com` | backoffice |
| `grcup-api.menustudioai.com` | API: webhooks de la plataforma, CLI |

- **DNS en Cloudflare**, solo DNS (sin proxy): A → IP pública de kraken (65.109.100.94).
- **Un certificado** de Let's Encrypt para los tres (DNS-01 con Cloudflare, como QA).
- **Sin CDN delante:** el directo, los horarios y el sorteo usan SSE, y los límites por IP necesitan la IP real.
- **`deploy/scripts/nginx-prod.sh instalar --confirmo-produccion`** hace todo en orden: certificado, site propio (`/etc/nginx/sites-available/grcup.menustudioai.com.conf`), `nginx -t`, recarga y, al final, los registros DNS (`dns-cloudflare.sh prod`).
  - Necesita la plataforma desplegada en `grcup`.
  - No toca el dominio anterior.

**El dominio anterior, `grcup.jaimedigitalstudio.com`, pasa a redirigir con 301 a la web nueva** (misma ruta; la plataforma ya redirige las rutas antiguas que cambiaron).
- `/backoffice` va al backoffice nuevo.
- `= /api/webhooks/stripe` sigue en el backend anterior por FER.
- **CDN:** el dominio pasa por BunnyCDN (DNS en Bunny DNS, borde 37.19.215.33 → origen kraken), así que no hace falta tocar su DNS. Tras cada cambio de su server block hay que **purgar la caché de la pull zone** en el panel de Bunny.
- **Certificado del origen:** el comodín `jaimedigitalstudio.com-0001` caducó el 18/04/2026 (su renovación DNS-01 usaba Cloudflare y el dominio ya no está allí). El borde de Bunny tiene el suyo y hoy funciona igual. Si Bunny pasara a verificar el origen, habría que renovarlo por HTTP-01.
- **Modos de `nginx-prod.sh`** para el dominio anterior: `mantenimiento` (503), `redirigir` (301) y `anterior` (su server block original, guardado la primera vez).
  - Si `nginx -t` falla, se vuelve al fichero previo sin recargar.
  - `probar` comprueba en local los dos ficheros juntos: el site nuevo y el dominio anterior con su QUIC.

## 6. Plan de corte

| Momento | Paso |
|---|---|
| T-1 | La plataforma ya está desplegada en `grcup` y publicada en sus subdominios (`nginx-prod.sh instalar`), todavía sin anunciar. Congelar cambios en la web anterior. Avisar al equipo de la ventana. |
| T0 · 0′ | **Web de GR Cup en mantenimiento** (`nginx-prod.sh mantenimiento --confirmo-produccion` y purgar Bunny): el server de `grcup.jaimedigitalstudio.com` sirve una página 503 a todo, salvo a la IP del operador y a `location /api/webhooks/stripe` (sigue yendo a 127.0.0.1:5006, por FER). fercup.com y backoffice.fercup.com no se tocan. Stripe reintenta sus webhooks hasta 3 días: no se pierden. |
| T0 · 5′ | **Copia final**: `mysqldump --single-transaction --routines grcup` (como `scripts/db-backup.sh`), con su `sha256sum`. |
| T0 · 10′ | **Restaurar la copia en una MySQL aislada**: un pod efímero como `legado-mysql` en el namespace de producción, con un usuario de solo `SELECT`. **Nunca** apuntar el ETL a la MySQL en marcha. |
| T0 · 15′ | `migrar-legado.sh --dry-run`: leer el informe completo (omitidos y notas). Si algo no cuadra, **parar** y volver atrás (sección 9). |
| T0 · 20′ | `migrar-legado.sh` (real). Guardar la salida con el informe. |
| T0 · 30′ | **Conciliación** (sección 7). Si no cuadra: vuelta atrás. |
| T0 · 40′ | **Pruebas de humo**: home, inscripción hasta el pago (Stripe live con importe mínimo y devolución), sorteo, entradas, `/resultados/2025`, login de un usuario migrado con su contraseña antigua, Salud 12/12. |
| T0 · 50′ | **Cambio de tráfico** (`nginx-prod.sh redirigir --confirmo-produccion` y purgar Bunny): `grcup.jaimedigitalstudio.com` responde 301 a `https://grcup.menustudioai.com` con la misma ruta (`/backoffice` → backoffice nuevo); `= /api/webhooks/stripe` sigue en 127.0.0.1:5006 mientras FER tenga allí su endpoint. Los webhooks de GR Cup en Stripe pasan a `https://grcup-api.menustudioai.com`. |
| T0 · 60′ | Abrir. Vigilar Salud (p95, errores) y Mailpit/SMTP. |
| T+1…T+7 | Revisión diaria: pagos de Stripe frente a inscripciones y compras, rebotes, incidencias. **T+7: punto de no retorno.** |

## 7. Conciliación (antes de abrir)

Cada cifra de la web anterior (consulta sobre la copia) debe coincidir con la nueva. Solo cuentan las
competiciones de GR Cup, las del mapa; las de FER quedan fuera:

| Qué | Web anterior (MySQL) | Plataforma (PostgreSQL) |
|---|---|---|
| Atletas por edición | `SELECT CompeticionId, count(*) FROM Inscripciones WHERE PagoConfirmado OR ParticipacionConfirmada GROUP BY 1` | `SELECT competition_id, count(*) FROM atletas WHERE origen = 'propia' GROUP BY 1` |
| Cobrado en inscripciones | `SELECT CompeticionId, sum(TotalPagado) FROM Inscripciones WHERE PagoConfirmado GROUP BY 1` | `SELECT competition_id, sum(total) / 100.0 FROM inscripciones WHERE estado = 'pagada' GROUP BY 1` |
| Boletos vendidos | `SELECT CompeticionId, count(*) FROM RifaTickets WHERE Confirmado GROUP BY 1` | `SELECT competition_id, count(*) FROM boletos GROUP BY 1` |
| Usuarios de GR Cup | `SELECT count(DISTINCT u.Id) FROM Usuarios u LEFT JOIN UsuariosCompeticiones uc ON uc.UsuarioId = u.Id AND uc.InvitationAccepted LEFT JOIN Competiciones c ON c.Id = uc.CompeticionId AND c.Tipo = 'grcup' WHERE u.IsRoot OR u.IsSuperadmin OR c.Id IS NOT NULL` | `SELECT count(*) FROM usuarios` (menos los que ya existían) |
| Intentos de ediciones celebradas | `SELECT count(*) FROM LiftEntriesInscripcion` | `SELECT count(*) FROM intentos` (más las renuncias añadidas del informe) |

El informe de cada paso ya da leídos, escritos y omitidos con su motivo. La conciliación lo comprueba con
consultas independientes.

## 8. Resultado del ensayo en QA

**30/10/2026 · base sintética** (3 competiciones, 5 usuarios, 74 inscripciones, 342 intentos, 92 boletos):

**Informe del ETL:**

| Paso | Escritos | Omitidos y notas |
|---|---|---|
| competition | `grcup-etl` creada (borrador) | `grcup-2025` ya existía (se conservan sus datos); la competición de pruebas, excluida con `--mapa`. |
| identity | 5 usuarios (1 Root, 1 suspendido); 5 membresías: 2 Admin, 2 Staff, 1 Taquilla | 1 invitación sin aceptar; 1 membresía de la competición excluida; 3 permisos individuales a revisar. |
| athletes | 66 atletas con perfil; 74 inscripciones (64 pagadas, 2 gratuitas, 8 canceladas); 3 cupones; 5 códigos de referido; 3 usos (1 devuelto, 2 sin devolución); 66 contactos enviados a crm | 4 franjas de horario y la configuración de referidos, a rehacer en el backoffice. |
| raffle | 2 configuraciones (venta cerrada); 26 compras (23 pagadas, 3 caducadas); 85 boletos con su número; 23 contactos | El ganador antiguo (boleto 0042), solo en el informe. |
| live | 351 intentos: 287 válidos, 53 nulos, 11 renuncias (9 no registrados y 2 sin decisión); 12 categorías publicadas; 2025 en `finalizado` | — |
| cms | 5 redirecciones 301 | — |

**Segunda pasada:** no escribe nada. Todo sale como «ya importado» o «sin cambios».

**30/10/2026 · con una competición de FER en la base sintética** (Tipo `fer`: 3 inscripciones, 8 boletos y un
usuario que solo es de FER). El ETL la deja fuera en todos los pasos:
- **competition:** «de otra web del mismo backend: sigue en la web anterior».
- **identity:** 2 usuarios sin membresía en las ediciones migradas (el de FER y la invitación sin aceptar); 3 membresías de competiciones no migradas.
- **athletes:** 3 inscripciones de una competición no migrada.
- **raffle:** 2 compras de una competición no migrada.

Nada más cambia.

**Conciliación:** coinciden todas las cifras:
- atletas: 40 y 26;
- cobrado: 1800,00 € y 1150,00 €;
- boletos: 64 y 21;
- usuarios: 5;
- intentos: 342 más 9 renuncias, 351;
- contactos en crm: 56 en 2025 (40 atletas y 16 compradores) y 33 en 2026 (26 atletas y 7 compradores).

**Comprobaciones:**
- **Emails:** Mailpit no recibe ninguno (125 antes y después): el ETL no avisa a nadie.
- **Contraseñas:**
  - un usuario migrado entra con su contraseña antigua y su hash pasa a argon2id;
  - una contraseña errónea da 401; el usuario suspendido, 403.
- **Base heredada:** el usuario `etl` no puede escribir: `DELETE` → `ERROR 1142`.
- **Rutas:** `/raffle`, `/checkout` y `/success` → 301 a `/sorteo`; `/privacy` → `/privacidad`; `/terms` → `/terminos`.
- **Resultados:** `/resultados/2025` muestra las 12 categorías importadas. Sin peso corporal no hay puntos GL, así que se ocultan «Mejor levantador/a» y el orden por GL.
- **Backoffice:** la edición importada se ve completa (atletas, fichas, cupones, referidos, pagos, sorteo, contactos y equipo). «Resultados» de 2025 aparece como archivo de solo lectura.

## 9. Vuelta atrás

| Cuándo | Cómo | Datos |
|---|---|---|
| **Antes de abrir** (hasta T0 · 60′) | `nginx-prod.sh anterior --confirmo-produccion` y purgar Bunny: el dominio anterior vuelve a su server block original (guardado en T0 · 0′). FER no se ve afectado en ningún tramo. | Nada se perdió: MySQL no se tocó y la plataforma aún no recibió a nadie. Las bases nuevas se vacían antes del siguiente intento. |
| **Después de abrir, antes de T+7** | Solo ante un incidente bloqueante (pagos que fallan, pérdida de datos). nginx → web anterior; webhooks de Stripe → API antigua. | Lo creado en la plataforma desde la apertura se exporta en CSV desde el backoffice: atletas e inscripciones, compras del sorteo, entradas, contactos. Se da de alta a mano en la web anterior, conciliando con los pagos de Stripe del periodo. |
| **Después de T+7** | Sin vuelta atrás: se corrige hacia delante (`rollout undo` de un servicio, restaurar una base desde la copia nocturna). | La copia final de MySQL queda archivada, cifrada, el plazo de retención. |

Después del corte, el frontend antiguo de GR Cup (`/var/www/grweb/frontend/dist`) deja de servirse en su dominio.
**`grcup-api.service` y la MySQL no se detienen**: siguen atendiendo a FER. Las competiciones de GR Cup del
backoffice antiguo las marca el organizador como inactivas en T+7, para que nadie las edite por error. No se
borra nada del sistema anterior.
