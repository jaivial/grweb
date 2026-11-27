#!/usr/bin/env bash
# rollback-bg.sh <qa> — vuelve al color anterior (estado previo) sin construir nada: lo enciende con las réplicas que
# tenía (grcup.dev/replicas-antes), pasa las mismas puertas, conmuta el edge y los enlaces, drena y apaga el color
# que se abandona. Solo sirve hacia atrás de un solo paso (el previo es el último color apagado). Desde platform/.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
. deploy/scripts/lib/colores.sh
colores_init "${1:-}"
colores_bloquear
colores_memoria

read -r VIVO PREVIO < <(colores_estado_leer) || true
[ -n "${VIVO:-}" ] || die "sin estado en $NS_COMP: ejecuta deploy/scripts/instalar-bg.sh $ENTORNO primero"
[ -n "${PREVIO:-}" ] || die "no hay color anterior en el estado: nada a lo que volver"
[ "$PREVIO" != "$VIVO" ] || die "el previo es el vivo ($VIVO): revisa el estado"
log "vivo=$VIVO · vuelvo a $PREVIO · drenaje ${DRAIN_SECONDS}s antes de apagar $VIVO"

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
log "✓ rollback: vivo=$PREVIO · $VIVO apagado"
