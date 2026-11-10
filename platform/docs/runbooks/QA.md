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

## WhatsApp (evo-weai)

El servicio de WhatsApp (`evo-weai`) es un microservicio propio: no se construye con el resto de imágenes (viene de
su propio repositorio, `~/evo-weai`, y la imagen se baja de una release privada), así que su imagen se trae a mano.
El manifiesto (`deploy/k8s/base/evo-weai/`) ya está en el overlay: 1 réplica, `Recreate`, estado en
`/var/lib/grcup-qa/evo-weai`, Secret `grcup-weai` y sin Ingress (solo entra `messaging`).

**Una vez (imagen y secretos):**

```bash
# 1. La imagen (el token de GitHub con permiso de lectura en el repositorio de evo-weai):
docker build -f ~/evo-weai/Dockerfile.prebuilt --build-arg EVO_WEAI_REF=v0.2.14 \
  --secret id=evo_weai_gh_token,env=EVO_WEAI_GH_TOKEN -t grcup/evo-weai:v0.2.14 ~/evo-weai
docker save grcup/evo-weai:v0.2.14 | gzip -1 | ssh kraken 'gunzip | sudo k3s ctr -n k8s.io images import -'

# 2. Los secretos (crea también el Secret grcup-weai con WEAI_API_KEY y WEAI_DATA_KEY):
deploy/scripts/secretos-qa.sh
```

**En cada despliegue** la imagen no se reconstruye: si cambia la versión de evo-weai, se repite el paso 1 con la
nueva etiqueta y se cambia `image:` en `deploy/k8s/base/evo-weai/evo-weai.yaml`.

**Vincular el número (la apikey va en la integración):**

1. La clave global de evo-weai es la `WEAI_API_KEY` del Secret. Se copia (sin imprimirla en un canal abierto) a la
   integración «WhatsApp» de la competición: *Backoffice › Sistema › Integraciones › WhatsApp* → proveedor `evo-weai`,
   URL `http://evo-weai:8080` (la interna del cluster), clave = `WEAI_API_KEY`.
   ```bash
   ssh kraken sudo k3s kubectl -n grcup-qa get secret grcup-weai -o jsonpath='{.data.WEAI_API_KEY}' | base64 -d
   ```
2. *Backoffice › Sistema › WhatsApp* → «Crear instancia». Crea en evo-weai la instancia `grcup-<slug>`, registra su
   webhook y muestra el QR.
3. «Vincular con QR» (escanea el QR desde el móvil) o «Vincular con código» (número → código de 8 caracteres).
4. «Avisos de solicitudes de atleta»: los teléfonos de los organizadores (E.164) y los interruptores «WhatsApp al
   atleta» y «WhatsApp a organizadores». «Enviar prueba» manda un mensaje a la lista.

- El webhook de QA es **interno**: `http://messaging:8080/api/webhooks/whatsapp` (la firma va en la query y evo-weai
  añade la cabecera `authorization: Bearer <clave>`). En el Deployment está `WEAI_WEBHOOK_ALLOW_INTERNAL=true` para
  que evo-weai acepte ese destino; en producción se sustituye por la URL pública y el flag pasa a `false`.
- En QA, `WHATSAPP_SIMULADO=true` (base/common/config.yaml): los envíos se registran como entregados sin salir. Para
  probar de verdad hay que poner la integración en evo-weai y vincular el número.
- El estado se ve en vivo: los eventos `whatsapp.conexion` y `whatsapp.qr_nuevo` llegan al bus y la página se
  actualiza sola (el QR se pide con `GET /api/admin/competiciones/{cid}/whatsapp/qr`).

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
