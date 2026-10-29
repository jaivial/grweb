#!/usr/bin/env bash
# Generates (once) and applies the Secrets of the grcup-qa namespace.
# Values live only on this machine in ~/.config/grcup-qa/ (0600) and travel to kraken over ssh stdin. Never printed.
set -euo pipefail
DIR="${GRCUP_QA_DIR:-$HOME/.config/grcup-qa}"
F="$DIR/secrets.env"
KRAKEN="${KRAKEN:-kraken}"
NS="${NS:-grcup-qa}"
umask 077
mkdir -p "$DIR"
touch "$F"

gen() { grep -q "^$1=" "$F" || echo "$1=$(openssl rand -hex "${2:-24}")" >>"$F"; }
gen POSTGRES_PASSWORD
for s in IDENTITY COMPETITION CMS ATHLETES SCHEDULE LIVE TICKETING RAFFLE CRM MESSAGING AI AUDIT; do gen "PW_$s"; done
gen REDIS_PASSWORD 32
gen INTERNAL_TOKEN_SECRET 32
gen CRYPTO_KEY 32
gen ROOT_PASSWORD 12
grep -q '^ROOT_EMAIL=' "$F" || echo "ROOT_EMAIL=${ROOT_EMAIL:-jaimebillanueba99@gmail.com}" >>"$F"
grep -q '^ROOT_NOMBRE=' "$F" || echo 'ROOT_NOMBRE="Jaime (QA)"' >>"$F"
[ -f "$DIR/jwt.pem" ] || openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$DIR/jwt.pem"
# MiniMax (AI service): copied from ~/.env when available.
if ! grep -q '^MINIMAX_API_KEY=' "$F" && [ -f "$HOME/.env" ]; then
  k=$(grep -E '^MINIMAX_TOKEN_PLAN_API_KEY=' "$HOME/.env" | cut -d= -f2- || true)
  [ -n "$k" ] && echo "MINIMAX_API_KEY=$k" >>"$F"
fi

set -a
# shellcheck disable=SC1090
. "$F"
set +a

kv() { printf '  %s: "%s"\n' "$1" "$2"; }
{
  echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-db, namespace: $NS }"; echo "type: Opaque"; echo "stringData:"
  kv POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  for s in IDENTITY COMPETITION CMS ATHLETES SCHEDULE LIVE TICKETING RAFFLE CRM MESSAGING AI AUDIT; do v="PW_$s"; kv "PW_$s" "${!v}"; done
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-redis, namespace: $NS }"; echo "stringData:"
  kv REDIS_PASSWORD "$REDIS_PASSWORD"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-internal, namespace: $NS }"; echo "stringData:"
  kv INTERNAL_TOKEN_SECRET "$INTERNAL_TOKEN_SECRET"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-crypto, namespace: $NS }"; echo "stringData:"
  kv CRYPTO_KEY "$CRYPTO_KEY"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-root, namespace: $NS }"; echo "stringData:"
  kv ROOT_EMAIL "$ROOT_EMAIL"; kv ROOT_PASSWORD "$ROOT_PASSWORD"; kv ROOT_NOMBRE "$ROOT_NOMBRE"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-jwt, namespace: $NS }"; echo "stringData:"
  echo "  private.pem: |"; sed 's/^/    /' "$DIR/jwt.pem"
  if [ -n "${MINIMAX_API_KEY:-}" ]; then
    echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-ai, namespace: $NS }"; echo "stringData:"
    kv MINIMAX_API_KEY "$MINIMAX_API_KEY"
  fi
} | ssh "$KRAKEN" "sudo k3s kubectl create namespace $NS --dry-run=client -o yaml | sudo k3s kubectl apply -f - >/dev/null && sudo k3s kubectl apply -f -"
echo "Secretos aplicados en $NS (valores en $F)."
