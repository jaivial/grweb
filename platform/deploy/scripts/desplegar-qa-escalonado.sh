#!/usr/bin/env bash
# Despliegue ESCALONADO de grcup-qa en kraken (perf-20261115 §8). Va un Deployment detrás de otro, vigilando el load
# del nodo, para que una actualización no dispare 25 rolling updates a la vez (25 pods extra) mientras el nodo
# comparte CPU con prod.
#
# Solo namespace grcup-qa. No toca prod, otros namespaces ni nada fuera del sitio nginx de QA del repo.
#
# Uso (desde platform/):
#   deploy/scripts/desplegar-qa-escalonado.sh plan      [VERSION]   → qué cambiaría (kubectl diff); no aplica nada
#   deploy/scripts/desplegar-qa-escalonado.sh imagenes  [VERSION]   → build (flock /tmp/grcup-build.lock) + import en containerd
#   deploy/scripts/desplegar-qa-escalonado.sh aplicar   [VERSION]   → manifests: objetos que no son Deployment, luego Deployments uno a uno
#   deploy/scripts/desplegar-qa-escalonado.sh nginx                 → copia de seguridad del sitio y nginx-qa.sh (nginx -t antes de recargar)
#   deploy/scripts/desplegar-qa-escalonado.sh rollback  [REF]       → manifests e imágenes de REF (por defecto 107ea39b), escalonado, y nginx anterior
#
# VERSION es la etiqueta de imagen (por defecto, el commit corto de HEAD). Si en el nodo ya existe grcup/<svc>:VERSION,
# `imagenes` no la reconstruye.
# Variables:
#   LOAD_MAX       (8)   no se da un paso con el load1 del nodo por encima de este valor; se espera hasta ESPERA_MAX
#                        segundos (600) a que baje y, si no baja, se aborta.
#   PAUSA          (20)  segundos entre Deployments.
#   SOLO="chat gateway"  limita aplicar/rollback a esos Deployments.
set -euo pipefail
echo "✗ obsoleto desde la migración a colores (blue/green): QA se despliega con deploy/scripts/desplegar-bg.sh qa" >&2
exit 1
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"; NS=grcup-qa; OVERLAY=deploy/k8s/overlays/qa
LOAD_MAX="${LOAD_MAX:-8}"; ESPERA_MAX="${ESPERA_MAX:-600}"; PAUSA="${PAUSA:-20}"; ESTABLE=107ea39b
CMD="${1:-}"; ARG="${2:-}"
K="sudo k3s kubectl -n $NS"

carga() { ssh "$KRAKEN" "cut -d' ' -f1 /proc/loadavg"; }
vigilar() { # espera a que el load1 baje de LOAD_MAX; si no, aborta
  local t=0 l
  while :; do
    l=$(carga)
    awk -v l="$l" -v m="$LOAD_MAX" 'BEGIN{exit !(l<m)}' && { echo "   load1 $l < $LOAD_MAX"; return 0; }
    (( t >= ESPERA_MAX )) && { echo "✗ load1 $l ≥ $LOAD_MAX durante ${ESPERA_MAX}s: ABORTO (nada a medias: el Deployment anterior ya terminó su rollout)" >&2; exit 3; }
    echo "   load1 $l ≥ $LOAD_MAX: espero 30 s"; sleep 30; t=$((t+30))
  done
}
renderizar() { # $1 = tag, $2 = directorio con deploy/k8s (por defecto el árbol actual) → YAML por stdout
  local dir="${2:-deploy/k8s}" tmp; tmp=$(mktemp -d)
  cp -r "$dir"/. "$tmp"/
  sed -i "s/newTag: TAG/newTag: \"$1\"/" "$tmp/overlays/qa/kustomization.yaml"
  kubectl kustomize "$tmp/overlays/qa"; rm -rf "$tmp"
}
partir() { # YAML por stdin → $1/resto.yaml (todo menos Deployments) y $1/deploy-<nombre>.yaml
  python3 -c '
import sys, yaml
out = sys.argv[1]; resto = []
for d in yaml.safe_load_all(sys.stdin):
    if not d: continue
    if d["kind"] == "Deployment":
        open(out + "/deploy-" + d["metadata"]["name"] + ".yaml", "w").write(yaml.safe_dump(d, sort_keys=False))
    elif d["kind"] == "ResourceQuota":
        open(out + "/quota.yaml", "w").write(yaml.safe_dump(d, sort_keys=False))
    else:
        resto.append(d)
open(out + "/resto.yaml", "w").write(yaml.safe_dump_all(resto, sort_keys=False))
' "$1"
}
# Orden: lo frío primero; gateway y chat (lo que toca la ruta caliente) al final, cuando ya se ha visto el nodo estable.
ORDEN="ai audit cms crm donaciones fans messaging patrocinio raffle schedule mailpit evo-weai backoffice openlifter ticketing identity competition live athletes realtime juegos-worker juegos web chat gateway"

