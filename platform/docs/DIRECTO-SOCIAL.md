# Directo social · chat, donativos, patrocinio, porra y GRS Fantasy (paso 17)

_08/11/2026 · especificación común del equipo. Es el contrato: si algo no encaja con el código real, se avisa al coordinador antes de inventar otra cosa._

Rama `platform/17-directo-social`, worktree `~/projects/grweb-wt/17-directo-social`. Todo vive en `platform/` (Go + PostgreSQL + Redis, Angular). El sistema antiguo (`backend/`, `frontend/`, `backoffice/` de la raíz) **no se toca**.

## 0. Qué se construye

1. **Chat en `/en-directo`** para cuentas de directo (atleta o público): texto y emojis, en tiempo real (WebSocket, con SSE + REST como alternativa), moderación desde el backoffice.
2. **Donativos** con Stripe (o la pasarela simulada de `pkg/pagos`), anunciados en el chat como GRS coins, con **ranking de donantes** por jornada.
3. **Banners de patrocinadores** que aparecen en el chat cada X segundos, con tier (peso) y la garantía de que **todos salen al menos una vez por jornada** (cola y registro de apariciones).
4. **Porra** (en el directo y en `/porra`) con monedas virtuales **que nunca se compran con dinero**: 100.000 por usuario y jornada. Mercados: ganador de cada categoría de peso, mejor IPF GL por sexo y mayor sentadilla, banca y peso muerto por sexo.
5. **GRS Fantasy** (`/fantasy`): 1.000.000 de monedas por usuario y jornada, mercado de atletas, cláusulas en tiempo real (200.000 al empezar), clausulazo, alineación de 5 titulares y hasta 3 suplentes, y puntuación por rendimiento.
6. **Recompensas**: por mensajes en el chat y por euros donados.
7. **Premios** (porra, donantes y fantasy) gestionados en el backoffice y anunciados en las clasificaciones en vivo como gancho (imagen y datos).
8. **Jornadas independientes**: AEP-2 y AEP-3 se celebran en días distintos de la misma competición. Porra, fantasy, ranking de donantes, chat y cola de banners se separan por jornada, y se guarda el histórico de las anteriores.
9. **Prueba de carga y concurrencia** del chat, más tests de condiciones de carrera en carteras y clausulazos.

## 1. Servicios (separados por carga)

| Servicio | Es dueño de | Carga | Réplicas (HPA) |
|---|---|---|---|
| `fans` *(nuevo)* | Cuentas de directo (atleta o público), alias, enlace mágico, sesión `grcup_fan`, baneos | Baja | 1–3 |
| `chat` *(nuevo)* | Salas por jornada, mensajes, WebSocket, SSE y REST, moderación, límites, contadores de mensajes, hitos de recompensa | **Alta (ruta caliente)** | 2–8 |
| `donaciones` *(nuevo)* | Donativos con Stripe, webhook, ranking de donantes, reembolsos | Picos | 1–3 |
| `patrocinio` *(nuevo)* | Banners, tiers y pesos, intervalo, cola y registro de apariciones, clics | Baja; un worker líder | 1–2 |
| `juegos` *(nuevo)* | Jornadas, carteras (libro de movimientos), porra, fantasy, premios y clasificaciones | Media (HTTP) | 2–4 |
| `juegos-worker` *(nuevo, mismo binario: `juegos worker`)* | Consumo de eventos: recompensas, cláusulas, puntos, cierre y liquidación de mercados | Ráfagas por intento | 1 (bloqueo en Redis) |
| `live` *(existente)* | Añade un endpoint interno con el marcador por atleta y jornada | — | — |
| `gateway`, `realtime` *(existentes)* | Rutas nuevas; `realtime` ya reenvía por SSE los eventos públicos (banners, donativos) | — | — |

**Por qué así:** el chat es lo único que recibe miles de conexiones y mensajes por segundo; se aísla para escalarlo solo. Donativos (dinero real) y juegos (monedas virtuales) **no comparten base de datos ni código de cartera**: así es imposible por diseño que dinero real acabe en la porra. El worker de juegos separa el recálculo de cláusulas y puntos de las peticiones HTTP.

