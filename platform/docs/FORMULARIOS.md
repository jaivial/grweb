# Formularios (backoffice → email / WhatsApp → web)

Contrato compartido de la funcionalidad «Formularios». Todo agente que implemente una parte DEBE respetar estos
nombres, rutas y formas JSON al pie de la letra. Si algo no encaja con el código existente, se adapta el código
nuevo, nunca el contrato, y se avisa en el informe.

## 1. Arquitectura

| Pieza | Dónde | Qué hace |
|---|---|---|
| `platform/pkg/formularios` | paquete Go compartido | Tipos del esquema, `Validar`, `ValidarRespuesta`, `Porcentaje`, `CompilarEmailHTML`, `Token`/`LeerToken`. Lo usan `athletes` y `ai`. |
| `platform/internal/athletes/formularios*.go` | servicio athletes | Tablas, CRUD admin, envíos, estadísticas, respuestas, endpoints públicos por token, subida de archivos a BunnyCDN. |
| `platform/internal/messaging` | servicio messaging | Plantilla `formulario_invitacion` (con hueco HTML crudo para el formulario incrustado) y endpoint interno de estados de entrega. |
| `platform/internal/ai/formulario.go` | servicio ai | Asistente MiniMax (`MINIMAX_MODEL`, por defecto `MiniMax-M3.1-Flash`) con herramientas que editan el borrador del formulario. |
| `platform/internal/gateway/gateway.go` | gateway | Rutas `c + formularios` y `^/api/formularios(/|$)` → athletes. Las de `ia` ya van a ai. |
| Backoffice `pages/formularios/` | Angular | Pestaña nueva «Formularios» en la navegación: lista + editor con pestañas Editar · Vista previa · Envíos · Estadísticas · Atletas. |
| Público `pages/formulario.ts` | Angular SSR | `/formularios/:token`: rellenar, autoguardado, subir archivos, enviar. |

**Anti-spam:** ningún email ni WhatsApp se envía directamente. athletes emite un evento `athletes.email_solicitado`
o `athletes.whatsapp_solicitado` por destinatario y canal (outbox transaccional, `events.Enqueue`), messaging lo
mete en `mensajes` y el turno compartido de `ritmo.go` decide cuándo sale (30–60 s por WhatsApp, 40/h, 150/día,
silencio 22–09; email al ritmo de la competición). Esto es obligatorio.

**Permiso:** todo lo de admin usa `auth.Require(ctx, cid, "atletas.editar")`.

## 2. Esquema del formulario (`esquema`, jsonb)

```json
{
  "ajustes": {
    "titulo": "Encuesta post-competición",
    "descripcion": "Texto de introducción (admite **negrita** y saltos de línea)",
    "botonEnviar": "Enviar respuestas",
    "mensajeGracias": "¡Gracias! Hemos recibido tus respuestas.",
    "permiteEditar": true,
    "cierreAt": null,
    "tema": { "acento": "#E4002B", "fondo": "#FFFFFF", "superficie": "#F6F6F7", "texto": "#111111", "radio": 10, "fuente": "sistema", "densidad": "normal" }
  },
  "campos": [
    {
      "id": "c_k2j9x1",
      "tipo": "opcion_unica",
      "etiqueta": "¿Qué tal la organización?",
      "ayuda": "",
      "obligatorio": true,
      "placeholder": "",
      "ancho": "completo",
      "opciones": [ { "id": "o_1", "texto": "Muy bien" }, { "id": "o_2", "texto": "Bien" } ],
      "min": null, "max": null, "paso": null,
      "minEtiqueta": "", "maxEtiqueta": "",
      "validacion": { "minLargo": null, "maxLargo": null, "patron": "" },
      "archivo": null,
      "estilo": { "alinear": "izquierda", "tamano": "m", "color": "", "negrita": false, "fondo": "", "borde": false },
      "imagen": "", "alt": ""
    }
  ]
}
```

- `fuente`: `sistema` | `serif` | `mono`. `densidad`: `compacta` | `normal` | `amplia`. `radio`: 0–24. Colores `#RRGGBB`.
- `ancho`: `completo` | `mitad` (dos campos `mitad` seguidos van en la misma fila; en email y móvil, siempre apilados).
- `estilo.alinear`: `izquierda` | `centro` | `derecha`; `tamano`: `s` | `m` | `l`.
- `id` de campo: `c_` + 6–10 caracteres `[a-z0-9]`; `id` de opción: `o_` + 1–10 `[a-z0-9]`. Únicos dentro del formulario. Nunca cambian al editar (las respuestas se guardan por id).
- Límites: 1–80 campos; 2–30 opciones; etiqueta ≤ 300; ayuda ≤ 500; descripción ≤ 2000; texto de opción ≤ 120.