aplicar_tag() { # $1 = tag, $2 = árbol deploy/k8s opcional
  local tag="$1" w; w=$(mktemp -d)
  renderizar "$tag" "${2:-}" | partir "$w"
  ssh "$KRAKEN" "sudo k3s ctr -n k8s.io images ls -q | grep -q 'grcup/chat:$tag\$'" || { echo "✗ grcup/chat:$tag no está en el nodo (antes: imagenes $tag)" >&2; exit 1; }
  vigilar
  echo "→ objetos que no son Deployment (Services, HPA, ConfigMaps, NetworkPolicies, Jobs, PriorityClass, quota)"
  # Jobs son inmutables: se borran los del deploy (label part-of=grcup) y se recrean con la etiqueta nueva (idempotentes).
  ssh "$KRAKEN" "$K delete job -l app.kubernetes.io/part-of=grcup --ignore-not-found >/dev/null"
  ssh "$KRAKEN" "$K apply -f -" < "$w/resto.yaml"
  local lista="${SOLO:-$ORDEN}" n
  for n in $lista; do
    [ -f "$w/deploy-$n.yaml" ] || continue
    vigilar
    echo "→ $n"
    ssh "$KRAKEN" "$K apply -f -" < "$w/deploy-$n.yaml"
    ssh "$KRAKEN" "$K rollout status deploy/$n --timeout=300s" || { echo "✗ rollout de $n no terminó: PARO. Revertir solo este: $K rollout undo deploy/$n" >&2; exit 4; }
    sleep "$PAUSA"
  done
  # Deployments del overlay que no están en ORDEN (nuevos)
  for f in "$w"/deploy-*.yaml; do n=$(basename "$f" .yaml); n=${n#deploy-}
    [[ " $ORDEN " == *" $n "* || -n "${SOLO:-}" ]] && continue
    vigilar; echo "→ $n (nuevo)"; ssh "$KRAKEN" "$K apply -f -" < "$f"; ssh "$KRAKEN" "$K rollout status deploy/$n --timeout=300s"
  done
  ssh "$KRAKEN" "$K wait --for=condition=complete job -l app.kubernetes.io/part-of=grcup --timeout=300s" >/dev/null || echo "⚠ algún Job del deploy no terminó: revisar $K get jobs"
  # The quota goes LAST: a lower quota applied before the rollouts (prod-20261115 lowers QA's) would block the surge
  # pods of every rolling update while the old, bigger floor is still running.
  if [ -f "$w/quota.yaml" ]; then echo "→ ResourceQuota"; ssh "$KRAKEN" "$K apply -f -" < "$w/quota.yaml"; fi
  rm -rf "$w"; echo "✓ grcup-qa en $tag"
}

case "$CMD" in
  plan)
    tag="${ARG:-$(git rev-parse --short HEAD)}"
    renderizar "$tag" | ssh "$KRAKEN" "$K diff -f - || true"
    echo "(plan de $tag; load1 ahora: $(carga))";;
  imagenes)
    tag="${ARG:-$(git rev-parse --short HEAD)}"
    git diff --quiet HEAD -- . || { echo "✗ cambios sin commitear: no construyo una etiqueta de commit con otro contenido" >&2; exit 1; }
    SERVICES=$(grep -oE 'name: grcup/[a-z-]+' "$OVERLAY/kustomization.yaml" | sed 's|name: grcup/||' | grep -vE '^(web|backoffice)$')
    falta=""
    for s in $SERVICES web backoffice; do ssh "$KRAKEN" "sudo k3s ctr -n k8s.io images ls -q | grep -q 'grcup/$s:$tag\$'" || falta="$falta $s"; done
    [ -n "$falta" ] || { echo "✓ todas las imágenes :$tag ya están en el nodo"; exit 0; }
    echo "→ construyo:$falta (un build a la vez)"
    exec 9>/tmp/grcup-build.lock; flock 9
    IMAGES=""
    for s in $falta; do
      case $s in
        web) nice -n 15 docker build -q --target public -t grcup/web:$tag web >/dev/null ;;
        backoffice) nice -n 15 docker build -q --target backoffice -t grcup/backoffice:$tag web >/dev/null ;;
        *) nice -n 15 docker build -q --build-arg SVC=$s --build-arg VERSION=$tag -t grcup/$s:$tag . >/dev/null ;;
      esac
      IMAGES="$IMAGES grcup/$s:$tag"
    done
    vigilar
    echo "→ import en containerd de $KRAKEN (nice/ionice en el nodo)"
    # shellcheck disable=SC2086
    docker save $IMAGES | gzip -1 | ssh "$KRAKEN" 'gunzip | sudo nice -n 10 ionice -c3 k3s ctr -n k8s.io images import - >/dev/null'
    echo "✓ imágenes :$tag en el nodo (las de $ESTABLE se conservan para el rollback)";;
  aplicar)
    aplicar_tag "${ARG:-$(git rev-parse --short HEAD)}";;
  nginx)
    vigilar
    ts=$(date +%Y%m%d%H%M%S)
    ssh "$KRAKEN" "sudo cp -a /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf.bak-$ts && echo '   copia: grcup-qa.menustudioai.com.conf.bak-$ts'"
    KRAKEN="$KRAKEN" deploy/scripts/nginx-qa.sh
    echo "   rollback de nginx: deploy/scripts/desplegar-qa-escalonado.sh rollback (restaura la copia más reciente)";;
  rollback)
    ref="${ARG:-$ESTABLE}"; w=$(mktemp -d)
    git -C . archive "$ref" deploy/k8s deploy/nginx | tar -C "$w" -xf -
    tag=$(git rev-parse --short "$ref")
    aplicar_tag "$tag" "$w/deploy/k8s"
    # kustomize no poda: lo que añadió §8 y no existe en REF se borra explícitamente
    git -C . cat-file -e "$ref:platform/deploy/k8s/overlays/qa/chat-ws.yaml" 2>/dev/null || ssh "$KRAKEN" "$K delete service chat-ws --ignore-not-found"
    ultima=$(ssh "$KRAKEN" "ls -1t /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf.bak-* 2>/dev/null | head -1")
    if [ -n "$ultima" ]; then
      ssh "$KRAKEN" "sudo cp -a '$ultima' /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf && sudo nginx -t && sudo systemctl reload nginx && echo '   nginx restaurado desde $ultima'"
    fi
    rm -rf "$w";;
  *) sed -n '2,24p' "$0"; exit 2;;
esac