Reglas de la arquitectura (las de `ARQUITECTURA.md`): una BD por servicio (`grcup_fans`, `grcup_chat`, `grcup_donaciones`, `grcup_patrocinio`, `grcup_juegos`), referencias por UUID sin claves foráneas cruzadas, outbox → `grcup:events`, huma + problem+json, goose con migraciones embebidas, UUIDv7, `snake_case` en español, `competition_id` en todo, Redis compatible con 6.0 (sin `GETDEL`, `XAUTOCLAIM` ni `SET … GET`) y claves con el prefijo `a.Keys.Of(...)`. **Plantilla:** copiad la estructura de `internal/raffle` (servicio con Stripe) y de `cmd/raffle/main.go`.

## 2. Jornadas

- Una **jornada** es `(competition_id, dia date)` con un nombre visible («AEP-2», «AEP-3»). La crea el backoffice en `juegos` (tabla `jornadas`). Los demás servicios **solo guardan `dia`** (fecha de Europe/Madrid) y no llaman a `juegos`.
- **Jornada activa** = la jornada con `dia` = hoy (Europe/Madrid) y `estado` en `abierta` o `en_juego`. Si no hay ninguna, el chat funciona igual, pero no se acreditan recompensas (la respuesta lo dice).
- Estados: `borrador` → `abierta` (se puede jugar) → `en_juego` (hay intentos) → `cerrada` (liquidada; queda como histórico de solo lectura).
- Atletas de una jornada = atletas de los flights de ese `dia` (los da el marcador interno de `live`, §8).

## 3. Cuentas de directo (`fans`) y sesión (`pkg/fanauth`)

- `pkg/fanauth` **ya existe** (lo escribió el coordinador): `Sign`, `Parse`, `Verifier.Verify(ctx, tok)`, `fanauth.Key(a.Cfg.InternalToken)`, cookie `grcup_fan` (Path=/api, httpOnly, SameSite=Lax), cabecera alternativa `X-GrCup-Fan` (para la prueba de carga), revocación por versión en Redis (`fans:ver:<id>`). En huma se lee con `Session string \`cookie:"grcup_fan"\`` + `Header string \`header:"X-GrCup-Fan"\``.
- **Alta**: `POST /api/competiciones/{slug}/fans/acceso` `{email, tipo: atleta|publico, alias, aceptaNormas: true}` → email con enlace mágico (evento `fans.email_solicitado`, que envía `messaging`; si la plantilla no existe todavía, el enlace se registra en el log en dev). `GET /api/competiciones/{slug}/fans/acceso/{token}` (o `POST …/canjear {token}`) → crea o recupera la cuenta y pone la cookie.
  - `tipo=atleta`: `fans` consulta a `athletes` por email (llamada interna). Si coincide con un atleta de la competición, guarda `atleta_id` y la cuenta muestra la insignia «Atleta». Si no, se rechaza con el código `ATLETA_NO_ENCONTRADO` y se ofrece entrar como público.
  - Alias: 3–20 caracteres `[\p{L}\p{N}_ .-]`, único por competición (citext) y filtrado con la lista de palabras prohibidas.
- `GET /api/competiciones/{slug}/fans/yo` → `{id, alias, tipo, atletaId?, insignia}` · `POST …/fans/salir` (borra la cookie y sube la versión) · `PATCH …/fans/yo {alias}`.
- Admin (`C/fans`, permiso `directo.operar`): lista y búsqueda, **banear** (sube la versión, marca `baneado_hasta` y avisa a `chat` con el evento `fans.baneado`) y desbanear.
- Tablas: `fans (id, competition_id, email citext, email_hash, tipo, alias citext, atleta_id, baneado_hasta, created_at, updated_at, version, UNIQUE(competition_id,email), UNIQUE(competition_id,alias))`, `accesos (token_hash, fan_email, tipo, alias, expires_at, usado_at)`.
- Límites: 5 enlaces por email y hora, y 20 por IP y hora.

## 4. Chat (`chat`)

