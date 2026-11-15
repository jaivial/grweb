#!/usr/bin/env bash
# Runs the ETL of the previous web (MySQL) into the platform, service by service and in order: competition (maps
# the old competitions to editions) → identity → athletes → raffle → live → cms (redirects of the old routes); crm
# receives the contacts through the usual events. Each step is a one-shot Job built from the service's own
# Deployment (same image, database and secrets) with «etl-mysql» and the DSN of the Secret grcup-legado; it stops
# at the first failure. Every step is one transaction and idempotent: running it again only adds what is missing.
#
# Usage (from platform/): deploy/scripts/migrar-legado.sh [--dry-run] [--mapa 3=-,2=grcup-etl] [--etiqueta "…"] [--web slug]
#   --dry-run   report only (every step rolls back); run it first and read the report
#   --mapa      old competition id → edition slug («-» = do not migrate), over the default rule
#   --etiqueta  «publicado por» of imported results (default «Migración de la web anterior»)
#   --web       edition of the public web that receives the redirects (default: the most recent one)
# Env: NS (grcup-qa; production grcup), KRAKEN (kraken), SECRETO (grcup-legado), PASOS (to run only some services)
set -euo pipefail
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"
NS="${NS:-grcup-qa}"
SECRETO="${SECRETO:-grcup-legado}"
PASOS="${PASOS:-competition identity athletes raffle live cms}"
K="sudo k3s kubectl -n $NS"

ssh "$KRAKEN" "$K get secret $SECRETO >/dev/null" || { echo "✗ falta el Secret $SECRETO con MYSQL_DSN (QA: deploy/scripts/legado-qa.sh)"; exit 1; }

for svc in $PASOS; do
  echo "━━ $svc"
  # the report is in the log lines of «etl-mysql»; tarea.sh exits with the Job's result
  if NS="$NS" KRAKEN="$KRAKEN" "$(dirname "$0")/tarea.sh" --nombre "etl-$svc" --parte grcup-legado --secreto "MYSQL_DSN=$SECRETO:MYSQL_DSN" "$svc" etl-mysql "$@" | python3 -c '
import json, sys
for l in sys.stdin:
    try:
        d = json.loads(l)
    except ValueError:
        print("  " + l.rstrip()); continue
    extra = {k: v for k, v in d.items() if k not in ("time", "svc", "version", "level", "msg")}
    if d.get("msg", "").startswith("etl-mysql"):
        for k in ("modo", "leidos", "escritos", "omitidos", "nota"):
            if extra.get(k):
                print(f"  {k:9} {extra[k]}")
    elif d.get("level") in ("WARN", "ERROR"):
        print("  %s: %s %s" % (d.get("level"), d.get("msg"), extra))
'; then
    echo "  ✓ $svc"
  else
    echo "✗ $svc no terminó bien: se para aquí; los pasos anteriores quedan aplicados y son idempotentes"; exit 1
  fi
done
echo "✓ ETL terminado ($PASOS)"
