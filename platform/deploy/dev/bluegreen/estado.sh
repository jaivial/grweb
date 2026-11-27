#!/usr/bin/env bash
# estado.sh [--live-api] — qué color está vivo, puertos y salud de los dos colores, infra y nginx.
#   --live-api  imprime solo el color vivo de la API (para scripts: docker exec grcup-$(estado.sh --live-api)-identity-1 …)
set -Eeuo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [ "${1:-}" = --live-api ]; then
  live_api
  exit 0
fi

WEB=$(live_web)
API=$(live_api)
echo "vivo: web=${WEB:-?} (:${PORT_WEB[${WEB:-blue}]}) · api=${API:-?} (:${PORT_GW[${API:-blue}]}) · backoffice=$(state_get BO)"
for c in blue green; do
  mark=""
  if [ "$c" = "$API" ]; then mark="$mark API-vivo"; fi
  if [ "$c" = "$WEB" ]; then mark="$mark WEB-vivo"; fi
  running=$(docker ps --filter "label=com.docker.compose.project=grcup-$c" --filter status=running -q | wc -l)
  gw=$(http_code "http://127.0.0.1:${PORT_GW[$c]}/healthz")
  api=$(http_code "http://127.0.0.1:${PORT_GW[$c]}/api/competiciones/grcup")
  ssr=$(http_code -H "Host: $PUBLIC_HOST" "http://127.0.0.1:${PORT_WEB[$c]}/")
  unit=$(systemctl --user is-active "grcup-dev-web@$c.service" 2>/dev/null || true)
  printf '%-6s%-14s contenedores=%-3s gateway /healthz=%s /api=%s | SSR unidad=%s GET /=%s | puertos gw=%s chat=%s chat-load=%s web=%s\n' \
    "$c" "$mark" "$running" "$gw" "$api" "$unit" "$ssr" "${PORT_GW[$c]}" "${PORT_CHAT[$c]}" "${PORT_CHAT_LOAD[$c]}" "${PORT_WEB[$c]}"
done
echo "infra (grcup-infra):"
docker ps --filter label=com.docker.compose.project=grcup-infra --format '  {{.Names}}\t{{.Status}}'
echo "borde: https://$PUBLIC_HOST/ → $(http_code "https://$PUBLIC_HOST/") · /api/competiciones/grcup → $(http_code "https://$PUBLIC_HOST/api/competiciones/grcup")"
echo "nginx upstream:"
sudo grep -E '^\s*server ' "$UPSTREAM_CONF" 2>/dev/null | sed 's/^/  /' || true
