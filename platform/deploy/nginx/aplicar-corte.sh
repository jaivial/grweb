#!/usr/bin/env bash
# Runs ON kraken as root, sent by deploy/scripts/nginx-prod.sh: aplicar-corte.sh <dir with nuevo.conf,
# grcup-proxy.conf, mantenimiento.html>. Env: MODO (mantenimiento|plataforma|anterior), WEB_HOST, BO_HOST, API_HOST.
# Paths can be overridden for a dry test in a container: NGINX_DIR, LE_DIR, WEBROOT.
set -euo pipefail
src="$1"
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"; LE_DIR="${LE_DIR:-/etc/letsencrypt/live}"; WEBROOT="${WEBROOT:-/var/www/certbot}"
d="$NGINX_DIR/grcup-corte"
sitio="$NGINX_DIR/sites-available/$WEB_HOST"
[ -f "$sitio" ] || { echo "no existe $sitio" >&2; exit 1; }
mkdir -p "$d" "$NGINX_DIR/snippets"
install -m 0644 "$src/grcup-proxy.conf" "$NGINX_DIR/snippets/grcup-proxy.conf"
install -m 0644 "$src/mantenimiento.html" "$d/mantenimiento.html"
# the previous web's server block, saved once (the rollback restores it)
[ -f "$d/anterior.conf" ] || { cp -p "$sitio" "$d/anterior.conf"; echo "guardado el server block anterior en $d/anterior.conf"; }
if [ "$MODO" = anterior ]; then
  cp "$d/anterior.conf" "$src/nuevo.conf"
else
  # certificates of the new hosts (HTTP-01 webroot through a temporary port-80 server)
  for h in "$BO_HOST" "$API_HOST"; do
    [ -f "$LE_DIR/$h/fullchain.pem" ] && continue
    printf 'server { listen 80; server_name %s; location /.well-known/acme-challenge/ { root %s; } }\n' "$h" "$WEBROOT" > "$NGINX_DIR/sites-enabled/grcup-acme-$h.conf"
    nginx -t && systemctl reload nginx
    certbot certonly --non-interactive --agree-tos --webroot -w "$WEBROOT" --cert-name "$h" -d "$h"
    rm -f "$NGINX_DIR/sites-enabled/grcup-acme-$h.conf"
  done
fi
cp -p "$sitio" "$d/previo.conf"
install -m 0644 "$src/nuevo.conf" "$sitio"
if nginx -t 2>"$d/nginx-t.log"; then
  systemctl reload nginx
  echo "nginx: $MODO aplicado y recargado ($WEB_HOST)"
else
  cp -p "$d/previo.conf" "$sitio"
  cat "$d/nginx-t.log"
  echo "nginx -t falló: vuelve el fichero previo y nginx no se ha recargado" >&2
  exit 1
fi
