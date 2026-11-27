#!/usr/bin/env bash
# rollback-bg.sh <qa|prod> [--confirmo-produccion] [--parar-qa] — vuelve al color anterior (estado previo) sin construir:
# lo enciende con sus réplicas (grcup.dev/replicas-antes), pasa las mismas puertas, conmuta el edge y los enlaces,
# drena y apaga el color que se abandona. Desde platform/.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
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
[ -n "${PREVIO:-}" ] || die "no hay color anterior en el estado: nada a lo que volver"
[ "$PREVIO" != "$VIVO" ] || die "el previo es el vivo ($VIVO): revisa el estado"
log "vivo=$VIVO · vuelvo a $PREVIO · drenaje ${DRAIN_SECONDS}s antes de apagar $VIVO"

colores_holgura_pods "$PREVIO"
colores_encender "$PREVIO"
colores_esperar "${NS[$PREVIO]}"
colores_puertas "$PREVIO"
colores_holgura

if ! colores_conmutar "$PREVIO" || ! colores_borde; then
  log "el borde no responde con $PREVIO: vuelvo a $VIVO"
  colores_conmutar "$VIVO" || log "revisa el borde a mano"
  exit 1
fi
colores_estado_escribir "$PREVIO" "$VIVO"
sleep "$DRAIN_SECONDS"
colores_apagar "$VIVO"
colores_borde || log "⚠ el borde no responde tras apagar $VIVO: revisar"
colores_salir
log "✓ rollback: vivo=$PREVIO · $VIVO apagado"
