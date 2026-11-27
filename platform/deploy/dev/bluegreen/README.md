# Blue/green del entorno local (grcup dev en jaime-desktop)

Despliegue local sin corte: dos colores (`blue`, `green`) del stack de aplicación, una infra compartida que nunca se
recrea y un conmutador de nginx. Lo que sirve el dominio `grcup-qa.menustudioai.com` (SSR + API) y
`grcup-qa-bo.menustudioai.com` (backoffice) pasa de un color a otro en un solo reload de nginx.

## Topología

| Pieza | Dónde | Puertos (blue / green) | Notas |
|---|---|---|---|
| Infra (`grcup-infra`) | `infra.yml` | Postgres, Redis, Mailpit `127.0.0.1:18325`, evo-weai `127.0.0.1:18380` | Volúmenes `grcup-h_pgdata` y `grcup-h_weai-data` (external). Nunca se recrea. |
| Redes de datos | `grcup-data-blue`, `grcup-data-green` | — | Cada color ve solo su propio stack y la infra. Así `identity` nunca resuelve a dos colores. |
| App (`grcup-blue`, `grcup-green`) | `app.yml`, con `COLOR`, `GATEWAY_PORT`, `CHAT_PORT`, `CHAT_LOAD_PORT` | gateway `18300 / 18310`, chat `18302 / 18312`, chat-load `18301 / 18311` | 28 servicios. Volúmenes `grcup-h_atletas-data` y `grcup-h_cmsdata` (external, compartidos por los dos colores). |
| SSR (unidad usuario `grcup-dev-web@<color>`) | `systemd/grcup-dev-web@.service`, dist en `~/grcup-dev/public-dist-<color>` | `4200 / 4201`, `127.0.0.1` | SIGTERM: deja de aceptar, termina los renders en vuelo, sale antes de 25 s. |
| SSR → API | `nginx/grcup-dev-ssr-api.conf`, `127.0.0.1:18399` | — | El SSR llama a nginx, y nginx manda a `grcup_api`. Así un cambio de API no reinicia el SSR. |
| Backoffice | `/srv/grcup-dev/backoffice-releases/<sha>-<hora>`, `/srv/grcup-dev/backoffice` = symlink a la release viva | — | El cambio es un `mv -T` de symlink (atómico). Se conservan las 3 últimas. |
| Conmutador | `/etc/nginx/conf.d/grcup-dev-upstream.conf` (generado) | — | `upstream grcup_web` y `upstream grcup_api` (keepalive 16). |
| Estado | `~/grcup-dev/bluegreen.state` | — | `WEB=`, `API=`, `BO=`, `PREV_WEB=`, `PREV_API=`. |
| Lock | `~/grcup-dev/bluegreen.lock` (flock) | — | Dos despliegues o rollbacks no pueden solaparse. |

Los servicios con estado singleton no se duplican por color: `juegos-worker` y el worker de `patrocinio` usan un
líder por lock en Redis, que es compartido. Así que dos colores conviven con un solo líder.

Puertas del host: `grcup-qa-desktop.conf` (TLS, tailnet) y `grcup-dev.conf` (`:8009`). Ambas usan `grcup_web`,
`grcup_api` y los snippets `/etc/nginx/grcup-dev/proxy-api.inc` y `proxy-sse.inc` (streams sin buffer, 1 h de timeout,
WebSocket del chat incluido). Los instala `instalar.sh` desde esta carpeta.

## Comandos

```bash
# Una sola vez: migra el legado grcup-h (corte de ~1 min medido al final) a infra + blue.
platform/deploy/dev/bluegreen/instalar.sh [ref]           # ref por defecto origin/dev

# Despliegue en el color inactivo, gates, conmutación, drenaje de 60 s, parada del anterior.
platform/deploy/dev/bluegreen/redeploy.sh                  # API + web + backoffice
platform/deploy/dev/bluegreen/redeploy.sh --solo-web       # solo SSR (la API no cambia)
platform/deploy/dev/bluegreen/redeploy.sh --solo-servicios # solo gateway y servicios
platform/deploy/dev/bluegreen/redeploy.sh --solo-backoffice
platform/deploy/dev/bluegreen/rollback.sh                  # cada puerta vuelve al color anterior
platform/deploy/dev/bluegreen/estado.sh                    # vivo, salud de los dos colores, infra, nginx
```

La fuente de build es el worktree desacoplado `.worktrees/deploy-bg` (lo mueve al `ref`). Los scripts y las plantillas
son los del checkout desde el que se ejecutan. El compose y el código salen del `ref`.

