# Runbook · entorno QA en kraken (k3s)

QA vive en el namespace `grcup-qa` del k3s de kraken y solo se alcanza por la tailnet.

| URL | Sirve |
|---|---|
| https://grcup-qa.menustudioai.com | Web pública |
| https://grcup-qa-bo.menustudioai.com | Backoffice |
| https://grcup-qa-api.menustudioai.com | Gateway |
| https://grcup-qa-mail.menustudioai.com | Mailpit |

**Lo que no se toca en kraken:**
- la API actual (`grcup-api.service`), `/var/www/grweb` y su MySQL;
- el PostgreSQL del host;
- el resto de sitios de nginx.

**Lo que sí añade QA en kraken:**
- el namespace `grcup-qa`;
- `/var/lib/grcup-qa/postgres`;
- un usuario ACL `grcup` en Redis, limitado a `grcup:*`;
- el sitio de nginx `grcup-qa.menustudioai.com.conf` y su certificado.

## Primera puesta en marcha (una vez)

Desde `platform/` en el escritorio (con acceso `ssh kraken` y `sudo`):

```bash
deploy/scripts/dns-cloudflare.sh   # registros A → 100.66.235.72 (solo DNS), credenciales de ~/.env
deploy/scripts/secretos-qa.sh      # genera ~/.config/grcup-qa/secrets.env + jwt.pem (0600) y aplica los Secrets
deploy/scripts/redis-acl-qa.sh     # usuario ACL grcup en el redis-server de kraken (en caliente + redis.conf)
deploy/scripts/desplegar-qa.sh     # imágenes → containerd de k3s, kustomize apply, rollout
deploy/scripts/nginx-qa.sh         # certificado Let's Encrypt (DNS-01) + sitio nginx, nginx -t y reload
```

## Despliegues siguientes

```bash
deploy/scripts/desplegar-qa.sh
```

- **Etiqueta de las imágenes.** Es el commit. Con cambios sin commitear se añade `-wipHHMMSS`, para no reutilizar nunca una etiqueta con otro contenido.
- **Migraciones.** Las aplica el `initContainer migrate` de cada servicio antes de servir la nueva versión. El *rolling update* es sin caída (`maxUnavailable: 0`).

## Acceso de QA sin escribir contraseñas (cu)

```bash
ssh kraken sudo k3s kubectl -n grcup-qa exec deploy/identity -- /app enlace-acceso <email> [/ruta]
```

El comando imprime un enlace de un solo uso (válido 15 min) que abre la sesión en el backoffice. Se puede pasar a `cu navigate`.

**Usuario Root de QA:** `ROOT_EMAIL` en `~/.config/grcup-qa/secrets.env`. Por defecto es la cuenta del propietario.

## Comprobaciones

```bash
curl -s https://grcup-qa-api.menustudioai.com/api/health | jq   # estado de cada servicio y de Redis
ssh kraken sudo k3s kubectl -n grcup-qa get pods,hpa,pdb
ssh kraken sudo k3s kubectl -n grcup-qa logs deploy/gateway --tail=50
```

## Cómo funciona

- **Redis.**
  - El DaemonSet `redis-puente` (socat con `hostNetwork`) escucha en `10.42.0.1:16379`, la IP de cni0, que no se expone a internet. Reenvía al `redis-server` del host en `127.0.0.1:6379`.
  - El Service `redis` apunta ahí con un EndpointSlice manual.
  - Los pods usan el usuario `grcup`, que solo puede tocar `grcup:*`.
  - Todas las claves de QA empiezan por `grcup:qa:`.
- **PostgreSQL 17.** StatefulSet con `hostPath` (el k3s de kraken no tiene StorageClass). La primera vez crea una base de datos y un rol por servicio.
- **Red.**
  - No hay NodePorts, porque kraken no tiene cortafuegos. El nginx del host llega a ClusterIP fijas:
    - `10.43.240.10` gateway;
    - `.11` web;
    - `.12` backoffice;
    - `.25` Mailpit.
  - NetworkPolicies (kube-router): por defecto se deniega todo. Solo pueden entrar:
    - el nodo;
    - gateway y servicios hacia los servicios;
    - los pods con base de datos hacia PostgreSQL.
- **Escalado.** HPA por CPU (70 %) y memoria (80 %) con el metrics-server de k3s. El gateway tiene de 2 a 6 réplicas y PDB `minAvailable: 1`.

## Vuelta atrás

**Volver a una versión anterior:**

```bash
VERSION=<commit anterior> deploy/scripts/desplegar-qa.sh
```

Si la imagen ya está en containerd, solo se reaplica.

**Retirar QA por completo:**

```bash
ssh kraken sudo k3s kubectl delete namespace grcup-qa
ssh kraken sudo rm /etc/nginx/sites-enabled/grcup-qa.menustudioai.com.conf && ssh kraken sudo systemctl reload nginx
```

Si también hay que quitar el usuario de Redis, hay que deshacerlo en `redis.conf`. La copia de seguridad es `redis.conf.bak-grcup-*`.
