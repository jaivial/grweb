#!/usr/bin/env bash
# Installs the QA nginx site on kraken: Let's Encrypt certificate (DNS-01 via the existing Cloudflare
# credentials of certbot) for the four subdomains, then the site, `nginx -t` and a graceful reload.
# If the configuration test fails the site is disabled again and nginx is not reloaded.
set -euo pipefail
cd "$(dirname "$0")/../nginx"
KRAKEN="${KRAKEN:-kraken}"
DOMAINS="grcup-qa.menustudioai.com grcup-qa-bo.menustudioai.com grcup-qa-api.menustudioai.com grcup-qa-mail.menustudioai.com"

tar -cf - grcup-qa.conf grcup-qa-proxy.conf | ssh "$KRAKEN" "sudo bash -c '
set -euo pipefail
tmp=\$(mktemp -d); tar -C \$tmp -xf -
if [ ! -f /etc/letsencrypt/live/grcup-qa.menustudioai.com/fullchain.pem ]; then
  args=\"\"; for d in $DOMAINS; do args=\"\$args -d \$d\"; done
  certbot certonly --non-interactive --agree-tos --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 30 --cert-name grcup-qa.menustudioai.com \$args
fi
install -m 0644 \$tmp/grcup-qa-proxy.conf /etc/nginx/snippets/grcup-qa-proxy.conf
install -m 0644 \$tmp/grcup-qa.conf /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf
ln -sf /etc/nginx/sites-available/grcup-qa.menustudioai.com.conf /etc/nginx/sites-enabled/grcup-qa.menustudioai.com.conf
if nginx -t 2>/tmp/grcup-qa-nginx-test.log; then
  systemctl reload nginx && echo \"nginx recargado\"
else
  rm -f /etc/nginx/sites-enabled/grcup-qa.menustudioai.com.conf
  cat /tmp/grcup-qa-nginx-test.log; echo \"nginx -t falló: sitio desactivado, nginx no se ha recargado\" >&2; exit 1
fi
rm -rf \$tmp
'"
