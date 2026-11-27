#!/usr/bin/env bash
# redeploy.sh [--solo-web | --solo-servicios | --solo-backoffice] [ref]
#
# Despliega <ref> (por defecto origin/dev) en el color INACTIVO, lo prueba con sus gates, conmuta nginx, drena
# DRAIN_SECONDS y para el color anterior. Si algo falla antes de conmutar, el color vivo no se toca.
#   (sin flag)         API + web + backoffice
#   --solo-web         SSR (puerta web); la API no cambia
#   --solo-servicios   gateway y servicios (puerta API); el SSR no cambia
#   --solo-backoffice  solo la release estática del backoffice (no hay color)
# Log: a stdout con hora; guárdalo con `redeploy.sh … | tee /tmp/opencode/redeploy-<n>.log`.
set -Eeuo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SCOPE=all
REF=origin/dev
while [ $# -gt 0 ]; do
  case "$1" in
    --solo-web) SCOPE=web ;;
    --solo-servicios) SCOPE=api ;;
    --solo-backoffice) SCOPE=backoffice ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    -*) die "opción desconocida: $1" ;;
    *) REF=$1 ;;
  esac
  shift
done

TOUCHED_WEB=""
TOUCHED_API=""
SWITCHED=0
cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$SWITCHED" -eq 0 ]; then
    log "fallo antes de conmutar: paro lo nuevo, el color vivo sigue"
    if [ -n "$TOUCHED_WEB" ]; then ssr_stop "$TOUCHED_WEB"; fi
    if [ -n "$TOUCHED_API" ]; then compose_app "$TOUCHED_API" stop || true; fi
  fi
  exit "$rc"
}
trap cleanup EXIT

take_lock
refuse_if_legacy_running
check_memory
checkout_src "$REF"

WEB_LIVE=$(live_web)
API_LIVE=$(live_api)
[ -n "$WEB_LIVE" ] && [ -n "$API_LIVE" ] || die "sin estado: ejecuta instalar.sh primero"
WEB_NEW=$WEB_LIVE
API_NEW=$API_LIVE
WEB_IDLE=$(other "$WEB_LIVE")
API_IDLE=$(other "$API_LIVE")
log "vivo: web=$WEB_LIVE api=$API_LIVE · alcance=$SCOPE · fuente=$SRC_SHORT"

BO_REL=""
if [ "$SCOPE" = all ] || [ "$SCOPE" = backoffice ]; then
  BO_REL=$(bo_build)
fi

if [ "$SCOPE" = all ] || [ "$SCOPE" = api ]; then
  API_NEW=$API_IDLE
  TOUCHED_API=$API_IDLE
  log "API: compose up del color inactivo $API_IDLE (build de las imágenes)"
  pg_headroom_or_die
  cgrun -m 12G -n "bg-api-$API_IDLE" -- "$BG_DIR/bg-compose.sh" app "$API_IDLE" up -d --build \
    || die "compose up grcup-$API_IDLE"
  gate_api "$API_IDLE" || die "el gateway $API_IDLE no pasa los gates"
fi

if [ "$SCOPE" = all ] || [ "$SCOPE" = web ]; then
  WEB_NEW=$WEB_IDLE
  TOUCHED_WEB=$WEB_IDLE
  build_web "$WEB_IDLE"
  ssr_start "$WEB_IDLE"
  gate_web "$WEB_IDLE" || die "el SSR $WEB_IDLE no pasa el gate"
fi

if [ "$SCOPE" != backoffice ]; then
  nginx_apply "$WEB_NEW" "$API_NEW" || die "nginx no aceptó la conmutación: vivo intacto"
  if ! wait_until 30 "borde https://$PUBLIC_HOST con web=$WEB_NEW api=$API_NEW" ok_edge; then
    nginx_apply "$WEB_LIVE" "$API_LIVE" || true
    die "el borde no responde con el color nuevo: vuelvo a web=$WEB_LIVE api=$API_LIVE"
  fi
  SWITCHED=1
  state_set PREV_WEB "$WEB_LIVE"
  state_set PREV_API "$API_LIVE"
  state_set WEB "$WEB_NEW"
  state_set API "$API_NEW"
  log "conmutado: web=$WEB_NEW api=$API_NEW"
fi

if [ -n "$BO_REL" ]; then
  bo_switch "$BO_REL"
  bo_prune
fi

OLD_WEB=""
OLD_API=""
if [ "$WEB_NEW" != "$WEB_LIVE" ]; then OLD_WEB=$WEB_LIVE; fi
if [ "$API_NEW" != "$API_LIVE" ]; then OLD_API=$API_LIVE; fi
if [ -n "$OLD_WEB" ] || [ -n "$OLD_API" ]; then
  drain_and_stop "$OLD_WEB" "$OLD_API"
  wait_until 30 "borde tras parar el color anterior" ok_edge || die "el borde falla sin el color anterior: ejecuta rollback.sh"
fi

log "listo: web=$(live_web) api=$(live_api) backoffice=$(state_get BO)"
