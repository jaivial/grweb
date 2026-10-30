#!/usr/bin/env bash
# Runs ON kraken as root, sent by deploy/scripts/nginx-prod.sh: aplicar-corte.sh <dir with plataforma.conf,
# anterior.tpl, grcup-proxy.conf, mantenimiento.html, rellenar-anterior.py>.
# Env: MODO (instalar|mantenimiento|redirigir|anterior), WEB_HOST, BO_HOST, API_HOST, ANTERIOR (previous domain).
# Paths can be overridden for a dry test in a container: NGINX_DIR, LE_DIR, CF_INI.
set -euo pipefail
src="$1"
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"; LE_DIR="${LE_DIR:-/etc/letsencrypt/live}"; CF_INI="${CF_INI:-/etc/letsencrypt/cloudflare.ini}"
d="$NGINX_DIR/grcup-corte"
mkdir -p "$d" "$NGINX_DIR/snippets"
install -m 0644 "$src/grcup-proxy.conf" "$NGINX_DIR/snippets/grcup-proxy.conf"
install -m 0644 "$src/mantenimiento.html" "$d/mantenimiento.html"

# aplicar <file> <new content file> <undo>: install, nginx -t, reload; on failure run <undo> and do not reload
aplicar() {
  if nginx -t 2>"$d/nginx-t.log"; then
    systemctl reload nginx
    echo "nginx: $MODO aplicado y recargado"
  else
    eval "$1"
    cat "$d/nginx-t.log"
    echo "nginx -t falló: se deshace el cambio y nginx no se ha recargado" >&2
    exit 1
  fi
}

case "$MODO" in
  instalar)
    # one certificate for the three hosts (DNS-01: works before their DNS records exist)
    if [ ! -f "$LE_DIR/$WEB_HOST/fullchain.pem" ]; then
      certbot certonly --non-interactive --agree-tos --dns-cloudflare --dns-cloudflare-credentials "$CF_INI" \
        --dns-cloudflare-propagation-seconds 30 --cert-name "$WEB_HOST" -d "$WEB_HOST" -d "$BO_HOST" -d "$API_HOST"
    fi
    sitio="$NGINX_DIR/sites-available/$WEB_HOST.conf"
    enlace="$NGINX_DIR/sites-enabled/$WEB_HOST.conf"
    [ -f "$sitio" ] && cp -p "$sitio" "$d/plataforma-previo.conf"
    install -m 0644 "$src/plataforma.conf" "$sitio"
    ln -sf "$sitio" "$enlace"
    if [ -f "$d/plataforma-previo.conf" ]; then aplicar "cp -p '$d/plataforma-previo.conf' '$sitio'"; else aplicar "rm -f '$enlace' '$sitio'"; fi
    ;;
  mantenimiento|redirigir|anterior)
    sitio="$NGINX_DIR/sites-available/$ANTERIOR"
    [ -f "$sitio" ] || { echo "no existe $sitio" >&2; exit 1; }
    # the previous web's original block, saved once (the rollback restores it)
    [ -f "$d/anterior.conf" ] || { cp -p "$sitio" "$d/anterior.conf"; echo "guardado el server block original en $d/anterior.conf"; }
    if [ "$MODO" = anterior ]; then
      cp "$d/anterior.conf" "$src/nuevo.conf"
    else
      # the same certificate lines as the original block
      grep -E '^\s*ssl_certificate(_key)?\s' "$d/anterior.conf" | head -2 > "$src/cert"
      [ "$(wc -l < "$src/cert")" = 2 ] || { echo "no encuentro ssl_certificate en $d/anterior.conf" >&2; exit 1; }
      python3 "$src/rellenar-anterior.py" "$src/anterior.tpl" "$src/cert" "$MODO" "$WEB_HOST" "$BO_HOST" > "$src/nuevo.conf"
    fi
    cp -p "$sitio" "$d/previo.conf"
    install -m 0644 "$src/nuevo.conf" "$sitio"
    aplicar "cp -p '$d/previo.conf' '$sitio'"
    ;;
  *) echo "modo desconocido: $MODO" >&2; exit 2 ;;
esac
