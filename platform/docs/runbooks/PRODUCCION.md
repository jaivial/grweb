# Runbook de producción · GR Cup

Operación diaria y respuesta a incidentes de la plataforma (`platform/`). QA vive en el namespace `grcup-qa` del nodo
`kraken`; producción seguirá el mismo esquema con su propio namespace, dominios y secretos.

> Convenciones: `k` = `sudo k3s kubectl -n <namespace>`. Ningún comando de este documento toca la web antigua
> (`/var/www/grweb`, `grcup-api.service`, MySQL) ni el PostgreSQL del host.

## 1. Despliegue y vuelta atrás

| Acción | Cómo |
|---|---|
| Desplegar un commit | `cd platform && make verify && deploy/scripts/desplegar-qa.sh` (construye las imágenes con el hash del commit, las importa en k3s, aplica Kustomize y espera a que todo esté listo y los seeds terminen). |
| Ver qué versión corre | `k get deploy -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image` |
| Volver a la versión anterior de un servicio | `k rollout undo deploy/<servicio>` (guarda 3 revisiones). Para todo: volver a desplegar el commit anterior. |
| Migraciones | Se aplican solas en el init container `migrate` de cada servicio (goose). Son siempre aditivas: una vuelta atrás de código no necesita revertir esquema. |

Antes de un despliegue el día del evento: no desplegar entre la apertura de puertas y el último flight salvo
corrección urgente.

## 2. Copias y restauración

- **CronJob `copias-postgres`**: cada noche a las 03:30 (Europe/Madrid), `pg_dump -Fc` de cada base `grcup_*` y
  `pg_dumpall --globals-only`, en `/var/lib/grcup-qa/copias/<AAAA-MM-DD>/` del nodo. Se guardan 7 días.
- **Copia manual** (antes de algo arriesgado): `k create job --from=cronjob/copias-postgres copia-manual-$(date +%H%M)`.
- **Comprobar**: `k logs job/<job>` lista cada base con su tamaño; `ls -lh /var/lib/grcup-qa/copias/` en el nodo.
- **Restaurar una base** (p. ej. `grcup_ticketing`):
  1. Parar el servicio: `k scale deploy/ticketing --replicas=0` (el HPA lo vuelve a subir al terminar).
  2. `k exec -i postgres-0 -- pg_restore -U postgres -d grcup_ticketing --clean --if-exists < /var/lib/grcup-qa/copias/<fecha>/grcup_ticketing.dump`
  3. `k scale deploy/ticketing --replicas=1` y revisar `/readyz`.
- **Probar una copia sin tocar nada**: restaurar en una base temporal (`createdb grcup_restore_test`, `pg_restore -d
  grcup_restore_test …`, contar filas, `dropdb`).
- Las copias del nodo no sustituyen una copia fuera de él: en producción, sincronizar `/var/lib/<ns>/copias` a un
  almacenamiento externo (pendiente de decidir proveedor).

## 3. Escalado

- Cada servicio tiene HPA por CPU (70 %): sube hasta 2 pods cada 30 s y baja de 1 en 1 tras 5 min estables. La memoria
  no escala (el heap de Go se queda alto tras un pico).
- Servicios del día del evento con **2 réplicas mínimas**: gateway, web, identity, competition, ticketing, live y
  realtime. Perder un pod no es una caída (PodDisruptionBudget `maxUnavailable: 1`, `preStop` de 5 s para que el pod
  salga del Service antes de apagarse).
- Ver el estado: `k get hpa` · `k top pods`.
- Antes del evento (opcional): subir mínimos a mano, p. ej. `k patch hpa ticketing -p '{"spec":{"minReplicas":3}}'`,
  y volver a dejarlo después.
- Cuota del namespace: `k describe resourcequota` (límite de CPU y memoria de todos los pods).

## 4. Red

- Por defecto no entra nada en ningún pod (`default-deny-ingress`). Cada servicio solo acepta al gateway, a audit
  (comprobaciones de salud) y a los servicios que lo llaman: `allow-<servicio>`, generadas desde `LLAMADAS` en
  `deploy/k8s/generar.py`. identity acepta a todos (claves públicas JWKS).
