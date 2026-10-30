#!/usr/bin/env bash
# Builds every service image of the QA overlay, ships it to kraken's containerd (no registry) and applies the
# kustomize overlay. Usage (from platform/): deploy/scripts/desplegar-qa.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"
NS="${NS:-grcup-qa}"
OVERLAY=deploy/k8s/overlays/qa

# Services = Go images listed in the overlay (all are rebuilt so every tag exists on the node).
SERVICES=$(grep -oE 'name: grcup/[a-z-]+' "$OVERLAY/kustomization.yaml" | sed 's|name: grcup/||' | grep -vE '^(web|backoffice)$' | tr '\n' ' ')
VERSION="${VERSION:-$(git rev-parse --short HEAD)}"
if ! git diff --quiet HEAD -- . || [ -n "$(git ls-files --others --exclude-standard -- .)" ]; then
  VERSION="$VERSION-wip$(date +%H%M%S)" # uncommitted changes: never reuse a commit tag for different content
fi
echo "→ versión $VERSION · servicios: $SERVICES"

make images SERVICES="$SERVICES" VERSION="$VERSION"
IMAGES=""
for s in $SERVICES; do IMAGES="$IMAGES grcup/$s:$VERSION"; done
# Angular apps (one build stage, two targets).
for app in web backoffice; do
  if grep -q "name: grcup/$app," "$OVERLAY/kustomization.yaml"; then
    target=$app; [ "$app" = web ] && target=public
    echo "→ grcup/$app:$VERSION"
    docker build -q --target "$target" -t "grcup/$app:$VERSION" web >/dev/null
    IMAGES="$IMAGES grcup/$app:$VERSION"
  fi
done

echo "→ enviando imágenes a $KRAKEN"
# shellcheck disable=SC2086
docker save $IMAGES | gzip -1 | ssh "$KRAKEN" 'gunzip | sudo k3s ctr -n k8s.io images import - >/dev/null'

echo "→ aplicando $OVERLAY"
tar -C deploy/k8s -cf - . | ssh "$KRAKEN" "set -e
tmp=\$(mktemp -d /tmp/grcup-qa-deploy.XXXXXX)
tar -C \$tmp -xf -
# quoted: a hash like 70637e9 is a number in YAML (scientific notation)
sed -i 's/newTag: TAG/newTag: \"$VERSION\"/' \$tmp/overlays/qa/kustomization.yaml
sudo k3s kubectl -n $NS delete job -l app.kubernetes.io/part-of=grcup --ignore-not-found >/dev/null
sudo k3s kubectl apply -k \$tmp/overlays/qa
# Kustomize does not prune: the generic allow-services policy was replaced by allow-<servicio> (step 15).
sudo k3s kubectl -n $NS delete networkpolicy allow-services --ignore-not-found >/dev/null
sudo k3s kubectl -n $NS rollout status statefulset/postgres --timeout=180s
for d in \$(sudo k3s kubectl -n $NS get deploy -o name); do sudo k3s kubectl -n $NS rollout status \$d --timeout=240s; done
sudo k3s kubectl -n $NS wait --for=condition=complete job --all --timeout=240s
rm -rf \$tmp"
echo "✓ desplegado $VERSION en $NS"
