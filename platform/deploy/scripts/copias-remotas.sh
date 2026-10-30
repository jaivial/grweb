#!/usr/bin/env bash
# Off-node encrypted copies of the nightly backups (CronJob copias-postgres, container «fuera-del-nodo»).
#
#   deploy/scripts/copias-remotas.sh <qa|prod>                 create/update the Secret grcup-copias-remotas
#   deploy/scripts/copias-remotas.sh <qa|prod> --listar        list the copies off the node (decrypted names)
#   deploy/scripts/copias-remotas.sh <qa|prod> --traer FECHA   bring one day back to the node, decrypted and verified,
#                                                              into <data dir>/copias/remota-FECHA/ (then pg_restore)
#   deploy/scripts/copias-remotas.sh <qa|prod> --borrar        remove the Secret (copies stay on the node only)
#
# Storage: any rclone remote, normally S3-compatible (Cloudflare R2, Backblaze B2, Wasabi, AWS…), described in
# ~/.config/grcup-<env>/copias-remotas.env (0600; a template is written the first time). Encryption: rclone crypt
# (file contents and names) with two random passwords generated there. KEEP A COPY OF THAT FILE OUTSIDE THIS MACHINE:
# without its CIFRADO_* values the copies cannot be decrypted. Values travel over ssh stdin and are never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENTORNO="${1:-}"; ACCION="${2:-}"; FECHA="${3:-}"
case "$ENTORNO" in
  qa) NS="${NS:-grcup-qa}"; DATOS=/var/lib/grcup-qa ;;
  prod) NS="${NS:-grcup}"; DATOS=/var/lib/grcup ;;
  *) echo "uso: $0 <qa|prod> [--listar | --traer AAAA-MM-DD | --borrar]" >&2; exit 2 ;;
esac
KRAKEN="${KRAKEN:-kraken}"
K="sudo k3s kubectl -n $NS"
IMAGEN=rclone/rclone:1.69.1
F="${GRCUP_DIR:-$HOME/.config/grcup-$ENTORNO}/copias-remotas.env"

# A one-shot pod with the Secret and the node's copies folder (read-only except for --traer's target).
pod() { # pod <nombre> <script>
  local overrides
  overrides=$(python3 -c '
import json, sys
nombre, datos, imagen, script = sys.argv[1:5]
print(json.dumps({"spec": {"restartPolicy": "Never", "automountServiceAccountToken": False,
  "securityContext": {"seccompProfile": {"type": "RuntimeDefault"}},
  "containers": [{"name": nombre, "image": imagen, "command": ["sh", "-c", script],
    "envFrom": [{"secretRef": {"name": "grcup-copias-remotas"}}],
    "env": [{"name": "RCLONE_CONFIG", "value": "/tmp/rclone.conf"}, {"name": "RCLONE_CACHE_DIR", "value": "/tmp/rclone"}],
    "securityContext": {"allowPrivilegeEscalation": False, "capabilities": {"drop": ["ALL"]}},
    "resources": {"requests": {"cpu": "20m", "memory": "64Mi"}, "limits": {"cpu": "500m", "memory": "256Mi"}},
    "volumeMounts": [{"name": "copias", "mountPath": "/copias"}, {"name": "tmp", "mountPath": "/tmp"}]}],
  "volumes": [{"name": "copias", "hostPath": {"path": datos + "/copias", "type": "Directory"}}, {"name": "tmp", "emptyDir": {}}]}}))
' "$1" "$DATOS" "$IMAGEN" "$2")
  # the label lets the pod reach nothing it should not (no policy admits it) while it can still go out to the storage
  ssh "$KRAKEN" "$K delete pod $1 --ignore-not-found >/dev/null; $K run $1 --image=$IMAGEN --restart=Never --labels=app.kubernetes.io/part-of=grcup-copias --overrides='$overrides' >/dev/null
    $K wait --for=jsonpath='{.status.phase}'=Succeeded pod/$1 --timeout=900s >/dev/null 2>&1 || true
    $K logs $1; fase=\$($K get pod $1 -o jsonpath='{.status.phase}'); $K delete pod $1 --wait=false >/dev/null; [ \"\$fase\" = Succeeded ]"
}

case "$ACCION" in
  --borrar)
    ssh "$KRAKEN" "$K delete secret grcup-copias-remotas --ignore-not-found"
    exit 0 ;;
  --listar)
    pod copias-remotas-listar 'rclone lsf --dirs-only cifrado: && echo "--- medios" && rclone size cifrado:medios && echo "--- total" && rclone size cifrado:'
    exit 0 ;;
  --traer)
    [[ "$FECHA" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "falta la fecha (AAAA-MM-DD)" >&2; exit 2; }
    pod copias-remotas-traer "set -eu; umask 077; d=/copias/remota-$FECHA; rm -rf \$d; rclone copy cifrado:$FECHA \$d && rclone cryptcheck \$d cifrado:$FECHA && cd \$d && sha256sum -c SHA256SUMS && echo \"traída a $DATOS/copias/remota-$FECHA (descifrada y verificada)\""
    exit 0 ;;
  "") ;;
  *) echo "acción desconocida: $ACCION" >&2; exit 2 ;;
