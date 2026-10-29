#!/usr/bin/env bash
# Creates the Redis ACL user "grcup" on kraken's redis-server (6.0), limited to keys grcup:*.
# Applied live with ACL SETUSER (no restart) and persisted as a `user` line in redis.conf (hashed password).
# The password is the REDIS_PASSWORD of ~/.config/grcup-qa/secrets.env (run secretos-qa.sh first). Never printed.
set -euo pipefail
F="${GRCUP_QA_DIR:-$HOME/.config/grcup-qa}/secrets.env"
KRAKEN="${KRAKEN:-kraken}"
pw=$(grep -E '^REDIS_PASSWORD=' "$F" | cut -d= -f2-)
[ -n "$pw" ] || { echo "falta REDIS_PASSWORD en $F" >&2; exit 1; }
hash=$(printf '%s' "$pw" | sha256sum | cut -d' ' -f1)

ssh "$KRAKEN" "sudo bash -s" <<EOF
set -euo pipefail
set -f # the ACL rules contain globs (~grcup:*)
conf=/etc/redis/redis.conf
export REDISCLI_AUTH="\$(grep -E '^requirepass ' \$conf | awk '{print \$2}')"
rules='on #$hash ~grcup:* +@all -@dangerous'
redis-cli ACL SETUSER grcup reset \$rules >/dev/null
if grep -qE '^user grcup ' \$conf; then
  sed -i "s|^user grcup .*|user grcup \$rules|" \$conf
else
  cp -p \$conf \$conf.bak-grcup-\$(date +%Y%m%d%H%M%S)
  printf '\n# GR Cup platform (QA): ACL user limited to grcup:* keys — platform/deploy/scripts/redis-acl-qa.sh\nuser grcup %s\n' "\$rules" >> \$conf
fi
redis-cli ACL LIST | grep -c '^user grcup ' | sed 's/^/usuarios grcup: /'
EOF
