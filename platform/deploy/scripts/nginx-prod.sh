#!/usr/bin/env bash
# nginx (and DNS) of production on kraken. Hosts from deploy/k8s/overlays/prod/config.yaml: WEB_HOST, BACKOFFICE_URL,
# API_URL (subdomains of menustudioai.com) and DOMINIO_ANTERIOR (the previous web's domain).
#
#   deploy/scripts/nginx-prod.sh probar                            render every file and run `nginx -t` in a local
#                                                                  container (touches nothing on kraken)
#   deploy/scripts/nginx-prod.sh instalar --confirmo-produccion    the platform's own site: certificate (DNS-01,
#                                                                  Cloudflare) for the three hosts, site, nginx -t,
#                                                                  reload, then the DNS records (A → kraken)
#   deploy/scripts/nginx-prod.sh mantenimiento --confirmo-produccion  cutover T0·0′: 503 on the previous domain
#   deploy/scripts/nginx-prod.sh redirigir --confirmo-produccion      cutover T0·50′: previous domain → 301 to the web
#   deploy/scripts/nginx-prod.sh anterior --confirmo-produccion       rollback: the previous domain's original block
#
# The previous domain keeps FER's Stripe webhook on the previous backend in every mode. Its original server block is
# saved once in /etc/nginx/grcup-corte/anterior.conf. Every change runs `nginx -t` and, if it fails, puts the previous
# file back without reloading. The previous domain is behind BunnyCDN: purge the pull zone after each change.
set -euo pipefail
cd "$(dirname "$0")/../.."
MODO="${1:-}"
KRAKEN="${KRAKEN:-kraken}"
CFG=deploy/k8s/overlays/prod/config.yaml
val() { grep -E "^\s*$1:" "$CFG" | head -1 | sed -E "s/^\s*$1:\s*//; s/^\"//; s/\"$//"; }
WEB_HOST=$(val WEB_HOST)
BO_HOST=$(val BACKOFFICE_URL | sed 's|^https://||')
API_HOST=$(val API_URL | sed 's|^https://||')
ANTERIOR=$(val DOMINIO_ANTERIOR)
CERT="${CERT:-/etc/letsencrypt/live/$WEB_HOST}"

plataforma() {
  sed -e "s|__WEB_HOST__|$WEB_HOST|g; s|__BO_HOST__|$BO_HOST|g; s|__API_HOST__|$API_HOST|g; s|__CERT__|$CERT|g" deploy/nginx/grcup-prod.conf.tpl
}
anterior_tpl() { # the previous domain's template with the hosts filled in (certificate lines and action: on kraken)
  sed -e "s|__WEB_HOST__|$WEB_HOST|g; s|__BO_HOST__|$BO_HOST|g; s|__DOMINIO_ANTERIOR__|$ANTERIOR|g" deploy/nginx/grcup-anterior.conf.tpl
}

case "$MODO" in
  probar)
    t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
    mkdir -p "$t/conf.d" "$t/snippets" "$t/corte" "$t/certs/web" "$t/certs/anterior" "$t/tpl"
    for c in web anterior; do
      openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 -subj "/CN=prueba" \
        -keyout "$t/certs/$c/privkey.pem" -out "$t/certs/$c/fullchain.pem" 2>/dev/null
    done
    cp deploy/nginx/grcup-proxy.conf "$t/snippets/"; cp deploy/nginx/mantenimiento.html "$t/corte/"
    CERT=/certs/web plataforma > "$t/conf.d/plataforma.conf"
    anterior_tpl > "$t/tpl/anterior.tpl"
    printf '    ssl_certificate /certs/anterior/fullchain.pem;\n    ssl_certificate_key /certs/anterior/privkey.pem;\n' > "$t/tpl/cert"
    for accion in mantenimiento redirigir; do
      python3 deploy/nginx/rellenar-anterior.py "$t/tpl/anterior.tpl" "$t/tpl/cert" "$accion" "$WEB_HOST" "$BO_HOST" > "$t/conf.d/anterior.conf"
      docker run --rm --entrypoint nginx -v "$t/conf.d:/etc/nginx/conf.d:ro,z" -v "$t/snippets:/etc/nginx/snippets:ro,z" \
        -v "$t/corte:/etc/nginx/grcup-corte:ro,z" -v "$t/certs:/certs:ro,z" nginx:1.27-alpine -t 2>&1 | sed "s/^/  [plataforma + anterior $accion] /"
    done
    echo "web $WEB_HOST · backoffice $BO_HOST · api $API_HOST · anterior $ANTERIOR"
    exit 0 ;;
  instalar|mantenimiento|redirigir|anterior) ;;
  *) echo "uso: $0 <probar|instalar|mantenimiento|redirigir|anterior> [--confirmo-produccion]" >&2; exit 2 ;;
esac

[ "${2:-}" = "--confirmo-produccion" ] || { echo "✗ cambia el nginx de producción: hace falta --confirmo-produccion" >&2; exit 1; }
grep -qE '^\s*DOMINIOS_CONFIRMADOS: "si"' "$CFG" || { echo "✗ los dominios de $CFG no están confirmados" >&2; exit 1; }
if [ "$MODO" = instalar ] || [ "$MODO" = redirigir ]; then
  # the platform must be running before anything points at it
  ssh "$KRAKEN" "sudo k3s kubectl -n grcup get svc gateway web backoffice >/dev/null 2>&1" ||
    { echo "✗ la plataforma no está desplegada en el namespace grcup (deploy/scripts/desplegar.sh prod)" >&2; exit 1; }
fi

t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
plataforma > "$t/plataforma.conf"
anterior_tpl > "$t/anterior.tpl"
cp deploy/nginx/grcup-proxy.conf deploy/nginx/mantenimiento.html deploy/nginx/aplicar-corte.sh deploy/nginx/rellenar-anterior.py "$t/"
tar -C "$t" -cf - . | ssh "$KRAKEN" "sudo bash -c 'd=\$(mktemp -d); tar -C \$d -xf -; MODO=$MODO WEB_HOST=$WEB_HOST BO_HOST=$BO_HOST API_HOST=$API_HOST ANTERIOR=$ANTERIOR bash \$d/aplicar-corte.sh \$d; rc=\$?; rm -rf \$d; exit \$rc'"

if [ "$MODO" = instalar ]; then
  # DNS last: the names resolve only once their server exists (Cloudflare, DNS only, A → kraken's public IP)
  "$(dirname "$0")/dns-cloudflare.sh" prod
fi
