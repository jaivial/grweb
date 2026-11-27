# Blue/green de Kubernetes (colores)

QA corre en kraken (k3s) en dos colores idénticos y una capa compartida. Cada despliegue construye el color inactivo,
lo prueba dentro del clúster, conmuta el edge de nginx y deja el anterior apagado para volver con `rollback-bg.sh`.

## Topología (QA)

| Pieza | Namespace | Qué contiene | IPs fijas (Service gateway / web / backoffice / chat-ws) |
|---|---|---|---|
| Capa compartida (`colores/compartido` + `colores/qa/compartido`) | `grcup-qa` | Postgres (StatefulSet), Redis-puente (DaemonSet + Service al host), Mailpit, evo-weai, juegos-worker, copia de seguridad, ConfigMap `grcup-colores` (estado) | Mailpit `10.43.240.25` |
| Color `blue` (`colores/qa/blue`) | `grcup-qa-blue` | Los 22 servicios sin estado (gateway, identity, competition…) | `10.43.238.10 / .11 / .12 / .13` |
| Color `green` (`colores/qa/green`) | `grcup-qa-green` | Igual que blue | `10.43.237.10 / .11 / .12 / .13` |

- **Por qué namespaces por color y no sufijos:** dentro de cada color los nombres son los de siempre
  (`http://identity:8080`, `UPSTREAMS`, `JWKS_URL`…), así que ni el código ni el ConfigMap cambian entre colores.
- **Capa compartida desde un color:** `postgres`, `redis`, `mailpit` y `evo-weai` son Services `ExternalName` hacia
  `grcup-qa` (`colores/qa/comun/enlaces.yaml`). Las políticas de red de la capa compartida admiten los namespaces con
  `grcup.dev/colores=true` (`colores/compartido/permitir-colores.yaml`).
- **Capa compartida hacia un color:** los que llaman a servicios sin estado (juegos-worker, el webhook de evo-weai →
  messaging) usan Services `ExternalName` en `grcup-qa` con el nombre del servicio. `scripts/lib/colores.sh` los apunta
  al color vivo en cada conmutación. Los namespaces de color admiten a `grcup.dev/compartido=true`
  (`colores/color/permitir-compartido.yaml`).
- **Secretos:** cada color recibe una copia de los Secrets Opaque de `grcup-qa` (`colores_secretos`).
- **Edge:** `/etc/nginx/conf.d/grcup-qa-upstream.conf` (plantilla `deploy/nginx/grcup-qa-upstream.conf.tpl`) con las IPs
  del color vivo. El vhost `grcup-qa.conf` no define upstreams.
- **Estado:** ConfigMap `grcup-colores` en `grcup-qa` (`vivo`, `previo`). Las réplicas de un color apagado van en la
  anotación `grcup.dev/replicas-antes` de cada Deployment.

## Scripts (desde `platform/`)

```bash
deploy/scripts/instalar-bg.sh qa     # UNA VEZ: del stack único a blue sin corte
deploy/scripts/desplegar-bg.sh qa    # build, color inactivo, puertas, conmutación, drenaje 60 s, apagado del anterior
deploy/scripts/rollback-bg.sh qa     # vuelve al color anterior (sin build): réplicas anotadas, mismas puertas
deploy/scripts/estado-bg.sh qa       # vivo/previo, réplicas, destino de los ExternalName, upstream, borde, memoria
```

- `desplegar-bg.sh` y `rollback-bg.sh` toman un lock en kraken (`flock` en `/run/grcup-colores-qa.lock`) mientras
  viven. Un fallo antes de conmutar apaga el color nuevo y deja el vivo intacto.
- Las puertas (`colores_puertas`) miran la IP del color: `/api/competiciones/grcup` 200, rutas calientes 200, SSR
  `GET /` 200 con `Host: grcup-qa…`, backoffice 200. El borde se comprueba desde kraken con `--resolve` al tailnet.
- Holgura de Postgres: al menos 150 conexiones libres antes de un color nuevo (`max_connections=400`).

