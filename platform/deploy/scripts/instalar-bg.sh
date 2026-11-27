#!/usr/bin/env bash
# instalar-bg.sh <qa|prod> [--confirmo-produccion] [--parar-qa] — UNA VEZ: pasa el stack único del namespace compartido
# a blue sin corte (desde platform/).
#   · la capa compartida se queda en NS_COMP (Postgres, Redis-puente, evo-weai, juegos-worker; en QA también Mailpit);
#   · los servicios sin estado se levantan en blue con IPs nuevas (QA 10.43.238.x; prod 10.43.242.x, libres);
#   · el edge pasa a blue (en prod, el vhost pierde sus upstreams en línea en la misma recarga), se drena, se retira el
#     stack antiguo y los Services de NS_COMP pasan a ExternalName.
# Se niega si ya hay estado (ya migrado) o si el stack antiguo no tiene la IP de gateway esperada.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
. deploy/scripts/lib/imagenes.sh
. deploy/scripts/lib/colores.sh
ENTORNO=${1:-}
shift || true
CONFIRMO=0
for a in "$@"; do
  case "$a" in
    --confirmo-produccion) CONFIRMO=1 ;;
    --parar-qa) PARAR_QA=1 ;;
    *) die "opción desconocida: $a" ;;
  esac
done
colores_init "$ENTORNO"
[ "$ENTORNO" = qa ] && [ "$PARAR_QA" = 1 ] && die "--parar-qa solo aplica a producción"
colores_gates_prod
colores_bloquear
colores_memoria

[ -z "$(colores_estado_leer)" ] || die "ya hay estado en $NS_COMP (ya migrado): usa desplegar-bg.sh"
SWITCHED=0
trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$SWITCHED" -eq 0 ]; then log "fallo antes de conmutar: apago blue (sin estado, el legado sigue)"; colores_apagar blue || true; fi; colores_salir; exit "$rc"' EXIT
gw_antigua=$(ssh "$KRAKEN" "sudo k3s kubectl -n $NS_COMP get svc gateway -o jsonpath='{.spec.clusterIP}'")
[ "$gw_antigua" = "${IP_GW[legado]}" ] || die "el gateway de $NS_COMP tiene IP $gw_antigua, no ${IP_GW[legado]}: revisa antes de migrar"
ssh "$KRAKEN" "systemctl is-active --quiet nginx" || die "nginx de kraken no está activo bajo systemd"

VERSION=$(version_build)
log "migración a colores ($ENTORNO) · versión $VERSION"
preparar_imagenes "$VERSION" $KUST_IMAGENES >/dev/null

log "1/6 nginx: upstreams en fichero con las IPs antiguas (sin cambio de tráfico)"
if ssh "$KRAKEN" "test -e $UPSTREAM"; then
  log "1/6 nginx ya migrado (upstream presente): se omite"
elif [ "$ENTORNO" = qa ]; then
  deploy/scripts/nginx-qa.sh "${IP_GW[legado]}" "${IP_WEB[legado]}" "${IP_BO[legado]}" "${IP_CHAT[legado]}"
else
  deploy/scripts/nginx-prod-upstream.sh "${IP_GW[legado]}" "${IP_WEB[legado]}" "${IP_BO[legado]}"
fi

log "2/6 capa compartida"
colores_compartido "$VERSION"

log "3/6 color blue en ${NS[blue]}"
colores_aplicar "$COLORES_DIR/blue" "$VERSION" "${NS[blue]}"
colores_secretos "${NS[blue]}"
colores_holgura_pods blue
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
SWITCHED=1

log "5/6 drenaje ${DRAIN_SECONDS}s y retirada del stack antiguo (sus sin estado)"
sleep "$DRAIN_SECONDS"
colores_borrar_legado
colores_crear_enlaces blue
colores_estado_escribir blue ""
colores_borde
colores_salir
log "6/6 ✓ vivo=blue. Comprueba: deploy/scripts/estado-bg.sh $ENTORNO"