esac

umask 077
mkdir -p "$(dirname "$F")"
if [ ! -f "$F" ]; then
  cat > "$F" <<'EOF'
# Off-node copies of the GR Cup backups (deploy/scripts/copias-remotas.sh). Fill in the storage and run the script
# again. Any rclone remote works: these are the S3 settings (Cloudflare R2: PROVIDER=Cloudflare and the account's
# r2.cloudflarestorage.com endpoint; Backblaze B2: PROVIDER=Other and its S3 endpoint).
REMOTO_TYPE=s3
REMOTO_PROVIDER=
REMOTO_ENDPOINT=
REMOTO_REGION=auto
REMOTO_ACCESS_KEY_ID=
REMOTO_SECRET_ACCESS_KEY=
# bucket and folder, e.g. grcup-copias/prod
DESTINO=
EOF
  echo "Plantilla creada en $F: rellena el almacenamiento y vuelve a ejecutar." >&2
  exit 1
fi
# The encryption passwords are generated once and must never change (old copies use them).
grep -q '^CIFRADO_PASSWORD=' "$F" || echo "CIFRADO_PASSWORD=$(openssl rand -hex 32)" >>"$F"
grep -q '^CIFRADO_SALT=' "$F" || echo "CIFRADO_SALT=$(openssl rand -hex 32)" >>"$F"
set -a
# shellcheck disable=SC1090
. "$F"
set +a
for v in REMOTO_TYPE DESTINO; do [ -n "${!v:-}" ] || { echo "falta $v en $F" >&2; exit 1; }; done

# rclone keeps crypt passwords «obscured» in its configuration (read from stdin: never on a command line).
obscure() { docker run --rm -i --entrypoint rclone "$IMAGEN" obscure - ; }
P1=$(printf '%s' "$CIFRADO_PASSWORD" | obscure)
P2=$(printf '%s' "$CIFRADO_SALT" | obscure)

P1="$P1" P2="$P2" NS="$NS" python3 -c '
import json, os
d = {k[7:]: v for k, v in os.environ.items() if k.startswith("REMOTO_") and v}
data = {"RCLONE_CONFIG_REMOTO_" + k: v for k, v in d.items()}
data.update({"RCLONE_CONFIG_CIFRADO_TYPE": "crypt", "RCLONE_CONFIG_CIFRADO_REMOTE": "remoto:" + os.environ["DESTINO"],
             "RCLONE_CONFIG_CIFRADO_FILENAME_ENCRYPTION": "standard", "RCLONE_CONFIG_CIFRADO_DIRECTORY_NAME_ENCRYPTION": "true",
             "RCLONE_CONFIG_CIFRADO_PASSWORD": os.environ["P1"], "RCLONE_CONFIG_CIFRADO_PASSWORD2": os.environ["P2"]})
print(json.dumps({"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
                  "metadata": {"name": "grcup-copias-remotas", "namespace": os.environ["NS"], "labels": {"app.kubernetes.io/part-of": "grcup"}},
                  "stringData": data}))
' | ssh "$KRAKEN" "$K apply -f - >/dev/null"
echo "Secret grcup-copias-remotas aplicado en $NS (destino ${REMOTO_TYPE}:${DESTINO}, cifrado). Guarda una copia de $F fuera de esta máquina."