## Migraciones (expand/contract)

Las migraciones corren en el arranque de cada pod (init container con goose, lock advisory de Postgres), así que el
color nuevo migra mientras el vivo sigue atendiendo. Por eso:

- **Expand** (en el release que se despliega): solo añadir (tablas, columnas nullables o con default, índices).
  El código del release anterior tiene que seguir funcionando contra ese esquema.
- **Contract** (en un release posterior, cuando el color anterior ya no existe): quitar columnas, renombrar, `NOT NULL`
  sin default, cambiar tipos.
- Un rollback vuelve a un color que puede seguir escribiendo con el esquema expandido.

## Límites conocidos

- Un WebSocket o SSE del color que se apaga reconecta con `Last-Event-ID`; los eventos de Redis pueden llegar al color
  nuevo durante el drenaje.
- El color inactivo arranca con sus réplicas mientras el vivo sigue: el nodo comparte CPU con producción (presupuesto
  `presupuesto.py`). Durante el solape se reservan ~2,6 CPU y ~2,5 GiB extra de requests de QA.
- `generar.py` no reproduce los ajustes manuales de los manifiestos de `base/` (`prod-20261115`); no regenerar los
  servicios sin revisar el diff.
- Producción tiene su propio layout (ver abajo). Hasta que `instalar-bg.sh prod` se ejecute, sigue en el stack único
  de `grcup` (`desplegar.sh prod`), que se niega a correr una vez existe el estado `grcup-colores`.

## Producción (grscup.com)

| Pieza | Namespace | IPs fijas (gateway / web / backoffice) |
|---|---|---|
| Capa compartida (`colores/prod/compartido`) | `grcup` | Postgres, Redis-puente (16380), evo-weai, juegos-worker, copias |
| Color `blue` (`colores/prod/blue`) | `grcup-blue` | `10.43.242.10 / .11 / .12` |
| Color `green` (`colores/prod/green`) | `grcup-green` | `10.43.241.10 / .11 / .12` (libres solo tras la migración) |

- Valores de `overlays/prod` preservados: HPA y PDB (mínimos de producción intactos), quota, `grcup-prod`, hostPaths
  de `/var/lib/grcup`, configuración (`DOMINIOS_CONFIRMADOS` en `componentes/prod/config.yaml`), Google y Stripe.
- El webhook de evo-weai es la URL pública (`https://grscup.com`): pasa por el edge, así que no depende del color.
  Messaging llama a evo-weai por su ExternalName de la capa compartida.
- Edge: `/etc/nginx/conf.d/grcup-prod-upstream.conf` (plantilla `deploy/nginx/grcup-prod-upstream.conf.tpl`). Los
  `proxy_pass` del vhost `grscup.com.conf` no cambian: solo se borran sus tres upstreams en línea
  (`deploy/scripts/nginx-prod-upstream.sh`, una recarga, con copia y restauración).

```bash
deploy/scripts/instalar-bg.sh prod --confirmo-produccion [--parar-qa]   # UNA VEZ
deploy/scripts/desplegar-bg.sh prod --confirmo-produccion [--parar-qa]
deploy/scripts/rollback-bg.sh prod --confirmo-produccion [--parar-qa]
deploy/scripts/estado-bg.sh prod
```

- Producción exige `--confirmo-produccion` y los mismos gates que `desplegar.sh prod` (dominios confirmados, Secrets).
- El nodo cap a 110 pods. Antes de encender un color se cuentan sus réplicas mínimas (HPA) más 5 de margen. Si no cabe,
  el script lo dice y pide `--parar-qa`: QA escala su color vivo a 0, se espera a que sus pods se vayan, y se restaura
  al final (también si falla: trampa de salida).
- Las imágenes ya presentes en el containerd de kraken no se reconstruyen (un tag es un commit).
- Un Deployment sin progreso durante 90 s para el despliegue con sus pods, eventos y logs; tope total de 600 s.