### Tipos de campo

| `tipo` | Respuesta (`datos[id]`) | Campos propios | Email |
|---|---|---|---|
| `titulo` | — (decorativo) | `etiqueta`, `estilo` | sí |
| `parrafo` | — | `etiqueta` (texto, admite **negrita**) | sí |
| `imagen` | — | `imagen` (URL https), `alt` | sí |
| `separador` | — | — | sí |
| `texto_corto` | string | `placeholder`, `validacion` | `<input type=text>` |
| `texto_largo` | string | `placeholder`, `validacion` | `<textarea>` |
| `email` | string (email válido) | `placeholder` | `<input type=email>` |
| `telefono` | string | `placeholder` | `<input type=tel>` |
| `numero` | number | `min`, `max`, `paso` | `<input type=number>` |
| `fecha` | string `AAAA-MM-DD` | `min`/`max` como fecha opcional en `minEtiqueta`/`maxEtiqueta` no; usar `validacion.patron` vacío | `<input type=date>` |
| `opcion_unica` | id de opción | `opciones` | radios |
| `desplegable` | id de opción | `opciones`, `placeholder` | `<select>` |
| `casillas` | array de ids de opción | `opciones`, `min`/`max` = nº mín/máx marcadas | checkboxes |
| `seleccion_multiple` | array de ids de opción | `opciones`, `min`/`max` | checkboxes (en web: chips) |
| `casilla` | boolean | `etiqueta` es el texto («Acepto…») | 1 checkbox |
| `si_no` | boolean | — | 2 radios Sí/No |
| `deslizador` | id de opción | `opciones` (puntos de una línea, de izquierda a derecha), `minEtiqueta`, `maxEtiqueta` | radios en fila |
| `escala` | number | `min` (0–10), `max` (2–10), `paso` (1), `minEtiqueta`, `maxEtiqueta` | radios en fila |
| `valoracion` | number 1..`max` (3–10, por defecto 5) | `max` | radios ★ en fila |
| `archivo` | array `[{url,nombre,tamano,tipo}]` | `archivo: { "tipos": ["image/*","application/pdf"], "maxMb": 10, "maxArchivos": 1 }` (maxMb ≤ 20, maxArchivos ≤ 5) | **no**: un formulario con algún `archivo` es «solo web» |

`soloWeb` (derivado, nunca guardado) = el esquema tiene algún campo `archivo`. Si es `soloWeb`, el email lleva solo el
botón al formulario web, sin formulario incrustado.

## 3. Datos (migraciones de athletes, siguientes números libres; aditivas)

```
formularios              id uuid PK, competition_id uuid, nombre text, estado text CHECK (borrador|activo|cerrado) DEFAULT 'borrador',
                         esquema jsonb, version int DEFAULT 1, email jsonb DEFAULT '{}', whatsapp jsonb DEFAULT '{}',
                         creado_por text, created_at, updated_at
formulario_versiones     formulario_id uuid FK ON DELETE CASCADE, version int, esquema jsonb, created_at, PK (formulario_id, version)
formulario_envios        id uuid PK, formulario_id FK CASCADE, competition_id, canales text[], filtro jsonb, total int,
                         omitidos int, creado_por text, created_at
formulario_destinatarios id uuid PK, formulario_id FK CASCADE, competition_id, atleta_id uuid, created_at, abierto_at timestamptz NULL,
                         UNIQUE (formulario_id, atleta_id)
formulario_entregas      id uuid PK, envio_id FK CASCADE, destinatario_id FK CASCADE, canal text CHECK (email|whatsapp),
                         evento_id uuid NULL UNIQUE, estado text CHECK (encolado|omitido) , motivo text DEFAULT '', created_at
formulario_respuestas    id uuid PK, formulario_id FK CASCADE, destinatario_id uuid UNIQUE FK CASCADE, atleta_id uuid, competition_id,
                         version int, datos jsonb DEFAULT '{}', archivos jsonb DEFAULT '[]', estado text CHECK (parcial|completa),
                         porcentaje int, origen text CHECK (web|email), enviado_at timestamptz NULL, created_at, updated_at
```