**Transporte** (los tres caminos usan la misma sala):
- `GET /api/competiciones/{slug}/chat/ws` — **WebSocket** (biblioteca `github.com/coder/websocket`, la única dependencia nueva del paso). Lectura anónima permitida; para enviar hace falta la sesión de fan. Frames JSON:
  - del cliente: `{"t":"msg","texto":"…","cid":"<uuid del cliente para deduplicar>"}` · `{"t":"ping"}`;
  - del servidor: `{"t":"msg"|"donacion"|"banner"|"borrado"|"sistema"|"hito"|"estado", "id":"<id del stream>", …}`.
- `GET /api/competiciones/{slug}/chat/stream` — **SSE** con `Last-Event-ID` (XRANGE) y latido de 15 s, para quien no puede abrir WebSockets.
- `POST /api/competiciones/{slug}/chat/mensajes` — **REST** para enviar desde SSE (misma validación). `GET …/chat/mensajes?antes=<id>&limite=50` devuelve el historial.

**Diseño para escalar:**
- Cada sala (`cid` + `dia`) es un Redis Stream `chat:sala:<cid>:<dia>` con `MAXLEN ~ 5000`. Enviar = validar → `XADD` → responder. **Ningún INSERT en PostgreSQL en la ruta caliente.**
- En cada pod, **un solo lector por sala activa** (`XREAD BLOCK` con el último id) reparte a las conexiones locales por canales con búfer (256). Un cliente lento que llena su búfer se desconecta con el código 1008 y reconecta con su último id (sin bloquear al resto).
- Persistencia diferida: un consumidor (grupo `chat-persistir`, `XREADGROUP` + `XACK`) guarda los mensajes en lotes en la tabla `mensajes` cada segundo o cada 200 mensajes. Sirve para el historial antiguo y la moderación.
- Límites por fan (Redis): 1 mensaje cada 2 s con ráfaga de 5, 280 caracteres como máximo (emojis contados como runas), sin enlaces salvo de dominios permitidos (configurable), lista de palabras prohibidas y modo lento configurable. Silenciados y baneados en un set de Redis con TTL.
- Presencia: contador de conexiones por pod en Redis (patrón de `realtime`: set de pods y contador con caducidad de 60 s). Se publica como `{"t":"estado","conectados":N}` cada 10 s.
- Métricas Prometheus: conexiones, mensajes por segundo, cola de persistencia y desconexiones por lentitud.

**Contadores y hitos de recompensa:**
- Cuenta un mensaje si tiene al menos 3 caracteres sin espacios y no repite el anterior del mismo fan. `INCR chat:cnt:<cid>:<dia>:<fan>`.
- Cuando el contador es múltiplo de 5, se escribe en la outbox (transacción mínima) el evento `chat.hito` `{fanId, dia, mensajes: N}` (audiencia Admin: lleva el fanId). Lo consume `juegos-worker` (§6.4). El cliente recibe `{"t":"hito","mensajes":N}` para enseñar «+100 porra · +10k fantasy».
- Tope anti-abuso: como máximo 100 hitos por fan y jornada (configurable).

**Inyecciones en la sala** (consumidor `chat` de `grcup:events`, `Start: "$"`):
- `donacion.confirmada` → item `{"t":"donacion", alias, importe, coins, mensaje}`;
- `patrocinio.banner` → item `{"t":"banner", bannerId, patrocinador, imagenUrl, clicUrl, tier}`;
- `fans.baneado` → silencia al fan y borra sus últimos mensajes de la sala (items `borrado`).

**Admin** (`C/chat/*`, permiso `directo.operar`): config de la sala (`activo`, `modo_lento_seg`, `palabras_prohibidas[]`, `dominios_permitidos[]`, `max_hitos`), borrar un mensaje (item `borrado`), silenciar a un fan N minutos, ver los mensajes recientes y los reportados. Público: `POST …/chat/mensajes/{id}/reportar`.

**Tablas:** `config_chat (competition_id PK, …, version)`, `mensajes (id text PK = id del stream, competition_id, dia, fan_id, alias, tipo, texto, borrado, reportes, created_at)`, `silencios (competition_id, fan_id, hasta, motivo, por)`.