- Si un servicio nuevo empieza a llamar a otro: añadirlo en `LLAMADAS`, `python3 generar.py` y desplegar. Síntoma de
  haberlo olvidado: timeouts de `svcclient` en los logs del que llama.
- Postgres solo acepta pods con `grcup.dev/db: "true"`; Mailpit (QA) solo a los servicios.

## 5. Observabilidad

- **Backoffice › Sistema › Salud**: estado y p95 de cada servicio, bus de eventos (pendientes y retraso de cada grupo
  consumidor) y conexiones en tiempo real.
- **`/metrics`** en cada servicio (puerto interno, formato Prometheus): peticiones por ruta y código, histograma de
  latencia, goroutines y heap. `k port-forward deploy/<servicio> 9000:8080` y `curl localhost:9000/metrics`.
- **Logs**: JSON estructurado con `request_id` (cabecera `X-Request-Id`, también en la auditoría):
  `k logs deploy/<servicio> --since=15m | grep <request_id>`.
- **Auditoría**: Backoffice › Auditoría (quién cambió qué y cuándo).

## 6. Incidentes

| Síntoma | Comprobar | Acción |
|---|---|---|
| Un servicio no está listo | Salud o `k get pods`; `k describe pod`; `k logs --previous` | Si es un despliegue: `k rollout undo`. Si es la base de datos o Redis, ver abajo. |
| Postgres caído | `k get pods postgres-0`, `k logs postgres-0` | Los servicios devuelven 503 sin perder datos (outbox). Al volver, `/readyz` se recupera solo. |
| Redis caído (puente) | `k get pods -l app.kubernetes.io/name=redis-puente`; `systemctl status redis` en el nodo | Sin Redis no hay tiempo real ni límites de peticiones; los eventos esperan en el outbox de cada servicio y salen al volver. |
| Bus de eventos con retraso | Salud › Trabajos (columna «Por leer») | Ver logs del consumidor atrasado. Los mensajes que fallan 20 veces se descartan con un log de error. |
| Emails sin salir | Backoffice › Emails y avisos › Bandeja (estado del SMTP) · Sistema › Email (dominio) | El envío reintenta con espera; campañas: el canal se pausa 1 min por caída del servidor sin gastar reintentos. |
| WhatsApp sin salir | Campañas › WhatsApp (estado de la sesión de evo-weai) | Vincular de nuevo el número con el código. |
| Pagos sin confirmar | Sorteo › Boletos y pagos / Atletas › Inscripción (pendientes) | El webhook se reintenta desde Stripe; el estado de la compra repite la consulta. Revisar el secreto del webhook en Sistema › Integraciones. |
| Pantalla del pabellón sin conexión | Directo › Pantalla (último ping) | Recargar la página de la pantalla; si el enlace se filtró, «Nuevo enlace». |

## 7. Secretos

- QA: `deploy/scripts/secretos-qa.sh` genera una vez y aplica los Secrets (valores en `~/.config/grcup-qa/`, nunca
  impresos). Para rotar uno: borrar su línea del fichero, volver a ejecutar el script y reiniciar los pods que lo usan
  (`k rollout restart deploy/<servicio>`).
- `INTERNAL_TOKEN_SECRET` firma los tokens entre servicios, los QR de entradas, los enlaces de «Mi entrada», de baja y
  de la pantalla: rotarlo invalida todos esos enlaces (avisar antes).
- Las claves de integraciones (SMTP, Stripe, WhatsApp) se guardan cifradas con `CRYPTO_KEY` en competition y se
  cambian desde Sistema › Integraciones.

## 8. Día del evento

1. La víspera: copia manual, `k get hpa` (mínimos), Salud en verde, prueba de un email y de una entrada.
2. Apertura de puertas: puestos de check-in con la lista offline descargada (Check-in › Escáner).
3. Directo: mesa abierta en el portátil con red cableada si es posible; la mesa guarda las decisiones sin conexión y
   las envía en orden.
4. Cierre: «Dar por terminada» en Directo, publicar resultados pendientes, copia manual.

## 9. Datos personales

- Supresión de un contacto: Contactos › ficha › RGPD (borra en todos los servicios y deja solo los hashes de baja).
- La anonimización de una edición entera depende de la decisión de retención (propuesta: 12 meses) y se hará desde
  Sistema › Zona peligrosa cuando se apruebe.
