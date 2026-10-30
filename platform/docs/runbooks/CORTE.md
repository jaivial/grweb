# Migración de la web anterior y corte · GR Cup

Cómo pasan los datos de la web anterior (ASP.NET Core + MySQL `grcup`, en `/var/www/grweb`) a la plataforma y cómo
se cambia el tráfico con una vuelta atrás posible. **El corte en producción necesita la aprobación expresa del
organizador**; hasta entonces la web anterior sigue sirviendo sin cambios.

> Reglas que no se rompen: el ETL **solo lee** MySQL: sesión `READ ONLY` y un usuario con solo `SELECT`. Lee
> siempre una **copia restaurada**, nunca la base en marcha. QA **nunca** recibe datos personales de producción: se
> ensaya con la base sintética (`deploy/scripts/legado-qa.sh`).

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
| `Competiciones` | competition · `competiciones` | GR Cup 2025 → `grcup-2025`, GR Cup 2026 → `grcup`, otra → su slug; `--mapa id=slug` (o `id=-`) manda. Una edición que ya existe conserva sus datos. Las celebradas quedan `finalizado`. Al final deja el mapa de ediciones en Redis (`legado:ediciones`, 30 días) para los demás pasos. |
| `Usuarios` | identity · `usuarios` | Misma contraseña: el hash PBKDF2-SHA256 se guarda como `$pbkdf2-sha256$…` y pasa a argon2id en el primer acceso. `IsRoot`/`IsSuperadmin` → Root; `IsActive = 0` → suspendido. Un email que ya existe conserva su cuenta. |
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

Resultado del ensayo: ver la sección 7.

## 4. Requisitos antes del corte (bloqueantes)

1. **Aprobación expresa del organizador**, y fecha fuera de un plazo de inscripción abierto y lejos del evento.
2. **Namespace de producción** con su overlay:
   - dominios definitivos y secretos propios (`secretos-qa.sh` como modelo);
   - **sin los Jobs `seed-*`**: siembran «Datos de ejemplo» y no deben correr en producción;
   - copias nocturnas fuera del nodo (hoy se guardan en el mismo nodo).
3. **Integraciones reales** probadas desde «Sistema»:
   - SMTP con SPF, DKIM y DMARC correctos;
   - Stripe en modo live, con los webhooks de inscripción, entradas y sorteo apuntando a la API nueva;
   - WhatsApp (evo-weai), si se usa.
4. **Asesoría:** textos legales, sorteo, consentimientos y menores. Checklist legal del sorteo hecho por el organizador.
5. **Ensayo general (T-7)** con una copia real de producción, en el namespace de producción antes de abrirlo (nunca en QA):
   - ejecutar `--dry-run`, después el ETL real y la conciliación (sección 6);
   - borrar las bases y volver a empezar limpio.

## 5. Plan de corte

| Momento | Paso |
|---|---|
| T-1 | Congelar cambios en la web anterior. Bajar el TTL de los registros DNS a 60 s. Avisar al equipo de la ventana. |
| T0 · 0′ | **Web anterior en mantenimiento**: nginx sirve una página 503 a todo salvo a la IP del operador. Stripe reintenta sus webhooks hasta 3 días: no se pierden. |
| T0 · 5′ | **Copia final**: `mysqldump --single-transaction --routines grcup` (como `scripts/db-backup.sh`), con su `sha256sum`. |
| T0 · 10′ | **Restaurar la copia en una MySQL aislada**: un pod efímero como `legado-mysql` en el namespace de producción, con un usuario de solo `SELECT`. **Nunca** apuntar el ETL a la MySQL en marcha. |
| T0 · 15′ | `migrar-legado.sh --dry-run`: leer el informe completo (omitidos y notas). Si algo no cuadra, **parar** y volver atrás (sección 8). |
| T0 · 20′ | `migrar-legado.sh` (real). Guardar la salida con el informe. |
| T0 · 30′ | **Conciliación** (sección 6). Si no cuadra: vuelta atrás. |
| T0 · 40′ | **Pruebas de humo**: home, inscripción hasta el pago (Stripe live con importe mínimo y devolución), sorteo, entradas, `/resultados/2025`, login de un usuario migrado con su contraseña antigua, Salud 12/12. |
| T0 · 50′ | **Cambio de tráfico**: nginx del dominio → gateway y web nuevos (la web anterior sigue en un host interno). Redirección `/backoffice*` → dominio del backoffice. Webhooks de Stripe → API nueva. |
| T0 · 60′ | Abrir. Vigilar Salud (p95, errores) y Mailpit/SMTP. |
| T+1…T+7 | Revisión diaria: pagos de Stripe frente a inscripciones y compras, rebotes, incidencias. **T+7: punto de no retorno.** |

## 6. Conciliación (antes de abrir)

Cada cifra de la web anterior (consulta sobre la copia) debe coincidir con la nueva:

| Qué | Web anterior (MySQL) | Plataforma (PostgreSQL) |
|---|---|---|
| Atletas por edición | `SELECT CompeticionId, count(*) FROM Inscripciones WHERE PagoConfirmado OR ParticipacionConfirmada GROUP BY 1` | `SELECT competition_id, count(*) FROM atletas WHERE origen = 'propia' GROUP BY 1` |
| Cobrado en inscripciones | `SELECT CompeticionId, sum(TotalPagado) FROM Inscripciones WHERE PagoConfirmado GROUP BY 1` | `SELECT competition_id, sum(total) / 100.0 FROM inscripciones WHERE estado = 'pagada' GROUP BY 1` |
| Boletos vendidos | `SELECT CompeticionId, count(*) FROM RifaTickets WHERE Confirmado GROUP BY 1` | `SELECT competition_id, count(*) FROM boletos GROUP BY 1` |
| Usuarios | `SELECT count(*) FROM Usuarios` | `SELECT count(*) FROM usuarios` (menos los que ya existían) |
| Intentos de ediciones celebradas | `SELECT count(*) FROM LiftEntriesInscripcion` | `SELECT count(*) FROM intentos` (más las renuncias añadidas del informe) |

El informe de cada paso ya da leídos, escritos y omitidos con su motivo. La conciliación lo comprueba con
consultas independientes.

## 7. Resultado del ensayo en QA

_(se completa con cada ensayo)_

## 8. Vuelta atrás

| Cuándo | Cómo | Datos |
|---|---|---|
| **Antes de abrir** (hasta T0 · 60′) | nginx vuelve a la web anterior y se quita el mantenimiento. | Nada se perdió: MySQL no se tocó y la plataforma aún no recibió a nadie. Las bases nuevas se vacían antes del siguiente intento. |
| **Después de abrir, antes de T+7** | Solo ante un incidente bloqueante (pagos que fallan, pérdida de datos). nginx → web anterior; webhooks de Stripe → API antigua. | Lo creado en la plataforma desde la apertura se exporta en CSV desde el backoffice: atletas e inscripciones, compras del sorteo, entradas, contactos. Se da de alta a mano en la web anterior, conciliando con los pagos de Stripe del periodo. |
| **Después de T+7** | Sin vuelta atrás: se corrige hacia delante (`rollout undo` de un servicio, restaurar una base desde la copia nocturna). | La copia final de MySQL queda archivada, cifrada, el plazo de retención. |

Después del corte, la web anterior (`grcup-api.service`, `/var/www/grweb`) se detiene, pero no se borra hasta el
punto de no retorno.