## 5. Donativos (`donaciones`)

- `POST /api/competiciones/{slug}/donaciones` (sesión de fan) `{importe (céntimos, 100–50000), mensaje (≤140, mismo filtro que el chat), anonimo?: bool}` → `pagos.CreateCheckout` (Stripe o simulado, según la integración `stripe` de la competición, como `raffle`) → `{url}`. La vuelta va a `/en-directo?donacion=ok|cancelada`.
- Webhook `POST /api/webhooks/pagos/donaciones` (firma verificada e idempotente por id de evento) → `estado=pagada` → outbox `donacion.confirmada` `{donacionId, fanId, alias (o «Anónimo»), importe, coins, mensaje, dia}`. Audiencia: Public (sin email; el fanId es un UUID opaco) para que `realtime`, `chat` y `juegos-worker` lo reciban.
- **GRS coins de exhibición**: `coins = importe_en_euros × coins_por_euro` (por defecto 100). Es solo lo que se anuncia en el chat y **no es una moneda gastable**. El efecto económico real es la recompensa de fantasy (§6.4).
- Ranking: `GET /api/competiciones/{slug}/donaciones/ranking?dia=` → top 20 `{puesto, alias, total, donativos}` (los anónimos aparecen como «Anónimo» y no se agrupan entre sí) y `{totalRecaudado}`. Caché de 5 s.
- Admin (`C/donaciones/*`, permiso `sorteo.gestionar` para leer y reembolsar, el mismo que gestiona los pagos del sorteo; no se crean claves de permiso nuevas): lista con filtros, reembolso (outbox `donacion.reembolsada`; `juegos-worker` retira la recompensa de fantasy si el saldo lo permite y, si no, lo deja anotado), config `{activo, minimo, maximo, coins_por_euro, importes_sugeridos[]}`.
- Tablas: `donaciones (id, competition_id, dia, fan_id, alias, importe, coins, mensaje, anonimo, estado (pendiente|pagada|caducada|reembolsada), proveedor, session_id, payment_id, created_at, pagada_at)`, `config_donaciones`, `webhook_eventos (id PK)`.

## 6. Juegos (`juegos` + `juegos-worker`)

### 6.1 Carteras (libro de movimientos)
- Dos monedas **separadas e intransferibles**: `porra` y `fantasy`. Una cartera es `(jornada_id, fan_id, moneda)`.
- Se crea al entrar por primera vez en el juego de esa jornada, con 100.000 (porra) o 1.000.000 (fantasy). Movimiento `alta` con `ref = alta:<jornada>:<fan>:<moneda>` único.
- `saldos (jornada_id, fan_id, moneda, saldo bigint CHECK (saldo >= 0), version)` + `movimientos (id, jornada_id, fan_id, moneda, importe bigint, motivo, ref text UNIQUE, created_at)`.
- **Todo gasto** se hace en una transacción: `UPDATE saldos SET saldo = saldo - $1 … WHERE … AND saldo >= $1` (si no actualiza ninguna fila → 409 `SALDO_INSUFICIENTE`) + INSERT del movimiento. Así no hay doble gasto aunque lleguen peticiones concurrentes.
- **Ningún endpoint ni evento acredita monedas de porra a partir de dinero.** El único ingreso de porra es `alta`, `hito_chat` y `premio_porra` (liquidación).