### Flujo de `redeploy.sh`

1. Lock y memoria (mínimo 8 GB disponibles). `fetch` y checkout de `deploy-bg` al `ref`.
2. Build en el color inactivo: `compose up -d --build` (vía `cgrun`), `ng build public` a `public-dist-<idle>`,
   `ng build backoffice` a una release nueva.
3. Gates del inactivo: gateway `/healthz` 204, `GET /api/competiciones/grcup` 200 y las rutas de arranque del SSR
   (`/web`, `/entradas`, `/juegos/fantasy/resumen`, `/horarios`, `/atletas`, `/seo`) 200. SSR `GET /` con
   `Host: grcup-qa.menustudioai.com` 200. Antes de arrancar el inactivo, Postgres tiene que tener ~80 conexiones libres
   (`max_connections=200`: dos colores en el solape). Si falla, para lo nuevo y sale con código ≠ 0. El vivo no se toca.
4. Conmutación: se reescribe el upstream, `nginx -t`, `nginx -s reload`, y se comprueba que la config nueva cargó
   (listener 127.0.0.1:18399). Si falla algo, se restaura el upstream anterior. Después se comprueba el borde
   (`https://grcup-qa…/` y `/api/competiciones/grcup`). Si falla, vuelve el color anterior.
5. Backoffice: `mv -T` del symlink y poda de releases.
6. Drenaje de 60 s (los clientes SSE y WS reconectan con `Last-Event-ID`). Después se paran el stack y la unidad SSR
   anteriores con `compose stop` y `systemctl stop`. Nunca `down -v`, y los volúmenes no se tocan.

`rollback.sh` arranca el color contrario sin build (`up --no-build`, con sus imágenes y su dist de antes), pasa los
mismos gates, conmuta y para el abandonado. El backoffice no tiene rollback: se redespliega una release anterior con
`redeploy.sh --solo-backoffice <ref>`.

## Regla expand/contract para migraciones

Cada servicio migra al arrancar (`AUTO_MIGRATE=true`). Durante el solape (el color nuevo arranca mientras el vivo
sigue atendiendo) los dos usan la misma base de datos. Por eso:

- **Expand (en el release que se despliega):** solo añadir. Tablas nuevas, columnas nullables o con default, índices
  (`CREATE INDEX CONCURRENTLY` si es grande). El código del release anterior tiene que seguir funcionando.
- **Contract (en un release posterior, cuando el color anterior ya no existe):** quitar columnas, renombrar,
  `NOT NULL` sin default, cambiar tipos.
- Nunca un release que dependa de que el otro color ya no esté. Un rollback vuelve a un color que puede seguir
  escribiendo con el esquema expandido.

Los seeds (`*-seed`) son idempotentes (comprueban conteos antes de sembrar) y se re-ejecutan en cada arranque de color.

## Límites conocidos

- Los WebSocket y SSE de un cliente conectado al color que se para reconectan con `Last-Event-ID`. Los eventos del
  realtime pasan por Redis; durante el drenaje un evento puede ser consumido por el color nuevo y no llegar al cliente
  viejo. El cliente lo recupera al reconectar.
- El webhook de WhatsApp (`evo-weai`) sigue el comportamiento previo: `WHATSAPP_WEBHOOK_URL` no está configurado.
- El legado `grcup-h` queda parado, no eliminado, tras `instalar.sh` (por si hay que mirar algo). `docker compose -p grcup-h rm`
  es manual.
- `public-dist` (el build antiguo del SSR) y el backup de Postgres de `instalar.sh` quedan en `~/grcup-dev/` y
  `~/grcup-dev/backups/bluegreen-<hora>/`.

## Ficheros del host (los instala `instalar.sh`)

| Origen (esta carpeta) | Destino |
|---|---|
| `nginx/grcup-qa-desktop.conf`, `nginx/grcup-dev.conf`, `nginx/grcup-dev-ssr-api.conf` | `/etc/nginx/conf.d/` |
| `nginx/grcup-dev-upstream.conf.tmpl` (lo renderizan los scripts) | `/etc/nginx/conf.d/grcup-dev-upstream.conf` |
| `nginx/snippets/*.inc` | `/etc/nginx/grcup-dev/` |
| `systemd/grcup-dev-web@.service` | `~/.config/systemd/user/` (+ `~/grcup-dev/ssr/<color>.env` con `PORT`) |

SELinux: `/srv/grcup-dev` tiene el contexto `httpd_sys_content_t` (`semanage fcontext` + `restorecon`, en `instalar.sh`).
