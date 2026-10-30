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
# Env: NS (grcup-qa), KRAKEN (kraken), SECRETO (grcup-legado), PASOS (to run only some services)
set -euo pipefail
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"
NS="${NS:-grcup-qa}"
SECRETO="${SECRETO:-grcup-legado}"
PASOS="${PASOS:-competition identity athletes raffle live cms}"
K="sudo k3s kubectl -n $NS"
ARGS_JSON=$(python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "$@")

ssh "$KRAKEN" "$K get secret $SECRETO >/dev/null" || { echo "✗ falta el Secret $SECRETO con MYSQL_DSN (QA: deploy/scripts/legado-qa.sh)"; exit 1; }

for svc in $PASOS; do
  echo "━━ $svc"
  ssh "$KRAKEN" "$K get deploy/$svc -o json" | python3 -c '
import json, sys
svc, secreto, args = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
d = json.load(sys.stdin)
t = d["spec"]["template"]
pod, c = t["spec"], t["spec"]["containers"][0]
c["args"] = ["etl-mysql"] + args
for k in ("livenessProbe", "readinessProbe", "startupProbe", "lifecycle", "ports"):
    c.pop(k, None)
c["env"] = [e for e in c.get("env", []) if e["name"] != "MYSQL_DSN"] + [{"name": "MYSQL_DSN", "valueFrom": {"secretKeyRef": {"name": secreto, "key": "MYSQL_DSN"}}}]
pod.pop("initContainers", None)  # the Deployment already migrated its database (the ETL migrates again, idempotently)
pod["restartPolicy"] = "Never"
labels = {k: v for k, v in t["metadata"].get("labels", {}).items() if k != "pod-template-hash"}
# not the service name: the Service and the HPA must not pick up this pod; grcup.dev/servicio keeps its network policy
labels.update({"app.kubernetes.io/name": "etl-" + svc, "app.kubernetes.io/part-of": "grcup-legado", "grcup.dev/servicio": svc, "grcup.dev/db": "true"})
job = {"apiVersion": "batch/v1", "kind": "Job",
       "metadata": {"name": "etl-" + svc, "labels": {"app.kubernetes.io/part-of": "grcup-legado"}},
       "spec": {"backoffLimit": 0, "ttlSecondsAfterFinished": 86400,
                "template": {"metadata": {"labels": labels, "annotations": t["metadata"].get("annotations", {})}, "spec": pod}}}
print(json.dumps(job))
' "$svc" "$SECRETO" "$ARGS_JSON" > /tmp/etl-job-$svc.json
  ssh "$KRAKEN" "$K delete job etl-$svc --ignore-not-found >/dev/null; $K create -f - >/dev/null" < /tmp/etl-job-$svc.json
  rm -f /tmp/etl-job-$svc.json
  estado=""
  for _ in $(seq 1 300); do
    estado=$(ssh "$KRAKEN" "$K get job etl-$svc -o jsonpath='{.status.succeeded}/{.status.failed}'")
    case "$estado" in 1/*) break ;; */1) break ;; esac
    sleep 2
  done
  ssh "$KRAKEN" "$K logs job/etl-$svc --tail=200" | python3 -c '
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
        print(f"  {d.get(\"level\")}: {d.get(\"msg\")} {extra}")
'
  case "$estado" in
    1/*) echo "  ✓ $svc" ;;
    *) echo "✗ $svc no terminó bien (estado $estado): se para aquí; los pasos anteriores quedan aplicados y son idempotentes"; exit 1 ;;
  esac
done
echo "✓ ETL terminado ($PASOS)"
