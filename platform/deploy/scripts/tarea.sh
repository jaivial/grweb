#!/usr/bin/env bash
# Runs a one-shot command of a service as a Job built from its own Deployment (same image, database, secrets and
# network policy label), waits for it, prints its log and exits with its result.
#
# Usage (from platform/): deploy/scripts/tarea.sh [opciones] <servicio> <comando> [args…]
#   --entorno qa|prod                 namespace grcup-qa (default) or grcup (or NS=…)
#   --secreto VAR=SECRET:CLAVE        adds an env var from a Secret (repeatable), e.g. MYSQL_DSN=grcup-legado:MYSQL_DSN
#   --nombre NOMBRE                   Job name (default tarea-<servicio>); --parte PARTE: app.kubernetes.io/part-of
# Examples: tarea.sh cms seed-grcup · tarea.sh --entorno prod identity enlace-acceso root@… /grcup/inicio
set -euo pipefail
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"
NS="${NS:-grcup-qa}"
NOMBRE=""; PARTE=grcup-tarea; SECRETOS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --entorno) case "$2" in qa) NS=grcup-qa ;; prod) NS=grcup ;; *) echo "entorno desconocido: $2" >&2; exit 2 ;; esac; shift 2 ;;
    --secreto) SECRETOS+=("$2"); shift 2 ;;
    --nombre) NOMBRE="$2"; shift 2 ;;
    --parte) PARTE="$2"; shift 2 ;;
    --) shift; break ;;
    -*) echo "opción desconocida: $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
[ $# -ge 2 ] || { echo "uso: $0 [--entorno qa|prod] [--secreto VAR=SECRET:CLAVE] <servicio> <comando> [args…]" >&2; exit 2; }
SVC="$1"; shift
NOMBRE="${NOMBRE:-tarea-$SVC}"
K="sudo k3s kubectl -n $NS"
ARGS_JSON=$(python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "$@")
SEC_JSON=$(python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "${SECRETOS[@]+"${SECRETOS[@]}"}")

ssh "$KRAKEN" "$K get deploy/$SVC -o json" | python3 -c '
import json, sys
svc, nombre, parte, args, secretos = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4]), json.loads(sys.argv[5])
d = json.load(sys.stdin)
t = d["spec"]["template"]
pod, c = t["spec"], t["spec"]["containers"][0]
c["args"] = args
for k in ("livenessProbe", "readinessProbe", "startupProbe", "lifecycle", "ports"):
    c.pop(k, None)
for s in secretos:
    var, ref = s.split("=", 1)
    secret, clave = ref.split(":", 1)
    c["env"] = [e for e in c.get("env", []) if e["name"] != var] + [{"name": var, "valueFrom": {"secretKeyRef": {"name": secret, "key": clave}}}]
pod.pop("initContainers", None)  # the Deployment already migrated its database
pod["restartPolicy"] = "Never"
labels = {k: v for k, v in t["metadata"].get("labels", {}).items() if k != "pod-template-hash"}
# not the service name: the Service and the HPA must not pick up this pod; grcup.dev/servicio keeps its network policy
labels.update({"app.kubernetes.io/name": nombre, "app.kubernetes.io/part-of": parte, "grcup.dev/servicio": svc})
job = {"apiVersion": "batch/v1", "kind": "Job", "metadata": {"name": nombre, "labels": {"app.kubernetes.io/part-of": parte}},
       "spec": {"backoffLimit": 0, "ttlSecondsAfterFinished": 86400,
                "template": {"metadata": {"labels": labels, "annotations": t["metadata"].get("annotations", {})}, "spec": pod}}}
print(json.dumps(job))
' "$SVC" "$NOMBRE" "$PARTE" "$ARGS_JSON" "$SEC_JSON" | ssh "$KRAKEN" "$K delete job $NOMBRE --ignore-not-found >/dev/null; $K create -f - >/dev/null"

estado=""
for _ in $(seq 1 450); do
  estado=$(ssh "$KRAKEN" "$K get job $NOMBRE -o jsonpath='{.status.succeeded}/{.status.failed}'")
  case "$estado" in 1/*|*/1) break ;; esac
  sleep 2
done
ssh "$KRAKEN" "$K logs job/$NOMBRE --tail=500" || true
case "$estado" in 1/*) exit 0 ;; *) echo "✗ $NOMBRE no terminó bien (estado «$estado»)" >&2; exit 1 ;; esac