- Índices: `formularios (competition_id, updated_at DESC)`, `formulario_respuestas (formulario_id, estado)`, `formulario_entregas (envio_id)`.
- `email` jsonb = `{ "asunto": "...", "preheader": "...", "intro": "..." }`; `whatsapp` jsonb = `{ "texto": "..." }`.
  Variables admitidas en estos textos: `{{nombre}}`, `{{competicion}}`, `{{formulario}}` (título).
- Al guardar, si cambia `esquema`, `version++` e insertar en `formulario_versiones`. Cada respuesta guarda la `version`
  con la que se contestó: así los datos siguen siendo legibles aunque el formulario cambie (uso futuro).
- **Un destinatario por (formulario, atleta)** y **una respuesta por destinatario**. Reenviar reutiliza el mismo enlace.

### Token

`token = base64url(destinatario_id[16 bytes] || HMAC-SHA256(clave, "formulario:" + destinatario_id)[:16])` (sin padding),
con la misma clave interna del servicio que usa la autorización del tutor (00025). No se guarda en claro.
`pkg/formularios.Token(clave, id)` y `LeerToken(clave, token) (uuid, bool)` (comparación en tiempo constante).

## 4. API admin (athletes) · base `/api/admin/competiciones/{cid}/formularios` · permiso `atletas.editar`

Tipos (camelCase JSON):

```ts
FormularioResumen = { id, nombre, estado, titulo, soloWeb, destinatarios, respuestas, completas, actualizadoAt }
Formulario        = { id, nombre, estado, esquema, version, email: {asunto, preheader, intro}, whatsapp: {texto}, soloWeb, actualizadoAt }
CanalEstado       = { total, enCola, enviados, fallidos, omitidos }
Envio             = { id, canales: ("email"|"whatsapp")[], filtro, total, omitidos, creadoPor, createdAt, email: CanalEstado, whatsapp: CanalEstado }
RespuestaFila     = { id, atleta: { id, nombre, apellidos, club, categoria }, estado: "parcial"|"completa"|"sin_respuesta", porcentaje, origen, abiertoAt, enviadoAt, actualizadoAt }
RespuestaDetalle  = RespuestaFila & { version, esquema, datos: Record<string, unknown>, archivos: {campoId,url,nombre,tamano,tipo}[] }
Estadisticas      = { destinatarios, abiertos, respuestas, completas, parciales, porcentajeCompletas, porcentajeRespuesta,
                      porCanal: { email: CanalEstado, whatsapp: CanalEstado },
                      porOrigen: { web, email },
                      diario: { fecha: "AAAA-MM-DD", respuestas, completas }[],
                      porCampo: { campoId, etiqueta, tipo, respondidas, opciones?: {id, texto, n}[], media?: number }[] }
Filtro            = { estados?: ("confirmado"|"reserva")[], atletas?: uuid[], soloSinResponder?: boolean }
```

| Método y ruta | Entrada | Salida |
|---|---|---|
| `GET    ` | — | `FormularioResumen[]` |
| `POST   ` | `{ nombre }` | 201 `Formulario` (esquema base: título + 1 `texto_corto`) |
| `GET    /{id}` | — | `Formulario` |
| `PUT    /{id}` | `{ nombre, esquema, email, whatsapp, version }` | `Formulario` (409 si `version` no coincide; 422 con detalle si `Validar` falla) |
| `DELETE /{id}` | — | 204 (409 si ya tiene envíos: ciérralo) |
| `POST   /{id}/duplicar` | — | 201 `Formulario` |
| `POST   /{id}/estado` | `{ estado }` | `Formulario` |
| `POST   /previsualizar` | `{ esquema, email }` | `{ emailHtml, asunto, soloWeb, whatsappTexto }` (token ficticio, `action` desactivado) |
| `GET    /{id}/audiencia?estados=confirmado,reserva&soloSinResponder=true` | — | `{ total, email, whatsapp }` (email = con email; whatsapp = con teléfono y consentimiento de WhatsApp) |
| `POST   /{id}/envios` | `{ canales, filtro }` | 201 `Envio` (estado pasa a `activo`; 409 si `cerrado`) |
| `GET    /{id}/envios` | — | `Envio[]` |
| `GET    /{id}/estadisticas` | — | `Estadisticas` |
| `GET    /{id}/respuestas?estado=&q=&page=&size=` | — | `{ items: RespuestaFila[], total }` (`sin_respuesta` = destinatarios sin fila de respuesta) |
| `GET    /{id}/respuestas/{rid}` | — | `RespuestaDetalle` |
| `GET    /{id}/respuestas.csv` | — | CSV (una columna por campo con respuesta; uso futuro / exportar) |

