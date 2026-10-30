#!/usr/bin/env bash
# Creates or updates the Redis ACL user of an environment on kraken's redis-server (6.0), limited to that
# environment's keys: deploy/scripts/redis-acl.sh <qa|prod>
#   qa   → user «grcup»       ~grcup:qa:*     (password REDIS_PASSWORD of ~/.config/grcup-qa/secrets.env)
#   prod → user «grcup-prod»  ~grcup:prod:*   (password REDIS_PASSWORD of ~/.config/grcup-prod/secrets.env)
# QA and production share the host Redis (and other apps use it too): neither can read the other's keys.
# Applied live with ACL SETUSER (no restart) and persisted as a `user` line in redis.conf (hashed password).
# Run secretos.sh <env> first. The password is never printed.
set -euo pipefail
case "${1:-}" in
  qa) USUARIO=grcup; PATRON='grcup:qa:*'; F="${GRCUP_QA_DIR:-$HOME/.config/grcup-qa}/secrets.env" ;;
  prod) USUARIO=grcup-prod; PATRON='grcup:prod:*'; F="${GRCUP_PROD_DIR:-$HOME/.config/grcup-prod}/secrets.env" ;;
  *) echo "uso: $0 <qa|prod>" >&2; exit 2 ;;
esac
KRAKEN="${KRAKEN:-kraken}"
pw=$(grep -E '^REDIS_PASSWORD=' "$F" | cut -d= -f2-)
[ -n "$pw" ] || { echo "falta REDIS_PASSWORD en $F" >&2; exit 1; }
hash=$(printf '%s' "$pw" | sha256sum | cut -d' ' -f1)

ssh "$KRAKEN" "sudo bash -s" <<EOF
set -euo pipefail
set -f # the ACL rules contain globs
conf=/etc/redis/redis.conf
export REDISCLI_AUTH="\$(grep -E '^requirepass ' \$conf | awk '{print \$2}')"
rules='on #$hash ~$PATRON +@all -@dangerous'
redis-cli ACL SETUSER $USUARIO reset \$rules >/dev/null
if grep -qE '^user $USUARIO ' \$conf; then
  sed -i "s|^user $USUARIO .*|user $USUARIO \$rules|" \$conf
else
  cp -p \$conf \$conf.bak-$USUARIO-\$(date +%Y%m%d%H%M%S)
  printf '\n# GR Cup platform ($1): ACL user limited to $PATRON keys — platform/deploy/scripts/redis-acl.sh\nuser $USUARIO %s\n' "\$rules" >> \$conf
fi
redis-cli ACL GETUSER $USUARIO | tr '\n' ' ' | grep -o 'keys [^ ]* [^ ]*' | sed 's/^/$USUARIO: /'
EOF
