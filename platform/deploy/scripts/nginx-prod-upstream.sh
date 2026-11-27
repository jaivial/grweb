#!/usr/bin/env bash
# Primera migración del edge de producción (grscup.com) a upstreams en fichero, UNA VEZ (instalar-bg.sh prod):
# quita del vhost las tres líneas «upstream grcup_gateway|web|bo» en línea, instala /etc/nginx/conf.d/grcup-prod-upstream.conf
# con las IPs que se pasan y recarga nginx UNA vez. Nada más del vhost cambia (TLS, HTTP/2, QUIC, snippets, location,
# proxy_pass): se comprueba que se borran exactamente tres líneas. Si nginx -t falla, se restauran el vhost y el
# fichero anterior y se recarga. Desde platform/: deploy/scripts/nginx-prod-upstream.sh <gateway> <web> <bo>
set -euo pipefail
cd "$(dirname "$0")/../nginx"
KRAKEN="${KRAKEN:-kraken}"
VHOST=/etc/nginx/sites-available/grscup.com.conf
UPSTREAM=/etc/nginx/conf.d/grcup-prod-upstream.conf
[ "$#" -eq 3 ] || { echo "uso: $0 <ip-gateway> <ip-web> <ip-bo>" >&2; exit 2; }
ssh "$KRAKEN" "test ! -e $UPSTREAM" || { echo "✗ $UPSTREAM ya existe: el color vivo lo conmutan desplegar-bg.sh / rollback-bg.sh" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sed -e "s/@GW@/$1/" -e "s/@WEB@/$2/" -e "s/@BO@/$3/" grcup-prod-upstream.conf.tpl > "$tmp/grcup-prod-upstream.conf"

tar -C "$tmp" -cf - grcup-prod-upstream.conf | ssh "$KRAKEN" "sudo bash -c '
set -euo pipefail
tmp=\$(mktemp -d); tar -C \$tmp -xf -
ts=\$(date +%Y%m%d-%H%M%S)
cp -a $VHOST $VHOST.antes-\$ts
n=\$(grep -cE \"^upstream grcup_(gateway|web|bo) \\{\" $VHOST || true)
[ \"\$n\" -eq 3 ] || { echo \"✗ el vhost tiene \$n upstreams en línea (se esperan 3): no se toca\" >&2; rm -rf \$tmp; exit 1; }
sed -E \"/^upstream grcup_(gateway|web|bo) \\{/d\" $VHOST.antes-\$ts > $VHOST.nuevo
mv $VHOST.nuevo $VHOST
install -m 0644 \$tmp/grcup-prod-upstream.conf $UPSTREAM
if nginx -t 2>/tmp/grcup-prod-nginx-test.log; then
  systemctl reload nginx && echo \"nginx recargado (vhost sin upstreams en línea; copia: $VHOST.antes-\$ts)\"
  diff $VHOST.antes-\$ts $VHOST || true
else
  cat /tmp/grcup-prod-nginx-test.log
  rm -f $UPSTREAM
  cp -a $VHOST.antes-\$ts $VHOST
  nginx -t && systemctl reload nginx
  echo \"nginx -t falló: vhost y upstream anteriores restaurados, nginx recargado\" >&2; rm -rf \$tmp; exit 1
fi
rm -rf \$tmp
'"
