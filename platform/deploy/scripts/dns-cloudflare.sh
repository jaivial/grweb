#!/usr/bin/env bash
# Creates or updates the DNS records of an environment in Cloudflare (zone menustudioai.com), DNS only (no proxy):
#   deploy/scripts/dns-cloudflare.sh [qa]      grcup-qa, -bo, -api, -mail → kraken's tailnet IP (QA is tailnet-only)
#   deploy/scripts/dns-cloudflare.sh prod      grcup, grcup-bo, grcup-api → kraken's public IP (nginx-prod.sh instalar
#                                              runs it once the site exists)
#   deploy/scripts/dns-cloudflare.sh <env> --listar   show the records without changing them
# Credentials: CLOUDFLARE_USER and CLOUDFLARE_API_KEY (global key) from the environment or ~/.env. Never printed.
set -euo pipefail
[ -f "$HOME/.env" ] && { set -a; . "$HOME/.env"; set +a; }
: "${CLOUDFLARE_USER:?falta CLOUDFLARE_USER}" "${CLOUDFLARE_API_KEY:?falta CLOUDFLARE_API_KEY}"
ENTORNO="${1:-qa}"
LISTAR="${2:-}"
ZONE_NAME="${ZONE_NAME:-menustudioai.com}"
case "$ENTORNO" in
  qa) TARGET_IP="${TARGET_IP:-100.66.235.72}"; NAMES="${NAMES:-grcup-qa grcup-qa-bo grcup-qa-api grcup-qa-mail}"; COMMENT="GR Cup platform QA (tailnet only)" ;;
  prod) TARGET_IP="${TARGET_IP:-65.109.100.94}"; NAMES="${NAMES:-grcup grcup-bo grcup-api}"; COMMENT="GR Cup platform production" ;;
  *) echo "uso: $0 [qa|prod] [--listar]" >&2; exit 2 ;;
esac

export ZONE_NAME TARGET_IP NAMES COMMENT LISTAR
python3 - <<'PY'
import json, os, urllib.request

H = {"X-Auth-Email": os.environ["CLOUDFLARE_USER"], "X-Auth-Key": os.environ["CLOUDFLARE_API_KEY"], "Content-Type": "application/json"}
API = "https://api.cloudflare.com/client/v4"

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers=H, data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if not d.get("success"):
        raise SystemExit(f"Cloudflare: {d.get('errors')}")
    return d["result"]

zone = call("GET", f"/zones?name={os.environ['ZONE_NAME']}")[0]["id"]
for name in os.environ["NAMES"].split():
    fqdn = f"{name}.{os.environ['ZONE_NAME']}"
    rec = {"type": "A", "name": fqdn, "content": os.environ["TARGET_IP"], "ttl": 300, "proxied": False,
           "comment": os.environ["COMMENT"] + " · platform/deploy/scripts/dns-cloudflare.sh"}
    found = call("GET", f"/zones/{zone}/dns_records?name={fqdn}")
    if os.environ["LISTAR"] == "--listar":
        print(f"{fqdn}: " + (", ".join(f"{r['type']} {r['content']}{' (proxy)' if r.get('proxied') else ''}" for r in found) or "sin registros"))
        continue
    if any(r["type"] != "A" for r in found):
        raise SystemExit(f"{fqdn} ya tiene registros de otro tipo ({[r['type'] for r in found]}): no se toca")
    if found:
        r = found[0]
        if r["content"] == rec["content"] and not r["proxied"]:
            print(f"= {fqdn} → {rec['content']}")
            continue
        call("PUT", f"/zones/{zone}/dns_records/{r['id']}", rec)
        print(f"~ {fqdn} → {rec['content']}")
    else:
        call("POST", f"/zones/{zone}/dns_records", rec)
        print(f"+ {fqdn} → {rec['content']}")
PY