### 6.2 Porra
- **Mercados** (los genera el backoffice con un botón «Generar mercados» desde el marcador de la jornada; también se pueden editar): `categoria` (sexo + categoría de peso: gana quien queda 1.º), `gl` (por sexo: mejor IPF GL), `movimiento` (por sexo y movimiento sq, bp o dl: mayor peso válido).
- `apuestas (id, mercado_id, fan_id, atleta_id, importe, created_at)`. Mínimo 100 y máximo 50.000 por apuesta, configurables. Varias apuestas por mercado permitidas.
- **Bote común** (parimutuel, sin casa): al liquidar, cada acertante recibe `floor(bote × su_importe / total_apostado_al_ganador)`; el resto por redondeo se ignora. Si nadie acertó, se devuelve todo. Si hay empate en el resultado, el bote se reparte entre las apuestas a todos los empatados. Las cuotas orientativas se muestran en vivo: `bote / apostado_a_ese_atleta`.
- **Cierre automático**: un mercado se cierra cuando se juzga el primer intento de cualquiera de sus atletas (o del movimiento, en los mercados de movimiento), o a mano. **Liquidación**: al publicarse los resultados de la categoría (`resultados.publicados`); los mercados `gl` y `movimiento` de un sexo, cuando están publicadas todas las categorías de ese sexo en esa jornada, o a mano («Liquidar»).
- **Clasificación de la porra** = saldo de porra de la jornada (desempate: quien llegó antes a ese saldo). Endpoint público con el top 50 y mi puesto.

### 6.3 GRS Fantasy
- **Plantilla**: hasta 8 atletas, **5 titulares + hasta 3 suplentes**. Un atleta tiene como mucho **un dueño por jornada**.
- **Mercado**: los atletas libres se compran al instante por su **valor** actual. **Venta**: se devuelve al mercado y el vendedor recibe el 100 % del valor actual.
- **Cláusula = valor** (un único número por atleta y jornada, `fantasy_atletas.clausula`). Empieza en **200.000**.
- **Clausulazo**: pagar la cláusula de un atleta de otro usuario. El dinero va **al dueño anterior**. Se ejecuta en una transacción con `SELECT … FOR UPDATE` de la fila de propiedad y de los dos saldos (en orden de fan_id para evitar interbloqueos). **Protección de 10 minutos** tras cualquier fichaje o clausulazo (configurable). Como máximo **3 clausulazos por usuario y jornada** (configurable, `max_clausulazos`). No se puede clausular sin hueco en la plantilla ni dejar el saldo en negativo (sin deuda, a diferencia de LaLiga Fantasy).
- Al entrar en la plantilla: titular si hay hueco entre los 5, si no suplente. Cambios titular ↔ suplente en cualquier momento **salvo para atletas cuyo flight está en curso** (anti-trampa: nadie puede poner de titular solo a quien está levantando ahora).
- **Variación de la cláusula** (en tiempo real, en `juegos-worker`, por cada veredicto; valores configurables): intento válido +5 %, nulo −4 %, blanqueo −30 %; al publicarse los resultados, ajuste por puesto en la categoría (1.º +25 %, 2.º +15 %, 3.º +8 %); cada compra o clausulazo +3 % (demanda). Mínimo 50.000 y máximo 5.000.000; se redondea a 1.000. Cada cambio queda en `historial_clausulas` (para la gráfica) y se emite el evento público `fantasy.clausula` `{jornadaId, atletaId, clausula, delta}`.
- **Puntos** (configurables en el backoffice; la tabla por defecto):

  | Concepto | Puntos |
  |---|---|
  | Intento válido (máx. 9) | +3 cada uno |
  | Pleno 9/9 (bonus) | +5 |
  | Blanqueo (3 nulos en un movimiento) | −15 |
  | Puesto en su categoría de peso | 1.º +20 · 2.º +14 · 3.º +10 · 4.º–5.º +5 · resto que acaba +2 |
  | Puesto IPF GL de su sexo | 1.º +25 · 2.º +18 · 3.º +12 · 4.º–10.º +4 |
  | Puesto por movimiento (sexo) | por cada movimiento: 1.º +10 · 2.º +6 · 3.º +3 |

