#!/usr/bin/env bash
# Blue/green de k8s (QA en kraken y producción): lo común de desplegar-bg.sh, rollback-bg.sh, estado-bg.sh e
# instalar-bg.sh. Se carga desde platform/ con: . deploy/scripts/lib/colores.sh; luego colores_init <qa|prod>.
#
# Modelo: una capa compartida (namespace NS_COMP: Postgres, Redis-puente, evo-weai, juegos-worker y, en QA, Mailpit;
# con estado o singleton) y dos colores (NS[blue], NS[green]) con los servicios sin estado. Dentro de un color los
# nombres son los de siempre (http://identity:8080…). La capa compartida llega a Postgres/Redis/evo-weai por Services
# ExternalName (colores/<env>/comun/enlaces.yaml); los servicios que la capa llama (juegos-worker → competition…) son
# ExternalName de NS_COMP que apuntan al color VIVO. El edge (nginx del host) apunta a las IPs fijas del color vivo.
# El estado es el ConfigMap grcup-colores de NS_COMP. En producción, el webhook de evo-weai es la URL pública (el edge),
# así que no apunta a ningún color.

KRAKEN="${KRAKEN:-kraken}"
DRAIN_SECONDS="${DRAIN_SECONDS:-60}"
PARAR_QA="${PARAR_QA:-0}"
QA_PAUSADO=0
LOCK_PROPIO=0
# Servicios sin estado (la lista de los Services ExternalName y de la limpieza del legado): en NS_COMP son
# ExternalName hacia el color vivo, con el mismo nombre en cada color.
SERVICIOS_BASE="ai athletes audit backoffice cms competition crm donaciones fans gateway identity juegos live messaging openlifter patrocinio raffle realtime schedule ticketing web"
# Rutas que el SSR pide en su primera pantalla: deben estar calientes (pools, caché) antes de recibir tráfico.
WARM_PATHS=(/api/competiciones/grcup/web /api/competiciones/grcup/entradas /api/competiciones/grcup/juegos/fantasy/resumen /api/competiciones/grcup/horarios /api/competiciones/grcup/atletas /api/competiciones/grcup/seo)
# Secrets que la capa compartida debe tener antes de un despliegue de producción (como desplegar.sh prod).
SECRETOS_PROD="grcup-db grcup-redis grcup-internal grcup-crypto grcup-root grcup-jwt grcup-weai grcup-ssr"

colores_init() {
  ENTORNO=${1:-}
  case "$ENTORNO" in
    qa)
      NS_COMP=grcup-qa
      declare -gA NS=([blue]=grcup-qa-blue [green]=grcup-qa-green)
      # legado: el stack único anterior (solo para volver atrás durante instalar-bg.sh).
      declare -gA IP_GW=([blue]=10.43.238.10 [green]=10.43.237.10 [legado]=10.43.240.10)
      declare -gA IP_WEB=([blue]=10.43.238.11 [green]=10.43.237.11 [legado]=10.43.240.11)
      declare -gA IP_BO=([blue]=10.43.238.12 [green]=10.43.237.12 [legado]=10.43.240.12)
      declare -gA IP_CHAT=([blue]=10.43.238.13 [green]=10.43.237.13 [legado]=10.43.240.13)
      UP_PLACEHOLDERS=(GW WEB BO CHAT)
      UPSTREAM=/etc/nginx/conf.d/grcup-qa-upstream.conf
      UPSTREAM_TPL=deploy/nginx/grcup-qa-upstream.conf.tpl
      PUBLIC_HOST=grcup-qa.menustudioai.com
      EDGE_IP=100.66.235.72
      SERVICIOS_COLOR="$SERVICIOS_BASE chat chat-ws"
      ;;
    prod)
      NS_COMP=grcup
      declare -gA NS=([blue]=grcup-blue [green]=grcup-green)
      declare -gA IP_GW=([blue]=10.43.242.10 [green]=10.43.241.10 [legado]=10.43.241.10)
      declare -gA IP_WEB=([blue]=10.43.242.11 [green]=10.43.241.11 [legado]=10.43.241.11)
      declare -gA IP_BO=([blue]=10.43.242.12 [green]=10.43.241.12 [legado]=10.43.241.12)
      UP_PLACEHOLDERS=(GW WEB BO)
      UPSTREAM=/etc/nginx/conf.d/grcup-prod-upstream.conf
      UPSTREAM_TPL=deploy/nginx/grcup-prod-upstream.conf.tpl
      PUBLIC_HOST=grscup.com
      EDGE_IP=65.109.100.94
      SERVICIOS_COLOR="$SERVICIOS_BASE chat"
      ;;
    *) echo "uso: $0 <qa|prod>" >&2; exit 2 ;;
  esac
  COLORES_DIR=colores/$ENTORNO
  KUST_IMAGENES="deploy/k8s/$COLORES_DIR/comun/kustomization.yaml deploy/k8s/$COLORES_DIR/compartido/kustomization.yaml"
}

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { log "ABORT: $*" >&2; exit 1; }
otro() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }

# Producción: confirmación explícita y gates de configuración (los mismos que desplegar.sh prod).
colores_gates_prod() {
  [ "$ENTORNO" = prod ] || return 0
  [ "${CONFIRMO:-0}" = 1 ] || die "producción necesita --confirmo-produccion (y la aprobación del organizador)"
  grep -qE '^\s*DOMINIOS_CONFIRMADOS: "?si"?' "deploy/k8s/$COLORES_DIR/componentes/prod/config.yaml" \
    || die "los dominios de producción no están confirmados (DOMINIOS_CONFIRMADOS en componentes/prod/config.yaml)"
  local faltan
  faltan=$(ssh "$KRAKEN" "for s in $SECRETOS_PROD; do sudo k3s kubectl -n $NS_COMP get secret \$s >/dev/null 2>&1 || echo \$s; done")
  [ -z "$faltan" ] || die "faltan Secrets en $NS_COMP: $faltan (deploy/scripts/secretos.sh prod)"
  log "producción: confirmada y con sus Secrets"
}

# Un solo despliegue o rollback a la vez, también desde otra sesión: un flock en kraken que se mantiene mientras existe
# el fichero de marca $HOME/.grcup-colores-<entorno>.run (lo crea este proceso y lo borra colores_liberar al salir).
colores_bloquear() {
  ssh -o BatchMode=yes "$KRAKEN" "flock -n \$HOME/.grcup-colores-$ENTORNO.lock -c 'touch \$HOME/.grcup-colores-$ENTORNO.run; while [ -e \$HOME/.grcup-colores-$ENTORNO.run ]; do sleep 2; done'" >/dev/null 2>&1 &
  local pid=$!
  sleep 3
  kill -0 "$pid" 2>/dev/null || die "otro despliegue o rollback de $ENTORNO está en marcha (lock en kraken)"
  LOCK_PROPIO=1
  trap colores_salir EXIT
}

