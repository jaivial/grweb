#!/usr/bin/env bash
# Generates (once) and applies the Secrets of a namespace: deploy/scripts/secretos.sh <qa|prod>
# Values live only on this machine in ~/.config/grcup-<env>/ (0600) and travel to kraken over ssh stdin. Never printed.
# Production: ROOT_EMAIL is QA's unless ROOT_EMAIL is given (Jaime 15/11 20:46). Google OAuth of production: write
# GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in ~/.config/grcup-prod/secrets.env (from the vault) → Secret grcup-google.
# KEEP A COPY of ~/.config/grcup-prod/ outside this machine (CRYPTO_KEY encrypts the integrations' secrets).
set -euo pipefail
ENTORNO="${1:-}"
case "$ENTORNO" in
  qa) NS="${NS:-grcup-qa}"; DIR="${GRCUP_QA_DIR:-$HOME/.config/grcup-qa}" ;;
  prod) NS="${NS:-grcup}"; DIR="${GRCUP_PROD_DIR:-$HOME/.config/grcup-prod}" ;;
  *) echo "uso: $0 <qa|prod>" >&2; exit 2 ;;
esac
F="$DIR/secrets.env"
KRAKEN="${KRAKEN:-kraken}"
umask 077
mkdir -p "$DIR"
touch "$F"

gen() { grep -q "^$1=" "$F" || echo "$1=$(openssl rand -hex "${2:-24}")" >>"$F"; }
gen POSTGRES_PASSWORD
for s in IDENTITY COMPETITION CMS ATHLETES SCHEDULE LIVE TICKETING RAFFLE CRM MESSAGING AI AUDIT FANS CHAT DONACIONES PATROCINIO JUEGOS OPENLIFTER; do gen "PW_$s"; done
gen REDIS_PASSWORD 32
gen INTERNAL_TOKEN_SECRET 32
# Shared by web (SSR) and gateway: the SSR API calls get their own rate-limit bucket.
gen SSR_SECRET 32
gen CRYPTO_KEY 32
gen ROOT_PASSWORD 12
# evo-weai (WhatsApp): the global key messaging sends as «apikey» and the key that encrypts the state at rest.
# The same WEAI_API_KEY goes in the «whatsapp» integration of the competition («Sistema e integraciones»).
gen WEAI_API_KEY 32
gen WEAI_DATA_KEY 32
if [ "$ENTORNO" = qa ]; then
  grep -q '^ROOT_EMAIL=' "$F" || echo "ROOT_EMAIL=${ROOT_EMAIL:-jaimebillanueba99@gmail.com}" >>"$F"
  grep -q '^ROOT_NOMBRE=' "$F" || echo 'ROOT_NOMBRE="Jaime (QA)"' >>"$F"
else
  if ! grep -q '^ROOT_EMAIL=' "$F"; then
    qa_root=$(grep -E '^ROOT_EMAIL=' "${GRCUP_QA_DIR:-$HOME/.config/grcup-qa}/secrets.env" 2>/dev/null | head -1 | cut -d= -f2- || true)
    r="${ROOT_EMAIL:-$qa_root}"
    [ -n "$r" ] || { echo "producción: falta ROOT_EMAIL (ni en el entorno ni en el secrets.env de QA)" >&2; exit 1; }
    echo "ROOT_EMAIL=$r" >>"$F"
  fi
  grep -q '^ROOT_NOMBRE=' "$F" || echo "ROOT_NOMBRE=\"${ROOT_NOMBRE:-Jaime}\"" >>"$F"
  grep -q '^GOOGLE_CLIENT_ID=' "$F" || printf '# Google OAuth client of PRODUCTION (vault; not the QA client)\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n' >>"$F"
fi
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
  for s in IDENTITY COMPETITION CMS ATHLETES SCHEDULE LIVE TICKETING RAFFLE CRM MESSAGING AI AUDIT FANS CHAT DONACIONES PATROCINIO JUEGOS OPENLIFTER; do v="PW_$s"; kv "PW_$s" "${!v}"; done
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-redis, namespace: $NS }"; echo "stringData:"
  kv REDIS_PASSWORD "$REDIS_PASSWORD"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-internal, namespace: $NS }"; echo "stringData:"
  kv INTERNAL_TOKEN_SECRET "$INTERNAL_TOKEN_SECRET"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-ssr, namespace: $NS }"; echo "stringData:"
  kv SSR_SECRET "$SSR_SECRET"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-crypto, namespace: $NS }"; echo "stringData:"
  kv CRYPTO_KEY "$CRYPTO_KEY"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-weai, namespace: $NS }"; echo "stringData:"
  kv WEAI_API_KEY "$WEAI_API_KEY"; kv WEAI_DATA_KEY "$WEAI_DATA_KEY"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-root, namespace: $NS }"; echo "stringData:"
  kv ROOT_EMAIL "$ROOT_EMAIL"; kv ROOT_PASSWORD "$ROOT_PASSWORD"; kv ROOT_NOMBRE "$ROOT_NOMBRE"
  echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-jwt, namespace: $NS }"; echo "stringData:"
  echo "  private.pem: |"; sed 's/^/    /' "$DIR/jwt.pem"
  if [ "$ENTORNO" = prod ] && [ -n "${GOOGLE_CLIENT_ID:-}" ] && [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
    echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-google, namespace: $NS }"; echo "stringData:"
    kv GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"; kv GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
  fi
  if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASSWORD:-}" ]; then
    echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-smtp, namespace: $NS }"; echo "stringData:"
    kv SMTP_USER "$SMTP_USER"; kv SMTP_PASSWORD "$SMTP_PASSWORD"
  fi
  if [ -n "${MINIMAX_API_KEY:-}" ]; then
    echo "---"; echo "apiVersion: v1"; echo "kind: Secret"; echo "metadata: { name: grcup-ai, namespace: $NS }"; echo "stringData:"
    kv MINIMAX_API_KEY "$MINIMAX_API_KEY"
  fi
} | ssh "$KRAKEN" "sudo k3s kubectl create namespace $NS --dry-run=client -o yaml | sudo k3s kubectl apply -f - >/dev/null && sudo k3s kubectl apply -f -"
echo "Secretos aplicados en $NS (valores en $F)."
