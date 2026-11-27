#!/usr/bin/env bash
# instalar-bg.sh <qa> — UNA VEZ: pasa el stack único de grcup-qa a blue sin corte (desde platform/).
#   · la capa compartida (Postgres, Redis-puente, Mailpit, evo-weai, juegos-worker) se queda en grcup-qa;
#   · los servicios sin estado se levantan en grcup-qa-blue con IPs nuevas (10.43.238.x, libres);
#   · el edge cambia a blue, se drena, se retira el stack antiguo y los Services de grcup-qa pasan a ExternalName.
# Se niega si ya hay estado (ya migrado) o si el stack antiguo no tiene las IPs de 10.43.240.x.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
. deploy/scripts/lib/imagenes.sh
. deploy/scripts/lib/colores.sh
colores_init "${1:-}"
colores_bloquear
colores_memoria

[ -z "$(colores_estado_leer)" ] || die "ya hay estado en $NS_COMP (ya migrado): usa desplegar-bg.sh"
gw_antigua=$(ssh "$KRAKEN" "sudo k3s kubectl -n $NS_COMP get svc gateway -o jsonpath='{.spec.clusterIP}'")
[ "$gw_antigua" = 10.43.240.10 ] || die "el gateway de $NS_COMP tiene IP $gw_antigua, no 10.43.240.10: revisa antes de migrar"
ssh "$KRAKEN" "systemctl is-active --quiet nginx" || die "nginx de kraken no está activo bajo systemd"

VERSION=$(version_build)
log "migración a colores · versión $VERSION"
# shellcheck disable=SC2086
mapfile -t IMAGENES < <(construir_imagenes "$VERSION" $KUST_IMAGENES)
importar_imagenes "${IMAGENES[@]}"

log "1/6 nginx: vhost sin upstreams en línea y upstream con las IPs antiguas (sin cambio de tráfico)"
if ssh "$KRAKEN" "test -e /etc/nginx/conf.d/grcup-qa-upstream.conf"; then
  log "1/6 nginx ya migrado (upstream presente): se omite"
else
  deploy/scripts/nginx-qa.sh 10.43.240.10 10.43.240.11 10.43.240.12 10.43.240.13
fi

log "2/6 capa compartida"
colores_compartido "$VERSION"

log "3/6 color blue en ${NS[blue]} (sus Services con las IPs 10.43.238.x)"
colores_aplicar colores/qa/blue "$VERSION"
colores_secretos "${NS[blue]}"
colores_encender blue
colores_esperar "${NS[blue]}"
colores_puertas blue
colores_holgura

log "4/6 edge → blue (las IPs nuevas ya responden)"
if ! colores_upstream blue || ! colores_borde; then
  log "el borde no responde con blue: vuelvo al stack antiguo"
  colores_upstream legado || true
  die "migración parada: el stack antiguo sigue sirviendo"
fi

log "5/6 drenaje ${DRAIN_SECONDS}s y retirada del stack antiguo (sus sin estado)"
sleep "$DRAIN_SECONDS"
colores_borrar_legado
colores_crear_enlaces blue

colores_estado_escribir blue ""
colores_borde
log "6/6 ✓ vivo=blue. Comprueba: deploy/scripts/estado-bg.sh qa"
