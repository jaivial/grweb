#!/usr/bin/env bash
# Builds every service image of an overlay, ships it to kraken's containerd (no registry) and applies the kustomize
# overlay. Usage (from platform/):
#   deploy/scripts/desplegar.sh prod --confirmo-produccion
# QA is blue/green since the colores migration: deploy/scripts/desplegar-bg.sh qa (this script hands QA over to it).
# Production refuses to deploy while overlays/prod/config.yaml says DOMINIOS_CONFIRMADOS: "no", or a Secret it needs
# is missing in the namespace (deploy/scripts/secretos.sh prod), or without the explicit flag. QA and production are
# never deployed by the same run (separate namespaces, overlays and Secrets).
set -euo pipefail
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"
ENTORNO="${1:-}"
case "$ENTORNO" in
  qa) exec deploy/scripts/desplegar-bg.sh qa "${@:2}" ;;
  prod) NS="${NS:-grcup}" ;;
  *) echo "uso: $0 <qa|prod> [--confirmo-produccion]" >&2; exit 2 ;;
esac
OVERLAY=deploy/k8s/overlays/$ENTORNO

if [ "$ENTORNO" = prod ]; then
  [ "${2:-}" = "--confirmo-produccion" ] || { echo "✗ producción necesita --confirmo-produccion (y la aprobación del organizador)" >&2; exit 1; }
  grep -qE '^\s*DOMINIOS_CONFIRMADOS: "si"' "$OVERLAY/config.yaml" || { echo "✗ los dominios de $OVERLAY/config.yaml no están confirmados (DOMINIOS_CONFIRMADOS)" >&2; exit 1; }
  # Mail goes through Google OAuth (Secret grcup-google, optional until the client exists): the legacy SMTP is not
  # required (Jaime 15/11 20:46).
  faltan=$(ssh "$KRAKEN" "for s in grcup-db grcup-redis grcup-internal grcup-crypto grcup-root grcup-jwt grcup-weai grcup-ssr; do sudo k3s kubectl -n $NS get secret \$s >/dev/null 2>&1 || echo \$s; done")
  [ -z "$faltan" ] || { echo "✗ faltan Secrets en $NS: $faltan (deploy/scripts/secretos.sh prod)" >&2; exit 1; }
fi

# shellcheck source=lib/imagenes.sh
. deploy/scripts/lib/imagenes.sh
VERSION=$(version_build)
echo "→ versión $VERSION"
mapfile -t IMAGENES < <(construir_imagenes "$VERSION" "$OVERLAY/kustomization.yaml")
importar_imagenes "${IMAGENES[@]}"

echo "→ aplicando $OVERLAY"
tar -C deploy/k8s -cf - . | ssh "$KRAKEN" "set -e
tmp=\$(mktemp -d /tmp/grcup-$ENTORNO-deploy.XXXXXX)
tar -C \$tmp -xf -
# quoted: a hash like 70637e9 is a number in YAML (scientific notation)
sed -i 's/newTag: TAG/newTag: \"$VERSION\"/' \$tmp/overlays/$ENTORNO/kustomization.yaml
sudo k3s kubectl -n $NS delete job -l app.kubernetes.io/part-of=grcup --ignore-not-found >/dev/null
sudo k3s kubectl apply -k \$tmp/overlays/$ENTORNO
# Kustomize does not prune: the generic allow-services policy was replaced by allow-<servicio> (step 15).
sudo k3s kubectl -n $NS delete networkpolicy allow-services --ignore-not-found >/dev/null
sudo k3s kubectl -n $NS rollout status statefulset/postgres --timeout=180s
# databases of services added after PostgreSQL was initialized (initdb only runs on an empty data directory): the
# same idempotent script, read from the ConfigMap just applied (the mounted copy can lag behind), with the passwords
# of the CURRENT grcup-db Secret exported on stdin (never on the command line): the running container still has the
# env it started with, so a service added since then would have no password. New pods may restart until their
# database exists; the rollout below waits for them.
{ sudo k3s kubectl -n $NS get secret grcup-db -o go-template='{{range \$k, \$v := .data}}{{if eq (slice \$k 0 3) \"PW_\"}}export {{\$k}}={{\$v | base64decode}}{{\"\\n\"}}{{end}}{{end}}'; sudo k3s kubectl -n $NS get configmap postgres-initdb -o jsonpath='{.data.01-databases\\.sh}'; } | sudo k3s kubectl -n $NS exec -i statefulset/postgres -- sh -s
for d in \$(sudo k3s kubectl -n $NS get deploy -o name); do sudo k3s kubectl -n $NS rollout status \$d --timeout=240s; done
# only the deploy's own Jobs (the backup CronJob's Jobs do not carry the label: a failing off-node copy must not
# block a deploy)
sudo k3s kubectl -n $NS wait --for=condition=complete job -l app.kubernetes.io/part-of=grcup --timeout=240s
rm -rf \$tmp"
echo "✓ desplegado $VERSION en $NS"