Estados de entrega: athletes pide a messaging `POST /internal/competiciones/{cid}/mensajes/estados`
`{ "eventos": [uuid...] }` → `{ "<evento_id>": "en_cola|enviando|enviado|reintentando|rebotado|fallido|cancelado|omitido" }`
y agrega: `enCola` = en_cola+enviando+reintentando, `enviados` = enviado, `fallidos` = rebotado+fallido+cancelado,
`omitidos` = omitido + las entregas con `estado='omitido'` en athletes (sin email, sin consentimiento, sin teléfono).

## 5. API pública (athletes) · `^/api/formularios(/|$)` · sin login, solo token

| Método y ruta | Entrada | Salida |
|---|---|---|
| `GET  /api/formularios/{token}` | — | `{ competicion: { nombre, slug }, formulario: { titulo, esquema, soloWeb }, atleta: { nombre }, respuesta: { estado, datos, archivos, enviadoAt } \| null, cerrado, puedeEditar }` · marca `abierto_at` la 1.ª vez · 404 si el token no es válido |
| `PUT  /api/formularios/{token}` | `{ datos, enviar: boolean }` | `{ estado, porcentaje, errores: Record<campoId, string> }` · `enviar=false` = autoguardado parcial (sin validar obligatorios); `enviar=true` valida todo → `completa` o 422 con `errores` · 409 si cerrado o ya completa y `!permiteEditar` |
| `POST /api/formularios/{token}/email` | `application/x-www-form-urlencoded` desde el cliente de correo; nombres `f_<campoId>` (multivalor repetido; casilla = `on`; si_no = `si`/`no`) | 303 → `{PUBLIC_WEB_URL}/formularios/{token}?enviado=1`, o `?revisar=1` si faltan obligatorios (se guarda como parcial con `origen=email`) |
| `POST /api/formularios/{token}/archivos` | multipart `campoId` + `archivo` | `{ url, nombre, tamano, tipo }` · tipos y tamaño según el campo · se sube a BunnyCDN con el `storage(ctx,cid)` de athletes en `formularios/{formularioId}/{destinatarioId}/<uuid>.<ext>` |

- Rate limit por IP + token con `pkg/ratelimit` (como el resto de públicos).
- `Porcentaje` = campos con respuesta / campos que admiten respuesta × 100 (enteros).

## 6. Email (messaging)

- Plantilla nueva `formulario_invitacion` en el catálogo de plantillas (defecto en código, editable como las demás):
  asunto `{{asunto}}`, título `{{formulario}}`, cuerpo `{{intro}}`, botón «Rellenar en la web» → `{{enlace}}`.
- Var especial `formulario_html`: HTML ya compilado por `pkg/formularios.CompilarEmailHTML` que se inserta SIN escapar
  debajo del cuerpo, solo en esta plantilla y solo si viene en un evento de athletes. Vacío si `soloWeb`.
- `CompilarEmailHTML(esquema, accion, enlace)`: `<form action="{accion}" method="post">` con tablas e estilos en
  línea (compatible con clientes de correo; sin JS, sin CSS externo), colores del `tema`, botón de enviar y, debajo,
  «¿No puedes enviarlo desde aquí? Rellénalo en la web» → `enlace`. Gmail y algunos clientes no envían formularios: el
  botón web siempre está.
- WhatsApp: texto `whatsapp.texto` (o por defecto «Hola {{nombre}}, … {{enlace}}») con el enlace web; nunca formulario.

## 7. Asistente IA (ai) · `POST /api/admin/competiciones/{cid}/ia/formulario` · permiso `atletas.editar`

Entrada `{ instruccion, historial: {rol, texto}[], borrador: { nombre, esquema, email, whatsapp }, seleccion?: campoId, modelo? }`
Salida `{ borrador, respuesta, cambios: string[] }`. Igual que el asistente de campañas (`internal/ai/campana.go`):
edita una copia de trabajo con herramientas, valida con `formularios.Validar`, no guarda nada; el editor aplica el
resultado como un cambio que se puede deshacer.

