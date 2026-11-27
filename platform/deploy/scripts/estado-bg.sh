#!/usr/bin/env bash
# estado-bg.sh <qa> — solo lectura: color vivo y previo, réplicas de cada color, a qué apuntan los ExternalName de la
# capa compartida, el upstream de nginx, el borde público y la memoria de kraken. Desde platform/.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
. deploy/scripts/lib/colores.sh
colores_init "${1:-}"
read -r VIVO PREVIO < <(colores_estado_leer) || true
echo "vivo=${VIVO:-—} previo=${PREVIO:-—}"
ssh "$KRAKEN" bash -s -- "$NS_COMP" "${NS[blue]}" "${NS[green]}" <<'SH'
set -uo pipefail
comp=$1; shift
echo "--- réplicas (Deployment: spec/ready · anotado al apagar)"
for ns in "$@"; do
  sudo k3s kubectl -n "$ns" get deploy -o json 2>/dev/null | jq -r --arg ns "$ns" '.items[] | "\($ns) \(.metadata.name) \(.spec.replicas // 0)/\(.status.readyReplicas // 0) \(.metadata.annotations["grcup.dev/replicas-antes"] // "-")"' | column -t 2>/dev/null || true
done
echo "--- capa compartida ($comp): destino de identity, gateway, messaging"
for s in identity gateway messaging; do
  printf '%s → %s\n' "$s" "$(sudo k3s kubectl -n "$comp" get svc "$s" -o jsonpath='{.spec.type} {.spec.externalName}{.spec.clusterIP}' 2>/dev/null)"
done
echo "--- upstream nginx"
sudo cat /etc/nginx/conf.d/grcup-qa-upstream.conf 2>/dev/null | grep -E 'server ' || echo "(sin fichero)"
echo "--- memoria"
free -g | awk '/^Mem:/{print "disponible " $7 " GB"}'
SH
ssh "$KRAKEN" bash -s -- "$PUBLIC_HOST" "$EDGE_IP" <<'SH'
host=$1 ip=$2
for p in / /api/competiciones/grcup; do
  printf 'borde %s → %s\n' "$p" "$(curl -s -o /dev/null -m 10 --resolve "$host:443:$ip" -w '%{http_code}' "https://$host$p")"
done
SH
