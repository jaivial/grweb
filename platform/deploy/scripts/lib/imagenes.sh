#!/usr/bin/env bash
# Construcción e importación de imágenes, compartida por desplegar.sh (prod) y desplegar-bg.sh (QA blue/green).
# Se carga con: . "$(dirname "$0")/lib/imagenes.sh" (desde platform/).
KRAKEN="${KRAKEN:-kraken}"

# Versión de build: el commit corto; con cambios sin commit, un sufijo de hora (nunca se reusa un tag para otro contenido).
version_build() {
  local v="${VERSION:-$(git rev-parse --short HEAD)}"
  if ! git diff --quiet HEAD -- . || [ -n "$(git ls-files --others --exclude-standard -- .)" ]; then
    v="$v-wip$(date +%H%M%S)"
  fi
  printf '%s\n' "$v"
}

# Nombres de imagen (sin grcup/) que listan los kustomization: servicios Go + web + backoffice.
imagenes_de() { grep -ohE 'name: grcup/[a-z-]+' "$@" | sed 's|name: grcup/||' | sort -u; }

# construir_imagenes <versión> <kustomization.yaml...>: make images (servicios Go) y docker build de las apps
# Angular. Todo bajo cgrun. Imprime las referencias grcup/<nombre>:<versión> construidas.
construir_imagenes() {
  local version=$1 todas servicios app target
  shift
  todas=$(imagenes_de "$@")
  servicios=$(printf '%s\n' "$todas" | grep -vxE 'web|backoffice' | tr '\n' ' ')
  echo "→ versión $version · servicios: $servicios" >&2
  # shellcheck disable=SC2086
  cgrun -m 10G -n "imagenes-go-$version" -- make images SERVICES="$servicios" VERSION="$version" >&2
  for app in web backoffice; do
    if printf '%s\n' "$todas" | grep -qx "$app"; then
      target=$app; [ "$app" = web ] && target=public
      echo "→ grcup/$app:$version" >&2
      cgrun -m 10G -n "imagen-$app-$version" -- docker build -q --target "$target" -t "grcup/$app:$version" web >/dev/null >&2
    fi
  done
  for s in $todas; do printf 'grcup/%s:%s\n' "$s" "$version"; done
}

# importar_imagenes <referencia...>: docker save → containerd de kraken (sin registry).
importar_imagenes() {
  echo "→ enviando imágenes a $KRAKEN"
  docker save "$@" | gzip -1 | ssh "$KRAKEN" 'gunzip | sudo k3s ctr -n k8s.io images import - >/dev/null'
}
