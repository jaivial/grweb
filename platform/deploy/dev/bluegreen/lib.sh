#!/usr/bin/env bash
# Funciones comunes de blue/green (grcup dev en jaime-desktop). Se cargan con: . "$(dirname "$0")/lib.sh"
#
# Dos colores (blue, green) con los mismos nombres de servicio: proyecto compose grcup-<color>, unidad SSR
# grcup-dev-web@<color>, puertos fijos por color. Lo vivo lo dice ~/grcup-dev/bluegreen.state (WEB= y API=,
# independientes para --solo-web / --solo-servicios). Infra (Postgres, Redis, Mailpit, evo-weai) = grcup-infra.

BG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_REPO="${MAIN_REPO:-/home/jaime/projects/grweb}"
DEPLOY_SRC="${DEPLOY_SRC:-$MAIN_REPO/.worktrees/deploy-bg}"
LOCAL_DIR="${GRCUP_LOCAL_DIR:-$HOME/grcup-dev}"
STATE_FILE="$LOCAL_DIR/bluegreen.state"
LOCK_FILE="$LOCAL_DIR/bluegreen.lock"
UNIT_DIR="$HOME/.config/systemd/user"
NGINX_DIR=/etc/nginx/conf.d
SNIPPET_DIR=/etc/nginx/grcup-dev
UPSTREAM_CONF=$NGINX_DIR/grcup-dev-upstream.conf
BO_ROOT=/srv/grcup-dev
PUBLIC_HOST=grcup-qa.menustudioai.com
DRAIN_SECONDS="${DRAIN_SECONDS:-60}"

declare -A PORT_GW=([blue]=18300 [green]=18310)
declare -A PORT_CHAT=([blue]=18302 [green]=18312)
declare -A PORT_CHAT_LOAD=([blue]=18301 [green]=18311)
declare -A PORT_WEB=([blue]=4200 [green]=4201)
SSR_API_PORT=18399

# Rutas del compose y versión de la fuente desplegada (las fija checkout_src; por defecto, el HEAD de DEPLOY_SRC).
if [ -e "$DEPLOY_SRC/.git" ]; then
  SRC_SHORT=$(git -C "$DEPLOY_SRC" rev-parse --short=12 HEAD)
  APP_YML="$DEPLOY_SRC/platform/deploy/dev/bluegreen/app.yml"
  INFRA_YML="$DEPLOY_SRC/platform/deploy/dev/bluegreen/infra.yml"
fi

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { log "ABORT: $*"; exit 1; }
valid_color() { [ "$1" = blue ] || [ "$1" = green ] || die "color desconocido: $1"; }
other() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }

take_lock() {
  mkdir -p "$LOCAL_DIR"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "otro despliegue/rollback blue/green está en marcha (lock $LOCK_FILE)"
}

check_memory() {
  local avail
  avail=$(free -g | awk '/^Mem:/{print $7}')
  [ "$avail" -ge 8 ] || die "solo ${avail} GB disponibles (mínimo 8): para y revisa antes de compilar"
}

state_get() {
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^$1=//p" "$STATE_FILE" | tail -n1
}

state_set() {
  mkdir -p "$LOCAL_DIR"
  touch "$STATE_FILE"
  { grep -v "^$1=" "$STATE_FILE" || true; printf '%s=%s\n' "$1" "$2"; } > "$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"
}

live_web() { state_get WEB; }
live_api() { state_get API; }

# Código de la petición (000 si no conecta). No falla nunca: lo decide quien llama.
http_code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@" 2>/dev/null || true; }

wait_until() { # <segundos> <descripción> <comando...>
  local secs=$1 what=$2
  shift 2
  local end=$((SECONDS + secs))
  until "$@"; do
    if [ "$SECONDS" -ge "$end" ]; then
      log "FALLA: $what"
      return 1
    fi
    sleep 2
  done
  log "ok: $what"
}

