#!/usr/bin/env bash
# Creates or updates the QA DNS records in Cloudflare (zone menustudioai.com): A → kraken's tailnet IP, DNS only.
# Credentials: CLOUDFLARE_USER and CLOUDFLARE_API_KEY (global key) from the environment or ~/.env. Never printed.
set -euo pipefail
[ -f "$HOME/.env" ] && { set -a; . "$HOME/.env"; set +a; }
: "${CLOUDFLARE_USER:?falta CLOUDFLARE_USER}" "${CLOUDFLARE_API_KEY:?falta CLOUDFLARE_API_KEY}"
ZONE_NAME="${ZONE_NAME:-menustudioai.com}"
TARGET_IP="${TARGET_IP:-100.66.235.72}" # kraken-server (tailnet)
NAMES="${NAMES:-grcup-qa grcup-qa-bo grcup-qa-api grcup-qa-mail}"

export ZONE_NAME TARGET_IP NAMES
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
           "comment": "GR Cup platform QA (tailnet only) · platform/deploy/scripts/dns-cloudflare.sh"}
    found = call("GET", f"/zones/{zone}/dns_records?type=A&name={fqdn}")
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