Herramientas: `ver_formulario`, `editar_ajustes` (título, descripción, botón, gracias, permiteEditar, cierreAt),
`editar_tema`, `anadir_campo` (tipo + props + `despuesDe`), `editar_campo` (id + props parciales), `mover_campo`
(id + `despuesDe`), `duplicar_campo`, `borrar_campo`, `editar_opciones` (id + lista completa de opciones),
`editar_email` (asunto, preheader, intro), `editar_whatsapp` (texto), `tool_chain` (varias llamadas en una, con
`{"$ref":"paso.ruta"}`). Ids nuevos los genera el servidor.

## 8. Backoffice

- Navegación: entrada «Formularios» (icono lucide `clipboard-list`) junto a «Campañas». Rutas `/formularios` y `/formularios/:id`.
- Lista: tarjetas/tabla con nombre, estado, «solo web», destinatarios, % completas; crear, duplicar, borrar.
- Editor (`/formularios/:id`) con pestañas: **Editar** · **Vista previa** · **Envíos** · **Estadísticas** · **Atletas**.
  - **Editar** (tipo Figma): izquierda paleta de elementos (arrastrar al lienzo) + capas (lista reordenable);
    centro lienzo con el formulario real, arrastrar para reordenar, clic para seleccionar (contorno + asas), acciones
    rápidas (duplicar, borrar, subir/bajar); derecha inspector de propiedades del elemento seleccionado (o ajustes y tema
    del formulario si no hay selección) y panel de chat IA plegable como en campañas. Deshacer/rehacer (Ctrl+Z / Ctrl+Shift+Z),
    guardado con aviso de cambios sin guardar. Angular CDK drag-drop.
  - **Vista previa**: conmutador Web (escritorio/móvil) / Email (iframe con `emailHtml` de `/previsualizar`) / WhatsApp.
  - **Envíos**: crear envío (canales, filtro, audiencia en vivo, aviso de que va a la cola con ritmo anti-spam y enlace a «Cola de envío»), tabla de envíos con estado por canal.
  - **Estadísticas**: KPIs (destinatarios, abiertos, respuestas, % completas, % respuesta), progreso por canal, origen web/email, serie diaria y resultados por campo (barras por opción, media en escalas).
  - **Atletas**: lista de atletas con estado (completa/parcial/sin respuesta) y %, búsqueda y filtro; al pulsar uno, la lista
    hace fade-out y aparece (fade-in) el detalle con sus respuestas campo a campo (archivos con enlace); «Volver» invierte la animación. `prefers-reduced-motion` sin animación.

## 9. Web pública

`/formularios/:token` (SSR, `noindex`): cabecera de la competición, título y descripción, campos con el tema del
formulario, autoguardado (debounce 1,5 s, `enviar=false`), subida de archivos con progreso, validación en vivo,
envío final, estado de gracias; `?enviado=1` muestra la confirmación; `?revisar=1` marca los obligatorios pendientes;
cerrado / token inválido con mensajes claros. Accesible (labels, `aria-invalid`, foco al primer error), móvil primero.

## Implementación (B1)

Decisiones donde el contrato dejaba hueco o no encajaba del todo (el contrato manda; estas son las adaptaciones):

- **Tipos de campo:** la tabla de §2 lista 20 tipos y `pkg/formularios.Tipos` implementa los 20 (el encargo hablaba de 18).
- **`sin_respuesta`:** en `RespuestaFila` el `id` es `null` (no hay id de respuesta). El detalle `/respuestas/{rid}` solo acepta id de respuesta.
- **`PUT` con `enviar=true` y errores:** 422 con `{code, detail, estado, porcentaje, errores}`. Lo válido se guarda igualmente como `parcial`, para no perder lo escrito.
- **Autoguardado y `completa`:** una respuesta pasa a `completa` solo al enviar sin errores, o al autoguardar una respuesta ya completa que sigue cumpliendo los obligatorios.
- **Público `cerrado`:** también es `true` cuando el formulario está en `borrador` (solo se rellena en `activo`).
- **Archivos:** la `url` de cada archivo debe contener la carpeta del destinatario (`formularios/<formularioId>/<destinatarioId>/` en el CDN; `formularios-<formularioId>-<destinatarioId>-` en el volumen local de QA).
- **`pkg/bodylimit`:** nueva constante `Archivo` (21 MB) y regla `POST /api/formularios/*/archivos`.
- **Límites por defecto** cuando el campo no fija `validacion.maxLargo`: texto_corto 200, texto_largo 5000, email 254, telefono 30, fecha 10 caracteres.
- **`NuevoID(prefijo)`:** acepta «c» u «o» (añade el `_`); también acepta «c_» y «o_».
- **`Porcentaje`:** vale 100 si el formulario no tiene campos que admitan respuesta.

