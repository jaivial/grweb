#!/usr/bin/env bash
# desplegar-bg.sh <qa> — blue/green de QA en kraken (desde platform/):
#   1. imágenes: build y importación en kraken (sin registry); el color VIVO no se toca;
#   2. capa compartida (grcup-qa) y color INACTIVO: apply, Secrets, réplicas y rollouts. Las migraciones corren en el
#      arranque de los pods (goose, con su advisory lock): solo expand, ver platform/deploy/k8s/colores/README.md;
#   3. puertas del inactivo en el clúster (gateway, rutas calientes, SSR, backoffice) y holgura de Postgres;
#   4. conmutación: upstream de nginx + ExternalName de la capa compartida; borde público con --resolve;
#   5. drenaje DRAIN_SECONDS y apagado del color anterior (sus objetos se conservan: rollback-bg.sh).
# Si algo falla antes de conmutar, se apaga lo nuevo y el vivo no se toca. Log: a stdout con hora.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
. deploy/scripts/lib/imagenes.sh
. deploy/scripts/lib/colores.sh
colores_init "${1:-}"
colores_bloquear
colores_memoria

read -r VIVO PREVIO < <(colores_estado_leer) || true
[ -n "${VIVO:-}" ] || die "sin estado en $NS_COMP: ejecuta deploy/scripts/instalar-bg.sh $ENTORNO primero"
IDLE=$(otro "$VIVO")
VERSION=$(version_build)
SWITCHED=0
trap 'rc=$?; colores_liberar; if [ "$rc" -ne 0 ] && [ "$SWITCHED" -eq 0 ]; then log "fallo antes de conmutar: apago $IDLE, $VIVO sigue vivo"; colores_apagar "$IDLE" || true; fi; exit "$rc"' EXIT

log "vivo=$VIVO · inactivo=$IDLE · versión $VERSION"
# shellcheck disable=SC2086
mapfile -t IMAGENES < <(construir_imagenes "$VERSION" $KUST_IMAGENES)
importar_imagenes "${IMAGENES[@]}"

colores_compartido "$VERSION"
colores_aplicar "colores/qa/$IDLE" "$VERSION" "${NS[$IDLE]}"
colores_secretos "${NS[$IDLE]}"
colores_holgura_pods "$IDLE"
colores_encender "$IDLE"
colores_esperar "${NS[$IDLE]}"
colores_puertas "$IDLE"
colores_holgura

if ! colores_conmutar "$IDLE" || ! colores_borde; then
  log "el borde no responde con $IDLE: vuelvo a $VIVO"
  colores_conmutar "$VIVO" || log "revisa el borde a mano: nginx y los ExternalName quedaron sin volver"
  exit 1
fi
SWITCHED=1
colores_estado_escribir "$IDLE" "$VIVO"
log "conmutado: vivo=$IDLE · drenaje ${DRAIN_SECONDS}s antes de apagar $VIVO"
sleep "$DRAIN_SECONDS"
colores_apagar "$VIVO"
colores_borde || log "⚠ el borde no responde tras apagar $VIVO: revisar"
log "✓ vivo=$IDLE · $VIVO apagado (rollback-bg.sh qa lo vuelve a encender)"
