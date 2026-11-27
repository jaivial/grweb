#!/usr/bin/env bash
# Blue/green de k8s (QA en kraken): lo común de desplegar-bg.sh, rollback-bg.sh, estado-bg.sh e instalar-bg.sh.
# Se carga desde platform/ con: . deploy/scripts/lib/colores.sh; luego colores_init <qa>.
#
# Modelo: una capa compartida (namespace NS_COMP = grcup-qa: Postgres, Redis-puente, Mailpit, evo-weai y
# juegos-worker, con estado o singleton) y dos colores (NS[blue], NS[green]) con los servicios sin estado. Dentro de
# un color los nombres son los de siempre (http://identity:8080…). La capa compartida llega a Postgres/Redis/Mailpit/
# evo-weai por Services ExternalName (colores/qa/comun/enlaces.yaml); los servicios que la capa llama (webhook de
# evo-weai → messaging, juegos-worker → competition…) son ExternalName de NS_COMP que apuntan al color VIVO. El edge
# (nginx del host) apunta a las IPs fijas del color vivo. El estado es el ConfigMap grcup-colores de NS_COMP.

KRAKEN="${KRAKEN:-kraken}"
DRAIN_SECONDS="${DRAIN_SECONDS:-60}"
UPSTREAM=/etc/nginx/conf.d/grcup-qa-upstream.conf
UPSTREAM_TPL=deploy/nginx/grcup-qa-upstream.conf.tpl
KUST_IMAGENES="deploy/k8s/colores/qa/comun/kustomization.yaml deploy/k8s/colores/qa/compartido/kustomization.yaml"
# Servicios sin estado: en NS_COMP son ExternalName hacia el color vivo (mismo nombre en cada color). Debe coincidir
# con los Services de colores/qa/blue (menos los de la capa compartida); lo comprueba instalar-bg.sh.
SERVICIOS_COLOR="ai athletes audit backoffice chat chat-ws cms competition crm donaciones fans gateway identity juegos live messaging openlifter patrocinio raffle realtime schedule ticketing web"
# Rutas que el SSR pide en su primera pantalla: deben estar calientes (pools, caché) antes de recibir tráfico.
WARM_PATHS=(/api/competiciones/grcup/web /api/competiciones/grcup/entradas /api/competiciones/grcup/juegos/fantasy/resumen /api/competiciones/grcup/horarios /api/competiciones/grcup/atletas /api/competiciones/grcup/seo)

colores_init() {
  ENTORNO=${1:-}
  case "$ENTORNO" in
    qa)
      NS_COMP=grcup-qa
      declare -gA NS=([blue]=grcup-qa-blue [green]=grcup-qa-green)
      # legado: el stack único anterior de grcup-qa (solo para volver atrás durante instalar-bg.sh).
      declare -gA IP_GW=([blue]=10.43.238.10 [green]=10.43.237.10 [legado]=10.43.240.10)
      declare -gA IP_WEB=([blue]=10.43.238.11 [green]=10.43.237.11 [legado]=10.43.240.11)
      declare -gA IP_BO=([blue]=10.43.238.12 [green]=10.43.237.12 [legado]=10.43.240.12)
      declare -gA IP_CHAT=([blue]=10.43.238.13 [green]=10.43.237.13 [legado]=10.43.240.13)
      PUBLIC_HOST=grcup-qa.menustudioai.com
      EDGE_IP=100.66.235.72
      ;;
    prod) echo "✗ prod sigue en el stack único (deploy/scripts/desplegar.sh prod): aún no está en colores" >&2; exit 2 ;;
    *) echo "uso: $0 <qa>" >&2; exit 2 ;;
  esac
}

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { log "ABORT: $*" >&2; exit 1; }
otro() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }

# Un solo despliegue o rollback a la vez, también desde otra sesión: un flock en kraken que se mantiene mientras
# este proceso vive (el ssh lee de una FIFO; al salir se cierra y el lock remoto se libera).
colores_bloquear() {
  ssh -o BatchMode=yes "$KRAKEN" "flock -n \$HOME/.grcup-colores-$ENTORNO.lock -c 'touch \$HOME/.grcup-colores-$ENTORNO.run; while [ -e \$HOME/.grcup-colores-$ENTORNO.run ]; do sleep 2; done'" >/dev/null 2>&1 &
  local pid=$!
  sleep 3
  kill -0 "$pid" 2>/dev/null || die "otro despliegue o rollback de $ENTORNO está en marcha (lock en kraken)"
  LOCK_PROPIO=1
  trap colores_liberar EXIT
}

# Borra la marca (suelta el flock remoto). Solo si este proceso la creó.
colores_liberar() {
  [ "${LOCK_PROPIO:-0}" = 1 ] || return 0
  ssh "$KRAKEN" "rm -f \$HOME/.grcup-colores-$ENTORNO.run" || true
  LOCK_PROPIO=0
}

colores_memoria() {
  local disp
  disp=$(ssh "$KRAKEN" "free -g | awk '/^Mem:/{print \$7}'")
  [ "$disp" -ge 8 ] || die "kraken: solo ${disp} GB disponibles (mínimo 8): para y revisa"
  log "kraken: ${disp} GB disponibles"
}

# Sube deploy/k8s a kraken y aplica un overlay con el TAG de la versión.
colores_aplicar() { # <overlay relativo a deploy/k8s> <versión>
  local overlay=$1 version=$2
  tar -C deploy/k8s -cf - . | ssh "$KRAKEN" "set -e
tmp=\$(mktemp -d /tmp/grcup-colores.XXXXXX)
tar -C \$tmp -xf -
find \$tmp/colores -name kustomization.yaml -exec sed -i 's/newTag: TAG/newTag: \"$version\"/' {} +
sudo k3s kubectl apply -k \$tmp/$overlay >/dev/null
rm -rf \$tmp"
  log "aplicado $overlay (versión $version)"
}

colores_compartido() { # <versión>: capa compartida (grcup-qa) y su Postgres listo
  colores_aplicar colores/qa/compartido "$1"
  ssh "$KRAKEN" "sudo k3s kubectl -n $NS_COMP rollout status statefulset/postgres --timeout=180s >/dev/null"
}

# Copia los Secrets Opaque de la capa compartida al namespace del color (los pods los montan por nombre).
colores_secretos() { # <namespace destino>
  ssh "$KRAKEN" bash -s -- "$NS_COMP" "$1" <<'SH'
set -euo pipefail
sudo k3s kubectl -n "$1" get secrets -o json | jq -c --arg ns "$2" '{apiVersion:"v1",kind:"List",items:[.items[] | select(.type=="Opaque") | {apiVersion:"v1",kind:"Secret",type:.type,metadata:{name:.metadata.name,namespace:$ns,labels:(.metadata.labels // {})},data:.data}]}' | sudo k3s kubectl apply -f - >/dev/null
echo "secretos copiados a $2"
SH
}

# Pone las réplicas anotadas (grcup.dev/replicas-antes) a cada Deployment del color; 1 si nunca se anotaron.
colores_encender() { # <color>
  ssh "$KRAKEN" bash -s -- "${NS[$1]}" <<'SH'
set -euo pipefail
ns=$1
sudo k3s kubectl -n "$ns" get deploy -o json | jq -r '.items[] | "\(.metadata.name) \(.metadata.annotations["grcup.dev/replicas-antes"] // "1")"' | while read -r d n; do
  sudo k3s kubectl -n "$ns" scale deploy "$d" --replicas="$n" >/dev/null
done
SH
  log "color $1 encendido"
}

# Anota las réplicas de cada Deployment (grcup.dev/replicas-antes) y lo deja en 0. Los objetos se conservan: así
# rollback-bg.sh lo vuelve a encender sin construir nada.
colores_apagar() { # <color>
  ssh "$KRAKEN" bash -s -- "${NS[$1]}" <<'SH'
set -euo pipefail
ns=$1
sudo k3s kubectl -n "$ns" get deploy -o json | jq -r '.items[] | "\(.metadata.name) \(.spec.replicas // 0)"' | while read -r d n; do
  [ "$n" -eq 0 ] || sudo k3s kubectl -n "$ns" annotate deploy "$d" "grcup.dev/replicas-antes=$n" --overwrite >/dev/null
  sudo k3s kubectl -n "$ns" scale deploy "$d" --replicas=0 >/dev/null
done
SH
  log "color $1 apagado (objetos conservados)"
}