## Implementación (B2)

Desviaciones y decisiones de la fase de envíos, estadísticas y previsualización:

- **Clave de plantilla:** `formulario_invitacion` (con guion bajo, como pide §6). Las rutas admin de plantillas aceptan `_` en `{clave}` (`^[a-z0-9_-]{3,40}$`).
- **Automatización `formularios`:** aviso no operativo (`esencial: false`): se pausa durante el evento como las campañas y se puede desactivar desde «Automatizaciones».
- **`evento_id` del WhatsApp al atleta:** messaging guarda el id del evento (antes, uno derivado) como `mensajes.evento_id`, para que athletes siga cada entrega. Los mensajes a organizadores conservan el id derivado.
- **`formulario_html`:** messaging lo descarta de todo evento que no sea `athletes.*` (en `handleEmail`). Solo la plantilla `formulario_invitacion` lo inserta, sin escapar, debajo del cuerpo.
- **Estado de un evento que messaging no conoce:** cuenta como «en cola». Ocurre también si el WhatsApp al atleta está desactivado en «Avisos de solicitudes»: messaging no crea ese mensaje.
- **Límites de un envío:** más de 5000 atletas → 422 `DEMASIADOS_DESTINATARIOS`; ningún atleta → 422 `SIN_DESTINATARIOS`. `soloSinResponder` deja fuera (motivo `ya_completo`) a quien tiene la respuesta completa, también en la audiencia.
- **Totales:** en el envío, `total` son los atletas del filtro y `omitidos` los que no tienen ningún canal encolado. En `CanalEstado`, `total` son las entregas de ese canal (encoladas y omitidas).
- **Consentimiento de WhatsApp:** `waAceptado` (la ficha, o la casilla del alta aprobada; «retirado» lo anula), como en el resto de athletes.
- **Vista previa:** acepta además `whatsapp` (opcional) para mostrar el texto de WhatsApp del borrador.
- **Auditoría:** `athletes.formulario_{creado,guardado,borrado,duplicado,estado,enviado}`, admin con permiso `atletas.editar` y sin datos personales. Resúmenes en `internal/audit/rules.go`.
- **Coste:** `formulario_html` viaja en cada evento y en `mensajes.vars` (una copia por destinatario).
- **Estadísticas:** el estado de las entregas viene de messaging; si messaging no responde, responden 503.


## Implementación (B3 · asistente de formularios)

- Código: `internal/ai/formulario.go` (endpoint, prompt, borrador) y `internal/ai/formulario_tools.go` (herramientas). Lo compartido con campañas vive en `internal/ai/herramientas.go` (definición de herramientas, bucle de MiniMax, `tool_chain` con `$ref`, cupo, contexto de la competición); el asistente de campañas usa ese código sin cambio de comportamiento.
- Permiso: `GET .../ia/modelos` acepta `campanas.enviar` **o** `atletas.editar` (`requerirAlguno` en `ai.go`). `ia-campana` sigue con `campanas.enviar`.
- Cupo: el asistente de formularios comparte el cupo de IA de la competición (30/h por usuario, 300/día por competición) con el de campañas.
- Cada cambio se aplica a una copia del borrador y solo reemplaza al original si `formularios.Validar` pasa; un error se devuelve al modelo como resultado `is_error` y no se aplica.
- Límites de email/WhatsApp que el contrato no fija y el asistente comprueba: asunto 160, preheader 200, introducción 1000, WhatsApp 1000 caracteres. Athletes debe aplicar los mismos (o más laxos) al guardar.
- Sin evento `ia.diseno` para formularios (no está en el contrato).
- Pendiente: `editar_opciones`/`editar_campo` aceptan `opciones` también en tipos sin opciones; `Validar` las ignora y quedan guardadas. Conviene que el editor no lo ofrezca o que athletes las descarte al guardar.
