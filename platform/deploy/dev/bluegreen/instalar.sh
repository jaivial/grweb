#!/usr/bin/env bash
# instalar.sh [ref] — migración ÚNICA del legado grcup-h a grcup-infra + grcup-blue (puertos 18300 / 4200 de siempre).
#
# 1. Sin corte (el legado sigue en marcha): backup de Postgres y de nginx, build de las imágenes de blue, build del
#    SSR y del backoffice.
# 2. Ventana de corte: para el legado, la infra toma los MISMOS volúmenes (external), arranca blue, nginx pasa a blue.
#    Si cualquier paso falla dentro de la ventana, restaurar_legado devuelve el stack antiguo tal cual estaba.
# Nunca `down -v`, nunca se borra un volumen ni el legado (queda parado, no eliminado).
set -Eeuo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REF=${1:-origin/dev}
TS=$(date +%Y%m%d-%H%M%S)
BK="$LOCAL_DIR/backups/bluegreen-$TS"
LEG_COMPOSE="$MAIN_REPO/.worktrees/deploy-dev/platform/deploy/dev/compose.yml"
LEG_OVERRIDE="$LOCAL_DIR/compose.ticketing.override.yml"
LEG_UNIT="$UNIT_DIR/grcup-dev-web.service"
LEG_VOLUMES="grcup-h_pgdata grcup-h_weai-data grcup-h_atletas-data grcup-h_cmsdata"
DOWN=0
MIGRATED=0
BO_LEGACY=""

restaurar_legado() {
  log "RESTAURO el legado (grcup-h) tras el fallo de la migración"
  ssr_stop blue
  compose_app blue stop || true
  compose_infra stop || true
  sudo rm -f "$UPSTREAM_CONF" "$NGINX_DIR/grcup-dev-ssr-api.conf"
  for f in "$BK"/nginx/*.conf; do nginx_put "$f" "$NGINX_DIR/$(basename "$f")"; done
  if [ -n "$BO_LEGACY" ]; then
    rm -f "$BO_ROOT/backoffice"
    mv "$BO_ROOT/backoffice-releases/$BO_LEGACY" "$BO_ROOT/backoffice"
  fi
  nginx_reload_ok || log "nginx no recargó: revisa a mano"
  cp -a "$BK/grcup-dev-web.service" "$LEG_UNIT"
  systemctl --user daemon-reload
  systemctl --user enable grcup-dev-web.service >/dev/null 2>&1 || true
  systemctl --user start grcup-dev-web.service || log "la unidad legado no arrancó"
  docker compose -p grcup-h -f "$LEG_COMPOSE" -f "$LEG_OVERRIDE" up -d --no-build \
    || log "el legado no arrancó: revisa docker compose -p grcup-h"
}

on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$DOWN" -eq 1 ] && [ "$MIGRATED" -eq 0 ]; then
    restaurar_legado
  fi
  exit "$rc"
}
trap on_exit EXIT

take_lock
[ ! -f "$STATE_FILE" ] || die "ya hay estado blue/green en $STATE_FILE: instalar.sh es de una sola vez (usa redeploy.sh)"
check_memory
docker info >/dev/null 2>&1 || die "docker no responde"
for v in $LEG_VOLUMES; do
  docker volume inspect "$v" >/dev/null 2>&1 || die "falta el volumen $v: no se crea nada nuevo aquí"
done
[ -f "$LEG_COMPOSE" ] && [ -f "$LEG_OVERRIDE" ] || die "faltan los compose del legado"
[ -f "$LEG_UNIT" ] || die "falta la unidad legado $LEG_UNIT"
docker inspect -f '{{.State.Running}}' grcup-h-gateway-1 2>/dev/null | grep -qx true || die "el legado no está en marcha: nada que migrar"

log "0/3 preparación (sin corte)"
sudo chown "$(id -u):$(id -g)" "$BO_ROOT"
nginx_prepare
mkdir -p "$BK/nginx" "$BO_ROOT/backoffice-releases"
if command -v semanage >/dev/null 2>&1; then
  sudo semanage fcontext -a -t httpd_sys_content_t "$BO_ROOT(/.*)?" 2>/dev/null \
    || sudo semanage fcontext -m -t httpd_sys_content_t "$BO_ROOT(/.*)?"
  sudo restorecon -R "$BO_ROOT"
fi
sudo cp -a "$NGINX_DIR/grcup-qa-desktop.conf" "$NGINX_DIR/grcup-dev.conf" "$BK/nginx/"
cp -a "$LEG_UNIT" "$BK/grcup-dev-web.service"
docker exec grcup-h-postgres-1 pg_dumpall -U postgres | gzip > "$BK/pg_dumpall.sql.gz"
zcat "$BK/pg_dumpall.sql.gz" | tail -n 5 | grep -q 'PostgreSQL database cluster dump complete' || die "backup de Postgres incompleto"
log "backup: $BK ($(du -h "$BK/pg_dumpall.sql.gz" | cut -f1))"

git -C "$MAIN_REPO" fetch origin --prune -q
checkout_src "$REF"

log "1/3 build sin corte (el legado sigue en marcha)"
cgrun -m 12G -n bg-install-api -- "$BG_DIR/bg-compose.sh" app blue build || die "build de blue"
build_web blue
BO_REL=$(bo_build)

log "2/3 ventana de corte: parar el legado"
T0=$(date +%s)
DOWN=1
systemctl --user stop grcup-dev-web.service || true
systemctl --user disable grcup-dev-web.service >/dev/null 2>&1 || true
docker compose -p grcup-h -f "$LEG_COMPOSE" -f "$LEG_OVERRIDE" stop

compose_infra up -d --wait --wait-timeout 180 || die "infra no está sana"
compose_app blue up -d --no-build || die "blue no arranca"
gate_api blue || die "gateway blue no pasa los gates"

install -m 644 "$BG_DIR/systemd/grcup-dev-web@.service" "$UNIT_DIR/grcup-dev-web@.service"
rm -f "$LEG_UNIT"
sudo install -d -o root -g root -m 755 "$SNIPPET_DIR"
for f in "$BG_DIR"/nginx/snippets/*.inc; do nginx_put "$f" "$SNIPPET_DIR/$(basename "$f")"; done
for f in grcup-dev-ssr-api.conf grcup-qa-desktop.conf grcup-dev.conf; do nginx_put "$BG_DIR/nginx/$f" "$NGINX_DIR/$f"; done

if [ -e "$BO_ROOT/backoffice" ] && [ ! -L "$BO_ROOT/backoffice" ]; then
  BO_LEGACY="legacy-$TS"
  mv "$BO_ROOT/backoffice" "$BO_ROOT/backoffice-releases/$BO_LEGACY"
fi
bo_switch "$BO_REL"

nginx_apply blue blue || die "nginx no aceptó la configuración de blue"
ssr_start blue
gate_web blue || die "el SSR blue no pasa el gate"
wait_until 60 "borde https://$PUBLIC_HOST" ok_edge || die "el borde no responde con blue"

state_set WEB blue
state_set API blue
state_set BO "$BO_REL"
MIGRATED=1
T1=$(date +%s)
log "migración lista: corte medido $((T1 - T0)) s (legado parado: grcup-h-* quedan parados, no borrados)"
bo_prune
"$BG_DIR/estado.sh"
