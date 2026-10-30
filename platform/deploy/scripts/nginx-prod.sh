#!/usr/bin/env bash
# nginx of the GR Cup domain at the cutover (docs/runbooks/CORTE.md › 5). The domains come from
# deploy/k8s/overlays/prod/config.yaml (WEB_HOST, BACKOFFICE_URL, API_URL).
#
#   deploy/scripts/nginx-prod.sh probar                               render both modes and run `nginx -t` in a local
#                                                                     container (touches nothing on kraken)
#   deploy/scripts/nginx-prod.sh mantenimiento --confirmo-produccion  T0·0′: 503 on the web host (FER's Stripe webhook
#                                                                     still passes), backoffice and API hosts live
#   deploy/scripts/nginx-prod.sh plataforma --confirmo-produccion     T0·50′: the web host goes to the platform
#   deploy/scripts/nginx-prod.sh anterior --confirmo-produccion       rollback: the previous web's server block again
#
# The previous file of the domain is saved once in /etc/nginx/grcup-corte/anterior.conf; every change runs `nginx -t`
# and, if it fails, puts the previous file back without reloading. Missing certificates of the backoffice and API
# hosts are requested with certbot (HTTP-01 webroot: their DNS must already point to kraken). Certificates can be
# overridden with WEB_CERT / BO_CERT / API_CERT (directories with fullchain.pem and privkey.pem).
set -euo pipefail
cd "$(dirname "$0")/../.."
MODO="${1:-}"
KRAKEN="${KRAKEN:-kraken}"
CFG=deploy/k8s/overlays/prod/config.yaml
val() { grep -E "^\s*$1:" "$CFG" | head -1 | sed -E "s/^\s*$1:\s*//; s/^\"//; s/\"$//"; }
WEB_HOST=$(val WEB_HOST)
BO_HOST=$(val BACKOFFICE_URL | sed 's|^https://||')
API_HOST=$(val API_URL | sed 's|^https://||')
WEB_CERT="${WEB_CERT:-/etc/letsencrypt/live/$WEB_HOST}"
BO_CERT="${BO_CERT:-/etc/letsencrypt/live/$BO_HOST}"
API_CERT="${API_CERT:-/etc/letsencrypt/live/$API_HOST}"

render() { # render <plataforma|mantenimiento> → stdout
  python3 - "$1" "$WEB_HOST" "$BO_HOST" "$API_HOST" "$WEB_CERT" "$BO_CERT" "$API_CERT" <<'PY'
import re, sys
modo, web, bo, api, wc, bc, ac = sys.argv[1:8]
s = open("deploy/nginx/grcup-prod.conf.tpl").read()
if modo == "mantenimiento":
    m = open("deploy/nginx/grcup-prod-mantenimiento.conf.tpl").read()
    s = re.sub(r"# >>> web.*?# <<< web\n", lambda _: m, s, flags=re.S)
for k, v in {"__WEB_HOST__": web, "__BO_HOST__": bo, "__API_HOST__": api, "__WEB_CERT__": wc, "__BO_CERT__": bc, "__API_CERT__": ac}.items():
    s = s.replace(k, v)
assert "__" not in re.sub(r"#.*", "", s), "placeholder sin rellenar"
print(s)
PY
}

case "$MODO" in
  probar)
    t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
    mkdir -p "$t/conf.d" "$t/snippets" "$t/corte"
    for h in "$WEB_CERT" "$BO_CERT" "$API_CERT"; do
      mkdir -p "$t/certs$h"
      [ -f "$t/certs$h/privkey.pem" ] || openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 -subj "/CN=prueba" \
        -keyout "$t/certs$h/privkey.pem" -out "$t/certs$h/fullchain.pem" 2>/dev/null
    done
    cp deploy/nginx/grcup-proxy.conf "$t/snippets/"
    cp deploy/nginx/mantenimiento.html "$t/corte/"
    for m in plataforma mantenimiento; do
      render "$m" > "$t/conf.d/grcup.conf"
      vols=(-v "$t/conf.d:/etc/nginx/conf.d:ro" -v "$t/snippets:/etc/nginx/snippets:ro" -v "$t/corte:/etc/nginx/grcup-corte:ro")
      for h in "$WEB_CERT" "$BO_CERT" "$API_CERT"; do vols+=(-v "$t/certs$h:$h:ro"); done
      docker run --rm --entrypoint nginx "${vols[@]}" nginx:1.27-alpine -t 2>&1 | sed "s/^/  [$m] /"
    done
    echo "hosts: web $WEB_HOST · backoffice $BO_HOST · api $API_HOST"
    exit 0 ;;
  mantenimiento|plataforma|anterior) ;;
  *) echo "uso: $0 <probar|mantenimiento|plataforma|anterior> [--confirmo-produccion]" >&2; exit 2 ;;
esac

[ "${2:-}" = "--confirmo-produccion" ] || { echo "✗ cambia el nginx de producción: hace falta --confirmo-produccion" >&2; exit 1; }
grep -qE '^\s*DOMINIOS_CONFIRMADOS: "si"' "$CFG" || { echo "✗ los dominios de $CFG no están confirmados" >&2; exit 1; }

t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
[ "$MODO" != anterior ] && render "$MODO" > "$t/nuevo.conf"
cp deploy/nginx/grcup-proxy.conf deploy/nginx/mantenimiento.html deploy/nginx/aplicar-corte.sh "$t/"
tar -C "$t" -cf - . | ssh "$KRAKEN" "sudo bash -c 'd=\$(mktemp -d); tar -C \$d -xf -; MODO=$MODO WEB_HOST=$WEB_HOST BO_HOST=$BO_HOST API_HOST=$API_HOST bash \$d/aplicar-corte.sh \$d; rc=\$?; rm -rf \$d; exit \$rc'"
