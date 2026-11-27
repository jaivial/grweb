#!/usr/bin/env bash
# rollback.sh — vuelve cada puerta (web y API) al color contrario al vivo: el anterior al último despliegue.
# Arranca ese color si estaba parado (sin build: usa las imágenes y el dist que ya tenía), pasa sus gates,
# conmuta nginx, drena y para el color que abandona. El backoffice no cambia (ver README).
set -Eeuo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TOUCHED_WEB=""
TOUCHED_API=""
SWITCHED=0
cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$SWITCHED" -eq 0 ]; then
    log "rollback fallido antes de conmutar: el color vivo sigue"
    if [ -n "$TOUCHED_WEB" ]; then ssr_stop "$TOUCHED_WEB"; fi
    if [ -n "$TOUCHED_API" ]; then compose_app "$TOUCHED_API" stop || true; fi
  fi
  exit "$rc"
}
trap cleanup EXIT

take_lock
WEB_LIVE=$(live_web)
API_LIVE=$(live_api)
[ -n "$WEB_LIVE" ] && [ -n "$API_LIVE" ] || die "sin estado: ejecuta instalar.sh primero"
WEB_T=$(other "$WEB_LIVE")
API_T=$(other "$API_LIVE")
log "rollback: web $WEB_LIVE → $WEB_T · api $API_LIVE → $API_T"

TOUCHED_API=$API_T
cgrun -m 12G -n "bg-rollback-api-$API_T" -- "$BG_DIR/bg-compose.sh" app "$API_T" up -d --no-build \
  || die "no arranca grcup-$API_T (¿hay imágenes de su último despliegue?)"
gate_api "$API_T" || die "el gateway $API_T no pasa los gates"

TOUCHED_WEB=$WEB_T
[ -s "$LOCAL_DIR/public-dist-$WEB_T/server/server.mjs" ] || die "no hay SSR anterior en public-dist-$WEB_T"
ssr_start "$WEB_T"
gate_web "$WEB_T" || die "el SSR $WEB_T no pasa el gate"

nginx_apply "$WEB_T" "$API_T" || die "nginx no aceptó el rollback: vivo intacto"
if ! wait_until 30 "borde https://$PUBLIC_HOST tras el rollback" ok_edge; then
  nginx_apply "$WEB_LIVE" "$API_LIVE" || true
  die "el borde no responde con $WEB_T/$API_T: vuelvo a $WEB_LIVE/$API_LIVE"
fi
SWITCHED=1
state_set PREV_WEB "$WEB_LIVE"
state_set PREV_API "$API_LIVE"
state_set WEB "$WEB_T"
state_set API "$API_T"

drain_and_stop "$WEB_LIVE" "$API_LIVE"
wait_until 30 "borde tras parar el color abandonado" ok_edge || die "el borde falla tras el rollback: revisa estado.sh"
log "rollback listo: web=$WEB_T api=$API_T"
