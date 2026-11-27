#!/usr/bin/env bash
# desplegar-bg.sh <qa|prod> [--confirmo-produccion] [--parar-qa] — blue/green (desde platform/):
#   1. imágenes: build solo de las que faltan en kraken (containerd); el color VIVO no se toca;
#   2. capa compartida y color INACTIVO: apply, Secrets, réplicas y rollouts (fallan a los 90 s sin progreso). Las
#      migraciones corren en el arranque de los pods (goose, con su advisory lock): solo expand, ver colores/README.md;
#   3. pods libres en el nodo (si no caben: se dice y se ofrece --parar-qa), puertas del inactivo en el clúster,
#      holgura de Postgres;
#   4. conmutación: upstream de nginx + ExternalName de la capa compartida; borde público con --resolve;
#   5. drenaje DRAIN_SECONDS y apagado del color anterior (sus objetos se conservan: rollback-bg.sh).
# Producción exige --confirmo-produccion y los gates de desplegar.sh prod. --parar-qa escala QA a 0 durante la
# ventana y lo restaura al final (también si falla). Si algo falla antes de conmutar, se apaga lo nuevo.
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

read -r VIVO PREVIO < <(colores_estado_leer) || true
[ -n "${VIVO:-}" ] || die "sin estado en $NS_COMP: ejecuta deploy/scripts/instalar-bg.sh $ENTORNO primero"
IDLE=$(otro "$VIVO")
VERSION=$(version_build)
SWITCHED=0
trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$SWITCHED" -eq 0 ]; then log "fallo antes de conmutar: apago $IDLE, $VIVO sigue vivo"; colores_apagar "$IDLE" || true; fi; colores_salir; exit "$rc"' EXIT

log "vivo=$VIVO · inactivo=$IDLE · versión $VERSION"
preparar_imagenes "$VERSION" $KUST_IMAGENES >/dev/null
colores_compartido "$VERSION"
colores_aplicar "$COLORES_DIR/$IDLE" "$VERSION" "${NS[$IDLE]}"
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
log "✓ vivo=$IDLE · $VIVO apagado (rollback-bg.sh $ENTORNO lo vuelve a encender)"