ok_gateway() { [ "$(http_code "http://127.0.0.1:${PORT_GW[$1]}/healthz")" = 204 ]; }
ok_api() { [ "$(http_code "http://127.0.0.1:${PORT_GW[$1]}/api/competiciones/grcup")" = 200 ]; }
ok_ssr() { [ "$(http_code -H "Host: $PUBLIC_HOST" "http://127.0.0.1:${PORT_WEB[$1]}/")" = 200 ]; }
ok_edge() {
  [ "$(http_code "https://$PUBLIC_HOST/")" = 200 ] && [ "$(http_code "https://$PUBLIC_HOST/api/competiciones/grcup")" = 200 ]
}

gate_api() { # gateway del color: /healthz 204 y una llamada real a la API 200
  wait_until 150 "gateway $1 /healthz" ok_gateway "$1" || return 1
  wait_until 60 "gateway $1 /api/competiciones/grcup" ok_api "$1" || return 1
}

gate_web() { wait_until 90 "SSR $1 GET / (Host $PUBLIC_HOST)" ok_ssr "$1" || return 1; }

load_minimax() { # el servicio ai lee su clave del shell (igual que el compose dev antiguo)
  local line
  while IFS= read -r line; do export "$line"; done < <(grep -E '^MINIMAX_TOKEN_PLAN_(API_KEY|BASE_URL)=' "$HOME/.env" 2>/dev/null || true)
}

# Fuente: el repo de la rama de despliegue (worktree desacoplado) en el ref pedido.
checkout_src() { # <ref> → SRC_SHA, SRC_SHORT, APP_YML, INFRA_YML
  SRC_SHA=$(git -C "$MAIN_REPO" rev-parse --verify --quiet "$1^{commit}") || die "ref no existe: $1"
  if [ ! -e "$DEPLOY_SRC/.git" ]; then
    git -C "$MAIN_REPO" worktree add --detach "$DEPLOY_SRC" "$SRC_SHA" >/dev/null || die "no se pudo crear $DEPLOY_SRC"
  fi
  [ -z "$(git -C "$DEPLOY_SRC" status --porcelain)" ] || die "$DEPLOY_SRC tiene cambios sin commit: revísalo"
  git -C "$DEPLOY_SRC" checkout -q --detach "$SRC_SHA"
  SRC_SHORT=$(git -C "$DEPLOY_SRC" rev-parse --short=12 HEAD)
  APP_YML="$DEPLOY_SRC/platform/deploy/dev/bluegreen/app.yml"
  INFRA_YML="$DEPLOY_SRC/platform/deploy/dev/bluegreen/infra.yml"
  log "fuente: $1 → $SRC_SHORT"
}

compose_app() { # <color> <args de compose...>
  local c=$1
  shift
  valid_color "$c"
  load_minimax
  COLOR=$c GATEWAY_PORT=${PORT_GW[$c]} CHAT_PORT=${PORT_CHAT[$c]} CHAT_LOAD_PORT=${PORT_CHAT_LOAD[$c]} \
    VERSION=$SRC_SHORT GRCUP_LOCAL_ENV=$LOCAL_DIR \
    docker compose -p "grcup-$c" -f "$APP_YML" "$@"
}

compose_infra() { # <args de compose...>  (nunca `down -v`: los volúmenes son external)
  docker compose -p grcup-infra -f "$INFRA_YML" "$@"
}

ensure_node_modules() {
  (cd "$DEPLOY_SRC/platform/web" && cgrun -m 4G -n bg-pnpm -- pnpm install --frozen-lockfile --prefer-offline >/dev/null) \
    || die "pnpm install en $DEPLOY_SRC/platform/web"
}

build_web() { # <color>: dist en ~/grcup-dev/public-dist-<color>; el dist vivo no se toca hasta que está listo
  local c=$1 out="$LOCAL_DIR/public-dist-$1" tmp="/tmp/opencode/bg-public-$SRC_SHORT"
  valid_color "$c"
  mkdir -p /tmp/opencode
  ensure_node_modules
  rm -rf "$tmp"
  (cd "$DEPLOY_SRC/platform/web" && cgrun -m 8G -n bg-web -- npx ng build public --output-path "$tmp") || die "ng build public"
  [ -s "$tmp/server/server.mjs" ] || die "el build no trae server/server.mjs"
  rm -rf "$out.new"
  mv "$tmp" "$out.new"
  rm -rf "$out"
  mv "$out.new" "$out"
  log "SSR $c construido en $out"
}

ssr_start() { # <color>: escribe su puerto, arranca la unidad (el dist ya está en public-dist-<color>)
  valid_color "$1"
  mkdir -p "$LOCAL_DIR/ssr"
  printf 'PORT=%s\n' "${PORT_WEB[$1]}" > "$LOCAL_DIR/ssr/$1.env"
  systemctl --user daemon-reload
  systemctl --user enable "grcup-dev-web@$1.service" >/dev/null 2>&1 || true
  systemctl --user restart "grcup-dev-web@$1.service"
}

ssr_stop() { systemctl --user stop "grcup-dev-web@$1.service" >/dev/null 2>&1 || true; }

render_upstream() { # <color-web> <color-api> → ruta de un fichero temporal con el upstream
  local f
  f=$(mktemp)
  sed -e "s/@WEB_PORT@/${PORT_WEB[$1]}/" -e "s/@API_PORT@/${PORT_GW[$2]}/" "$BG_DIR/nginx/grcup-dev-upstream.conf.tmpl" > "$f"
  printf '%s\n' "$f"
}

# Pone las puertas en estos colores: valida con nginx -t y recarga. Si algo falla, deja el upstream anterior.
nginx_apply() { # <web> <api>
  local new prev
  new=$(render_upstream "$1" "$2")
  prev=$(mktemp)
  sudo cat "$UPSTREAM_CONF" > "$prev" 2>/dev/null || : > "$prev"
  sudo install -m 644 "$new" "$UPSTREAM_CONF"
  rm -f "$new"
  if ! sudo nginx -t >/dev/null 2>&1; then
    sudo install -m 644 "$prev" "$UPSTREAM_CONF"
    rm -f "$prev"
    log "nginx -t rechaza web=$1 api=$2: upstream anterior restaurado"
    return 1
  fi
  if ! sudo nginx -s reload; then
    sudo install -m 644 "$prev" "$UPSTREAM_CONF"
    sudo nginx -s reload || true
    rm -f "$prev"
    log "nginx no recargó: upstream anterior restaurado"
    return 1
  fi
  # nginx -s reload devuelve 0 aunque el master rechace la config nueva (y siga con la anterior): se comprueba el efecto.
  sleep 1
  if ! ss -ltn | grep -q "127.0.0.1:${SSR_API_PORT} "; then
    sudo install -m 644 "$prev" "$UPSTREAM_CONF"
    sudo nginx -s reload || true
    rm -f "$prev"
    log "nginx no cargó la config nueva (sin listener ${SSR_API_PORT}): upstream anterior restaurado"
    return 1
  fi
  rm -f "$prev"
  log "nginx: web=$1 (:${PORT_WEB[$1]}) api=$2 (:${PORT_GW[$2]})"
}

# Liberar el color que deja de ser vivo: solo tras el drenaje (clientes SSE/WS reconectan con Last-Event-ID).
drain_and_stop() { # <web-anterior|""> <api-anterior|"">
  log "drenaje ${DRAIN_SECONDS}s antes de parar el color anterior"
  sleep "$DRAIN_SECONDS"
  if [ -n "$1" ]; then
    ssr_stop "$1"
    log "SSR $1 parado (puerto ${PORT_WEB[$1]} libre)"
  fi
  if [ -n "$2" ]; then
    compose_app "$2" stop
    log "stack grcup-$2 parado (puerto ${PORT_GW[$2]} libre; volúmenes intactos)"
  fi
}

bo_build() { # → /srv/grcup-dev/backoffice-releases/<sha>-<hora>; devuelve su nombre. No conmuta nada.
  local name tmp="/tmp/opencode/bg-bo-$SRC_SHORT"
  name="$SRC_SHORT-$(date +%H%M%S)"
  mkdir -p /tmp/opencode "$BO_ROOT/backoffice-releases"
  ensure_node_modules
  rm -rf "$tmp"
  (cd "$DEPLOY_SRC/platform/web" && cgrun -m 8G -n bg-bo -- npx ng build backoffice --output-path "$tmp") >&2 || die "ng build backoffice"
  [ -s "$tmp/browser/index.html" ] || die "el build de backoffice no trae browser/index.html"
  mv "$tmp/browser" "$BO_ROOT/backoffice-releases/$name"
  rm -rf "$tmp"
  restorecon -R "$BO_ROOT/backoffice-releases/$name" 2>/dev/null || sudo -n restorecon -R "$BO_ROOT/backoffice-releases/$name"
  printf '%s\n' "$name"
}

bo_switch() { # <release>: nginx sirve /srv/grcup-dev/backoffice; un rename de symlink lo cambia de golpe
  ln -sfn "$BO_ROOT/backoffice-releases/$1" "$BO_ROOT/.backoffice.next"
  mv -T "$BO_ROOT/.backoffice.next" "$BO_ROOT/backoffice"
  state_set BO "$1"
  log "backoffice → release $1"
}

bo_prune() { # conserva las 3 últimas releases (la viva siempre entra en ellas)
  local live
  live=$(basename "$(readlink -f "$BO_ROOT/backoffice")")
  ls -1t "$BO_ROOT/backoffice-releases" | tail -n +4 | grep -vx "$live" | while read -r r; do
    rm -rf "$BO_ROOT/backoffice-releases/$r"
    log "release de backoffice borrada: $r"
  done || true
}