colores_esperar() { # <namespace>: rollout de cada Deployment y de los Jobs (seeds, bootstrap)
  ssh "$KRAKEN" bash -s -- "$1" <<'SH'
set -euo pipefail
ns=$1
for d in $(sudo k3s kubectl -n "$ns" get deploy -o name); do sudo k3s kubectl -n "$ns" rollout status "$d" --timeout=300s; done
if [ -n "$(sudo k3s kubectl -n "$ns" get jobs -o name)" ]; then sudo k3s kubectl -n "$ns" wait --for=condition=complete job --all --timeout=300s; fi
SH
  log "rollouts y jobs de $1 listos"
}

# Puertas del color en el clúster (por su ClusterIP, antes de tocar el edge).
colores_puertas() { # <color>
  local c=$1
  ssh "$KRAKEN" bash -s -- "${IP_GW[$c]}" "${IP_WEB[$c]}" "${IP_BO[$c]}" "$PUBLIC_HOST" "${WARM_PATHS[@]}" <<'SH'
set -uo pipefail
gw=$1 web=$2 bo=$3 host=$4
shift 4
code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@" 2>/dev/null || true; }
espera() { # <segundos> <descripción> <comando...>
  local fin=$((SECONDS + $1)) desc=$2
  shift 2
  until "$@"; do
    [ "$SECONDS" -lt "$fin" ] || { echo "FALLA: $desc"; return 1; }
    sleep 2
  done
  echo "ok: $desc"
}
api() { [ "$(code "http://$gw:8080/api/competiciones/grcup")" = 200 ]; }
calientes() { local p; for p in "$@"; do [ "$(code "http://$gw:8080$p")" = 200 ] || return 1; done; }
ssr() { [ "$(code -H "Host: $host" "http://$web:80/")" = 200 ]; }
bo_ok() { [ "$(code "http://$bo:80/")" = 200 ]; }
espera 150 "gateway /api/competiciones/grcup" api || exit 1
espera 90 "rutas calientes ($#)" calientes "$@" || exit 1
espera 90 "SSR GET / (Host $host)" ssr || exit 1
espera 60 "backoffice GET /" bo_ok || exit 1
SH
  log "puertas de $1 superadas"
}

# Postgres: conexiones libres para un color más (~150 = ~30 pods × DB_POOL 5).
colores_holgura() {
  ssh "$KRAKEN" bash -s -- "$NS_COMP" <<'SH'
set -euo pipefail
used=$(sudo k3s kubectl -n "$1" exec statefulset/postgres -- psql -U postgres -tAc 'select count(*) from pg_stat_activity')
max=$(sudo k3s kubectl -n "$1" exec statefulset/postgres -- psql -U postgres -tAc 'show max_connections')
echo "postgres: $used de $max conexiones en uso"
[ $((used + 150)) -lt "$max" ] || { echo "postgres sin holgura para un color más (hacen falta ~150)" >&2; exit 1; }
SH
}

# Edge: nginx apunta a las IPs del color y se recarga; si nginx rechaza la config, vuelve la anterior.
colores_upstream() { # <color>
  local c=$1 previo
  previo=$(ssh "$KRAKEN" "sudo cat $UPSTREAM 2>/dev/null" || true)
  if ! sed -e "s/@GW@/${IP_GW[$c]}/" -e "s/@WEB@/${IP_WEB[$c]}/" -e "s/@BO@/${IP_BO[$c]}/" -e "s/@CHAT@/${IP_CHAT[$c]}/" "$UPSTREAM_TPL" \
    | ssh "$KRAKEN" "sudo tee $UPSTREAM.nuevo >/dev/null && sudo mv $UPSTREAM.nuevo $UPSTREAM && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx"; then
    log "nginx rechaza $c: restauro el upstream anterior"
    if [ -n "$previo" ]; then
      printf '%s\n' "$previo" | ssh "$KRAKEN" "sudo tee $UPSTREAM >/dev/null && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx"
    fi
    return 1
  fi
  log "nginx: upstream → $c (gateway ${IP_GW[$c]}, web ${IP_WEB[$c]}, bo ${IP_BO[$c]}, chat ${IP_CHAT[$c]})"
}

# Capa compartida: los ExternalName de NS_COMP apuntan al color (webhooks de evo-weai, juegos-worker).
colores_enlaces() { # <color>
  ssh "$KRAKEN" bash -s -- "$NS_COMP" "${NS[$1]}" $SERVICIOS_COLOR <<'SH'
set -euo pipefail
ns=$1 dst=$2
shift 2
for s in "$@"; do
  sudo k3s kubectl -n "$ns" patch svc "$s" -p "{\"spec\":{\"externalName\":\"$s.$dst.svc.cluster.local\"}}" >/dev/null
done
SH
  log "capa compartida: ExternalName → ${NS[$1]}"
}

colores_conmutar() { # <color>: edge + enlaces. Si el edge falla, no se tocan los enlaces.
  colores_upstream "$1" && colores_enlaces "$1"
}

# Borde público desde kraken por el tailnet (--resolve): / y /api/competiciones/grcup deben responder 200.
colores_borde() {
  ssh "$KRAKEN" bash -s -- "$PUBLIC_HOST" "$EDGE_IP" <<'SH'
host=$1 ip=$2
code() { curl -s -o /dev/null -m 10 --resolve "$host:443:$ip" -w '%{http_code}' "$1" 2>/dev/null || true; }
fin=$((SECONDS + 40))
until [ "$(code "https://$host/")" = 200 ] && [ "$(code "https://$host/api/competiciones/grcup")" = 200 ]; do
  [ "$SECONDS" -lt "$fin" ] || { echo "FALLA: https://$host no responde 200"; exit 1; }
  sleep 2
done
echo "ok: https://$host (/ y /api/competiciones/grcup)"
SH
}

colores_estado_leer() { # → "vivo previo" (vacío si no hay estado)
  ssh "$KRAKEN" "sudo k3s kubectl -n $NS_COMP get configmap grcup-colores -o jsonpath='{.data.vivo} {.data.previo}' 2>/dev/null || true"
}

colores_estado_escribir() { # <vivo> <previo>
  ssh "$KRAKEN" "sudo k3s kubectl -n $NS_COMP create configmap grcup-colores --from-literal=vivo=$1 --from-literal=previo=$2 --dry-run=client -o yaml | sudo k3s kubectl apply -f - >/dev/null"
}

# Solo instalar-bg.sh: los Services ExternalName no pueden convivir con los del stack antiguo con el mismo nombre.
colores_borrar_legado() {
  ssh "$KRAKEN" bash -s -- "$NS_COMP" $SERVICIOS_COLOR <<'SH'
set -uo pipefail
ns=$1
shift
for s in "$@"; do
  sudo k3s kubectl -n "$ns" delete "deploy/$s" "svc/$s" "hpa/$s" "pdb/$s" "networkpolicy/allow-$s" "job/$s-seed" --ignore-not-found >/dev/null
done
sudo k3s kubectl -n "$ns" delete networkpolicy/allow-gateway-from-web job/identity-bootstrap --ignore-not-found >/dev/null
SH
  log "stack antiguo de $NS_COMP retirado (los sin estado)"
}

colores_crear_enlaces() { # <color>: solo instalar-bg.sh (después de colores_borrar_legado)
  ssh "$KRAKEN" bash -s -- "$NS_COMP" "${NS[$1]}" $SERVICIOS_COLOR <<'SH'
set -euo pipefail
ns=$1 dst=$2
shift 2
for s in "$@"; do
  printf 'apiVersion: v1\nkind: Service\nmetadata:\n  name: %s\n  namespace: %s\nspec:\n  type: ExternalName\n  externalName: %s.%s.svc.cluster.local\n' "$s" "$ns" "$s" "$dst" | sudo k3s kubectl apply -f - >/dev/null
done
SH
  log "capa compartida: ExternalName creados → ${NS[$1]}"
}
