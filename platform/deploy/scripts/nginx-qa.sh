#!/usr/bin/env bash
# Instala el sitio nginx de QA en kraken, UNA VEZ (instalar-bg.sh): certificado Let's Encrypt (DNS-01 con las
# credenciales de certbot de Cloudflare) para los cuatro subdominios, snippet, sitio y el fichero de upstreams con las
# IPs que se pasan. Después, el color vivo lo conmutan desplegar-bg.sh y rollback-bg.sh: este script se niega si el
# fichero de upstreams ya existe. Si nginx -t falla, se restauran los ficheros anteriores (el sitio no se desactiva).
# Uso (desde platform/): deploy/scripts/nginx-qa.sh <ip-gateway> <ip-web> <ip-bo> <ip-chat>
set -euo pipefail
cd "$(dirname "$0")/../nginx"
KRAKEN="${KRAKEN:-kraken}"
UPSTREAM=/etc/nginx/conf.d/grcup-qa-upstream.conf
DOMAINS="grcup-qa.menustudioai.com grcup-qa-bo.menustudioai.com grcup-qa-api.menustudioai.com grcup-qa-mail.menustudioai.com"
[ "$#" -eq 4 ] || { echo "uso: $0 <ip-gateway> <ip-web> <ip-bo> <ip-chat>" >&2; exit 2; }
ssh "$KRAKEN" "test ! -e $UPSTREAM" || { echo "✗ $UPSTREAM ya existe: el color vivo lo conmutan desplegar-bg.sh / rollback-bg.sh" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp grcup-qa.conf grcup-qa-proxy.conf "$tmp/"
sed -e "s/@GW@/$1/" -e "s/@WEB@/$2/" -e "s/@BO@/$3/" -e "s/@CHAT@/$4/" grcup-qa-upstream.conf.tpl > "$tmp/grcup-qa-upstream.conf"

tar -C "$tmp" -cf - grcup-qa.conf grcup-qa-proxy.conf grcup-qa-upstream.conf | ssh "$KRAKEN" "sudo bash -c '
set -euo pipefail
tmp=\$(mktemp -d); tar -C \$tmp -xf -
if [ ! -f /etc/letsencrypt/live/grcup-qa.menustudioai.com/fullchain.pem ]; then
  args=\"\"; for d in $DOMAINS; do args=\"\$args -d \$d\"; done
  certbot certonly --non-interactive --agree-tos --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 30 --cert-name grcup-qa.menustudioai.com \$args
fi
antes=\$(mktemp -d)
cp -a /etc/nginx/snippets/grcup-qa-proxy.conf \$antes/proxy.conf 2>/dev/null || true
cp -a /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf \$antes/sitio.conf 2>/dev/null || true
install -m 0644 \$tmp/grcup-qa-proxy.conf /etc/nginx/snippets/grcup-qa-proxy.conf
install -m 0644 \$tmp/grcup-qa.conf /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf
install -m 0644 \$tmp/grcup-qa-upstream.conf $UPSTREAM
ln -sf /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf /etc/nginx/sites-enabled/grcup-qa.menustudioai.com.conf
if nginx -t 2>/tmp/grcup-qa-nginx-test.log; then
  systemctl reload nginx && echo \"nginx recargado\"
else
  cat /tmp/grcup-qa-nginx-test.log
  rm -f $UPSTREAM
  [ -f \$antes/proxy.conf ] && cp -a \$antes/proxy.conf /etc/nginx/snippets/grcup-qa-proxy.conf
  [ -f \$antes/sitio.conf ] && cp -a \$antes/sitio.conf /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf
  nginx -t && systemctl reload nginx
  echo \"nginx -t falló: ficheros anteriores restaurados, nginx recargado\" >&2; exit 1
fi
rm -rf \$tmp \$antes
'"