# Al salir: restaura QA si --parar-qa la paró, y suelta el lock remoto (solo si este proceso lo creó).
colores_salir() {
  colores_qa_reanudar || true
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

# Sube deploy/k8s a kraken y aplica un overlay con el TAG de la versión. Con namespace: borra antes sus Jobs (son
# inmutables; los seeds se vuelven a ejecutar, son idempotentes).
colores_aplicar() { # <overlay relativo a deploy/k8s> <versión> [namespace]
  local overlay=$1 version=$2 ns=${3:-}
  tar -C deploy/k8s -cf - . | ssh "$KRAKEN" "set -e
tmp=\$(mktemp -d /tmp/grcup-colores.XXXXXX)
tar -C \$tmp -xf -
find \$tmp/colores -name kustomization.yaml -exec sed -i 's/newTag: TAG/newTag: \"$version\"/' {} +
[ -z \"$ns\" ] || sudo k3s kubectl -n $ns delete job -l app.kubernetes.io/part-of=grcup --ignore-not-found >/dev/null
sudo k3s kubectl apply -k \$tmp/$overlay >/dev/null
rm -rf \$tmp"
  log "aplicado $overlay (versión $version)"
}

colores_compartido() { # <versión>: capa compartida y su Postgres listo
  colores_aplicar "$COLORES_DIR/compartido" "$1" "$NS_COMP"
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

# Escalado por namespace: apagar anota las réplicas (grcup.dev/replicas-antes) y deja 0 (los objetos se conservan);
# encender vuelve a esas réplicas (1 si nunca se anotaron).
escalar_apagar_ns() { # <namespace>
  ssh "$KRAKEN" bash -s -- "$1" <<'SH'
set -euo pipefail
ns=$1
sudo k3s kubectl -n "$ns" get deploy -o json | jq -r '.items[] | "\(.metadata.name) \(.spec.replicas // 0)"' | while read -r d n; do
  [ "$n" -eq 0 ] || sudo k3s kubectl -n "$ns" annotate deploy "$d" "grcup.dev/replicas-antes=$n" --overwrite >/dev/null
  sudo k3s kubectl -n "$ns" scale deploy "$d" --replicas=0 >/dev/null
done
SH
}

escalar_encender_ns() { # <namespace>
  ssh "$KRAKEN" bash -s -- "$1" <<'SH'
set -euo pipefail
ns=$1
sudo k3s kubectl -n "$ns" get deploy -o json | jq -r '.items[] | "\(.metadata.name) \(.metadata.annotations["grcup.dev/replicas-antes"] // "1")"' | while read -r d n; do
  sudo k3s kubectl -n "$ns" scale deploy "$d" --replicas="$n" >/dev/null
done
SH
}

colores_encender() { # <color>
  escalar_encender_ns "${NS[$1]}"
  log "color $1 encendido"
}

colores_apagar() { # <color>
  escalar_apagar_ns "${NS[$1]}"
  log "color $1 apagado (objetos conservados)"
}

# QA cede su sitio en la ventana de producción (--parar-qa): escala a 0 el color vivo de QA y espera a que sus pods se
# vayan; colores_qa_reanudar lo vuelve a encender (también desde la trampa de salida).
colores_qa_pausar() {
  local vivo ns
  vivo=$(ssh "$KRAKEN" "sudo k3s kubectl -n grcup-qa get configmap grcup-colores -o jsonpath='{.data.vivo}' 2>/dev/null || true")
  [ -n "$vivo" ] || { log "QA sin estado: nada que parar"; return 0; }
  QA_NS=grcup-qa-$vivo
  escalar_apagar_ns "$QA_NS"
  QA_PAUSADO=1
  ssh "$KRAKEN" bash -s -- "$QA_NS" <<'SH'
fin=$((SECONDS + 180))
until [ -z "$(sudo k3s kubectl -n "$1" get pods --field-selector status.phase!=Succeeded,status.phase!=Failed -o name)" ]; do
  [ "$SECONDS" -lt "$fin" ] || { echo "QA: pods aún presentes tras 180 s" >&2; exit 1; }
  sleep 3
done
SH
  log "QA parado: $QA_NS a 0 (--parar-qa, se restaura al final)"
}

colores_qa_reanudar() {
  [ "${QA_PAUSADO:-0}" = 1 ] || return 0
  escalar_encender_ns "$QA_NS"
  QA_PAUSADO=0
  log "QA restaurado: $QA_NS"
}

# Pods del nodo (cap de kubelet, 110 en kraken). El color necesita sus réplicas mínimas (HPA minReplicas, o 1) más 5 de
# margen para los surges del rollout. Si no cabe: lo dice y ofrece --parar-qa (salvo que ya se haya parado).
colores_holgura_pods() { # <color>
  local need need_ok
  need=$(kubectl kustomize "deploy/k8s/$COLORES_DIR/$1" 2>/dev/null | python3 -c '
import sys,re
deps=[];mins={}
for d in sys.stdin.read().split("\n---\n"):
    k=re.search(r"^kind: (\S+)",d,re.M); n=re.search(r"^metadata:\n(?:  [^\n]*\n)*?  name: (\S+)",d,re.M)
    if not (k and n): continue
    if k.group(1)=="Deployment": deps.append(n.group(1))
    if k.group(1)=="HorizontalPodAutoscaler":
        m=re.search(r"minReplicas: (\d+)",d); mins[n.group(1)]=int(m.group(1)) if m else 1
print(sum(mins.get(x,1) for x in deps))
') || die "no se pudo calcular la huella de $1 (kubectl kustomize)"
  [ -n "$need" ] || die "huella vacía para $1"
  need_ok=$(ssh "$KRAKEN" bash -s -- "$need" <<'SH' || true
set -euo pipefail
need=$(( $1 + 5 ))
nodo=$(sudo k3s kubectl get node -o jsonpath='{.items[0].metadata.name}')
cap=$(sudo k3s kubectl get node "$nodo" -o jsonpath='{.status.capacity.pods}')
usados=$(sudo k3s kubectl get pods -A --field-selector "spec.nodeName=$nodo,status.phase!=Succeeded,status.phase!=Failed" --no-headers | wc -l)
echo "pods en $nodo: $usados de $cap · el color necesita ~$need (réplicas mínimas + 5)" >&2
if [ $((cap - usados)) -ge "$need" ]; then echo ok; else echo no; fi
SH
)
  if [ "$need_ok" = ok ]; then
    return 0
  fi
  if [ "$ENTORNO" = prod ] && [ "$PARAR_QA" != 1 ] && [ "${QA_PAUSADO:-0}" != 1 ]; then
    die "no caben los pods de $1 en el nodo. Vuelve a lanzar con --parar-qa (QA cede su color vivo durante la ventana y se restaura al final)"
  fi
  if [ "$ENTORNO" = prod ] && [ "$PARAR_QA" = 1 ] && [ "${QA_PAUSADO:-0}" != 1 ]; then
    colores_qa_pausar
    colores_holgura_pods "$1"
    return
  fi
  die "no caben los pods de $1 en el nodo: baja réplicas de QA o sube max-pods de kubelet"
}

# Espera a los rollouts de un namespace. Un Deployment sin progreso (updated/available/spec sin cambios) durante 90 s
# para: imprime sus pods, eventos y logs, y falla ya. Tope total de 600 s por Deployment.
colores_esperar() { # <namespace>
  ssh "$KRAKEN" bash -s -- "$1" <<'SH'
set -uo pipefail
ns=$1
k="sudo k3s kubectl -n $ns"
diagnostico() { # <app>
  echo "--- diagnóstico de $1" >&2
  $k get pods -l "app.kubernetes.io/name=$1" -o wide >&2
  $k describe pod -l "app.kubernetes.io/name=$1" 2>&1 | grep -A14 "^Events:" | tail -40 >&2
  $k logs -l "app.kubernetes.io/name=$1" --all-containers --tail=40 --prefix 2>&1 | tail -60 >&2
}
for d in $($k get deploy -o name); do
  name=${d#deployment.apps/}
  fin=$((SECONDS + 600)); prev=""; cambio=$SECONDS
  until $k rollout status "$d" --timeout=5s >/dev/null 2>&1; do
    estado=$($k get "$d" -o jsonpath='{.status.updatedReplicas}/{.status.availableReplicas}/{.spec.replicas}' 2>/dev/null)
    [ "$estado" = "$prev" ] || { prev=$estado; cambio=$SECONDS; }
    if [ $((SECONDS - cambio)) -ge 90 ] || [ "$SECONDS" -ge "$fin" ]; then
      echo "FALLA: $name sin progreso (updated/available/spec: $estado)"
      diagnostico "$name"
      exit 1
    fi
  done
  echo "ok: $name"
done
if [ -n "$($k get jobs -o name)" ]; then $k wait --for=condition=complete job --all --timeout=300s; fi
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
  local c=$1 previo sed_args=() k
  for k in "${UP_PLACEHOLDERS[@]}"; do
    local -n ip="IP_$k"
    sed_args+=(-e "s/@$k@/${ip[$c]}/")
  done
  previo=$(ssh "$KRAKEN" "sudo cat $UPSTREAM 2>/dev/null" || true)
  if ! sed "${sed_args[@]}" "$UPSTREAM_TPL" \
    | ssh "$KRAKEN" "sudo tee $UPSTREAM.nuevo >/dev/null && sudo mv $UPSTREAM.nuevo $UPSTREAM && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx"; then
    log "nginx rechaza $c: restauro el upstream anterior"
    if [ -n "$previo" ]; then
      printf '%s\n' "$previo" | ssh "$KRAKEN" "sudo tee $UPSTREAM >/dev/null && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx"
    fi
    return 1
  fi
  log "nginx: upstream → $c (gateway ${IP_GW[$c]}, web ${IP_WEB[$c]}, bo ${IP_BO[$c]})"
}

# Capa compartida: los ExternalName de NS_COMP apuntan al color (juegos-worker → servicios del color).
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

# Borde público desde kraken por el tailnet o la IP pública (--resolve): / y /api/competiciones/grcup deben dar 200.
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

# Solo instalar-bg.sh: quita del namespace compartido el stack antiguo de los servicios sin estado (sus Services con las
# IPs fijas, Deployments, HPA, PDB, Jobs y políticas), para poder crear en su lugar los ExternalName.
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