- **¿A quién cuentan los puntos?** Los de cada intento, al usuario que lo tiene **de titular en el momento del veredicto**. Los de los puestos, al dueño titular cuando se publican los resultados. Se guardan en `puntos (id, jornada_id, fan_id, atleta_id, concepto, puntos, ref UNIQUE, created_at)`, con `ref` idempotente (p. ej. `intento:<atleta>:<mov>:<n>`). Una corrección (`directo.correccion`) recalcula ese intento y ajusta su fila sin cambiarle el dueño.
- **Clasificación fantasy** = suma de puntos de la jornada (desempate como en LaLiga Fantasy: valor de la plantilla, después saldo y después quién llegó antes). Ganadores = top N con premio.
- Tablas: `fantasy_atletas (jornada_id, atleta_id, nombre_publico, sexo, categoria, clausula, dueno_fan_id NULL, titular bool, protegido_hasta, version, PK(jornada_id, atleta_id))`, `fichajes (id, jornada_id, atleta_id, de_fan, a_fan, tipo (compra|venta|clausulazo), precio, created_at)`, `historial_clausulas`, `puntos`, `intentos_vistos (jornada_id, atleta_id, mov, numero, resultado, dueno_fan_id, titular)`.

### 6.4 Recompensas (en `juegos-worker`, idempotentes por `ref`)

| Origen | Porra | Fantasy |
|---|---|---|
| `chat.hito` con N múltiplo de 5 | +100 | +10.000 |
| `chat.hito` con N múltiplo de 10 (**se suma** a la de 5) | +500 | +50.000 |
| `donacion.confirmada` | **nada** (la porra nunca se compra) | +10.000 por euro (`floor(importe/100) × 10000`) |
| `donacion.reembolsada` | — | se retira lo acreditado (como mucho, hasta dejar el saldo en 0) |

Con 10 mensajes hay **dos** hitos: el del 5 (+100 / +10k) y el del 10 (+100 + 500 / +10k + 50k). Si el fan aún no tiene cartera en la jornada activa, se le crea antes de acreditar. Las cantidades son configurables (`config_juegos`).

### 6.5 Premios
- `premios (id, competition_id, jornada_id, ranking (porra|fantasy|donantes), puesto_desde, puesto_hasta, titulo, descripcion, imagen_url, valor_texto, patrocinador, orden, activo)`. CRUD en el backoffice (`C/juegos/premios`); la imagen se sube a `cms` medios o se pega una URL.
- Público: `GET /api/competiciones/{slug}/juegos/premios?jornada=` (incluye `donantes`, que el frontend une con el ranking de `donaciones`).

### 6.6 Endpoints de `juegos`
- Público: `GET …/juegos/jornadas` · `GET …/juegos/jornadas/{jid}` (estado y atletas con cláusula y dueño por alias) · `GET …/juegos/porra/mercados?jornada=` · `POST …/juegos/porra/apuestas` · `GET …/juegos/porra/mis-apuestas` · `GET …/juegos/porra/clasificacion` · `GET …/juegos/fantasy/mercado` · `GET …/juegos/fantasy/mi-equipo` · `POST …/juegos/fantasy/comprar|vender|clausulazo|alineacion` · `GET …/juegos/fantasy/clasificacion` · `GET …/juegos/fantasy/atletas/{aid}` (historial de la cláusula y puntos) · `GET …/juegos/cartera` (los dos saldos y los últimos movimientos) · `GET …/juegos/premios`.
- Admin (`C/juegos/*`, permiso `directo.operar`): jornadas (CRUD y cambio de estado), generar, editar, cerrar y liquidar mercados, config de puntos, cláusulas y recompensas, premios, y vista de clasificaciones e histórico de jornadas cerradas.
- Eventos emitidos (Public, sin datos personales; los alias son públicos): `fantasy.clausula`, `fantasy.fichaje` `{jornadaId, atletaId, tipo, aliasDe, aliasA, precio}`, `porra.mercado` `{mercadoId, estado}`, `juegos.clasificacion` (como mucho, uno cada 5 s por jornada).

## 7. Patrocinio (`patrocinio`)

- `banners (id, competition_id, patrocinador, imagen_url, imagen_movil_url, url_destino, tier (oro|plata|bronce), activo, desde, hasta, orden, version)`, `config_patrocinio (competition_id PK, intervalo_seg default 90 (mín. 15), peso_oro 3, peso_plata 2, peso_bronce 1, solo_en_directo bool default true, activo)`, `apariciones (id, competition_id, banner_id, dia, mostrado_at)`, `clics (banner_id, dia, at, ip_hash)`.
- **Worker** (solo uno a la vez: bloqueo `SET NX PX` en Redis y renovación) que hace un tic cada `intervalo_seg`. Si `solo_en_directo`, solo cuando la fase de `live` es `en_directo` (consulta el endpoint público del directo, en caché 10 s). Elección del banner del día `dia`:
  1. **Primero los pendientes del día**: los activos sin ninguna aparición hoy, por tier (oro > plata > bronce) y `orden`. Así **todos salen al menos una vez por jornada**, también los bronce.
  2. Cuando todos han salido: **round-robin ponderado suave** (el de nginx) con los pesos del tier. El estado (`current_weight` por banner) se guarda en Redis por `cid:dia`, de modo que es determinista y justo: con oro 3 y bronce 1, el oro sale 3 veces por cada vez del bronce.
  3. INSERT en `apariciones` + outbox `patrocinio.banner` `{bannerId, patrocinador, imagenUrl, imagenMovilUrl, clicUrl, tier, dia}` (Public).
- `GET /api/competiciones/{slug}/patrocinio/banners/{id}/clic` → registra el clic → 302 a `url_destino` (solo http/https).
- Admin (`C/patrocinio/*`, permiso `web.editar`): CRUD, config y **informe** por día (apariciones y clics por banner, y la estimación «con N banners cada X s, la primera ronda completa tarda Y min»). Aviso si la duración del día (de los flights) no da para una ronda completa.

## 8. Cambio en `live`: marcador interno

`GET /internal/competiciones/{cid}/marcador?dia=YYYY-MM-DD` (token de servicio, solo para `juegos`) → atletas de los flights de ese día:
`{fase, flightEnCurso, atletas: [{atletaId, nombrePublico, sexo, categoria, flightId, flightEnCurso: bool, intentos: {sq:[{n,peso,resultado}],bp:[…],dl:[…]}, mejor:{sq,bp,dl}, total, gl, puestoCategoria, puestoGL, puestoMovimiento:{sq,bp,dl}, blanqueo:{sq,bp,dl}, terminado: bool}], categoriasPublicadas: […]}`.
`nombrePublico` sigue la regla de privacidad de `/en-directo` (nombre si el perfil es público y, si no, «Atleta · −83 kg · lote 12»). Reutiliza el cálculo existente (`datos.go` y `resultados.go`). Hay que añadir `juegos` a `LLAMADAS["live"]` en `generar.py`.

## 9. Rutas del gateway (añadir a `routeTable` y a `AllServices`)

```
{c + `fans(/|$)`, "fans"},            {p + `fans(/|$)`, "fans"},
{c + `chat(/|$)`, "chat"},            {p + `chat(/|$)`, "chat"},
{c + `donaciones(/|$)`, "donaciones"},{p + `donaciones(/|$)`, "donaciones"},
{`^/api/webhooks/pagos/donaciones$`, "donaciones"}, {`^/api/pagos/simulado/donaciones/`, "donaciones"},
{c + `patrocinio(/|$)`, "patrocinio"},{p + `patrocinio(/|$)`, "patrocinio"},
{c + `juegos(/|$)`, "juegos"},        {p + `juegos(/|$)`, "juegos"},
```
Tienen que ir **antes** de `^/api/competiciones(/|$)` (competition). El proxy del gateway ya admite el `Upgrade` de WebSocket (`httputil.ReverseProxy`). El nginx del host (`deploy/scripts/nginx-*`) necesita `proxy_http_version 1.1` + `Upgrade`/`Connection` en `/api/` y `proxy_read_timeout 3600s` para la ruta `/chat/ws`.

## 10. Despliegue

- `deploy/k8s/generar.py`: `fans` (1–3, 64/256Mi), `chat` (2–8, 64/384Mi, env `CHAT_MAX_CONEXIONES=10000`), `donaciones` (1–3), `patrocinio` (1–2), `juegos` (2–4); `juegos-worker` como Deployment aparte del mismo binario con `args: ["worker"]` (1 réplica, como `messaging-worker`). Grafo `LLAMADAS`: `athletes` ← `fans`; `live` ← `juegos`, `patrocinio`; `competition` ← todos los que resuelven el slug.
- `deploy/dev/compose.yml` + `initdb/01-databases.sh` (las 5 BD nuevas). Makefile `SERVICES`.
- Todos los contenedores con `mem_limit` (regla de la máquina).

## 11. Frontend (Angular, `platform/web`)

- **Público** (`projects/public`):
  - `/en-directo`: panel de chat (columna derecha en escritorio y pestaña o hoja inferior en móvil), botón «Donar», banners en el chat, pestañas «Chat · Donantes · Porra» con las clasificaciones y los premios como gancho;
  - modal de acceso (atleta o público, alias y email → «Revisa tu correo»);
  - nuevas rutas `/porra` y `/fantasy` (mercado, mi equipo, clausulazo, clasificación, premios y cartera) y `/acceso` (canje del enlace mágico).
  - Servicios: `core/chat.ts` (WebSocket con reconexión exponencial y último id → SSE si falla), `core/fan.ts` (sesión) y `core/juegos.ts`.
- **Backoffice** (`projects/backoffice`): Directo › Chat (moderación), Directo › Patrocinio (banners, config e informe), Juegos (jornadas, mercados, config, clasificaciones e histórico), Donaciones, Premios y Fans (baneos).
- **Diseño primero**: cada pantalla se implementa sobre su frame de Figma (fichero «GRSCup 2026 - UI Kit & Rutas», páginas 70–73), con los tokens y componentes de `projects/ui`.

## 12. Calidad y pruebas

- `make verify` (gofmt, vet, build) siempre dentro de `cgrun`: `cgrun -m 8G -n verify -- make verify`.
- **Prueba de carga** `platform/cmd/carga-chat` (binario de herramienta, no es servicio): abre N WebSockets (por defecto 2.000; probado hasta 10.000) y M clientes SSE contra el gateway o directamente contra `chat`. Usa tokens de fan de prueba firmados con `fanauth` y el secreto de dev. Envía mensajes a un ritmo configurable y mide la latencia extremo a extremo (envío → recepción en otro cliente) p50/p95/p99, los mensajes perdidos y duplicados, las desconexiones y la memoria de los pods. Imprime un informe y lo guarda en `docs/carga/`.
- **Tests de concurrencia** (`go test -race`) en `juegos`: 200 apuestas concurrentes contra el mismo saldo (no queda negativo), 50 clausulazos simultáneos del mismo atleta (gana uno y el dinero cuadra) y recompensas duplicadas (idempotencia por `ref`). En `patrocinio`: test del selector (todos salen una vez antes de repetir y las proporciones 3:2:1).
- El resto del proyecto no tiene tests por regla. Estos los pidió expresamente el cliente.

## 13. Reparto de ficheros (para no pisarse)

| Agente | Solo toca |
|---|---|
| Diseño A | Figma, página «70 · /en-directo · Chat, donativos y patrocinio» |
| Diseño B | Figma, páginas «71 · /porra» y «72 · /fantasy» |
| Diseño C | Figma, página «73 · BO · Comunidad, juegos y patrocinio» |
| Backend 1 | `internal/chat`, `cmd/chat`, `cmd/carga-chat`, `go.mod`/`go.sum` (solo `coder/websocket`) |
| Backend 2 | `internal/donaciones`, `cmd/donaciones`, `internal/patrocinio`, `cmd/patrocinio` |
| Backend 3 | `internal/juegos`, `cmd/juegos`, el endpoint interno de `internal/live` (§8) |
| Backend 4 | `internal/fans`, `cmd/fans`, `internal/gateway`, `deploy/**`, `Makefile`, `docs/INVENTARIO.md` |
| Front 1–3 | (después de aprobar Figma) `web/projects/public` (directo y chat), `web/projects/public` (porra y fantasy), `web/projects/backoffice` |

Nadie hace commit, push ni PR: lo hace el coordinador. Nadie toca `pkg/` salvo para añadir algo nuevo y propio, y avisando.
