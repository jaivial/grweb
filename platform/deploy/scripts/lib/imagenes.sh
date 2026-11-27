#!/usr/bin/env bash
# Construcción e importación de imágenes, compartida por desplegar.sh (prod, una pila), desplegar-bg.sh y
# instalar-bg.sh (blue/green). Se carga con: . "$(dirname "$0")/lib/imagenes.sh" (desde platform/).
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

# construir_lista <versión> <nombres...>: make images (servicios Go) y docker build de web/backoffice si están en la
# lista. Todo bajo cgrun. No importa nada.
construir_lista() {
  local version=$1 servicios app target
  shift
  servicios=$(printf '%s\n' "$@" | grep -vxE 'web|backoffice' | tr '\n' ' ' || true)
  if [ -n "${servicios// /}" ]; then
    echo "→ versión $version · servicios: $servicios" >&2
    # shellcheck disable=SC2086
    cgrun -m 10G -n "imagenes-go-$version" -- make images SERVICES="$servicios" VERSION="$version" >&2
  fi
  for app in web backoffice; do
    if printf '%s\n' "$@" | grep -qx "$app"; then
      target=$app; [ "$app" = web ] && target=public
      echo "→ grcup/$app:$version" >&2
      cgrun -m 10G -n "imagen-$app-$version" -- docker build -q --target "$target" -t "grcup/$app:$version" web >/dev/null >&2
    fi
  done
}

# importar_imagenes <referencia...>: docker save → containerd de kraken (sin registry).
importar_imagenes() {
  [ "$#" -gt 0 ] || return 0
  echo "→ enviando $# imágenes a $KRAKEN"
  docker save "$@" | gzip -1 | ssh "$KRAKEN" 'gunzip | sudo k3s ctr -n k8s.io images import - >/dev/null'
}

# construir_imagenes <versión> <kustomization.yaml...>: build de todo lo que listan los kustomization y su importación
# (desplegar.sh prod). Imprime las referencias grcup/<nombre>:<versión>.
construir_imagenes() {
  local version=$1 todas
  shift
  todas=$(imagenes_de "$@")
  # shellcheck disable=SC2086
  construir_lista "$version" $todas
  for s in $todas; do printf 'grcup/%s:%s\n' "$s" "$version"; done
}

# preparar_imagenes <versión> <kustomization.yaml...>: como construir_imagenes, pero SOLO construye e importa las que
# no están ya en el containerd de kraken (k3s ctr images ls). Un tag es un commit: si existe, es el mismo contenido.
# Imprime las referencias de todas.
preparar_imagenes() {
  local version=$1 todas faltan="" presentes s
  shift
  todas=$(imagenes_de "$@")
  presentes=$(ssh "$KRAKEN" "sudo k3s ctr -n k8s.io images ls -q" || true)
  for s in $todas; do
    if printf '%s\n' "$presentes" | grep -qx "docker.io/grcup/$s:$version"; then
      echo "→ grcup/$s:$version ya está en kraken: sin build" >&2
    else
      faltan="$faltan $s"
    fi
  done
  if [ -n "${faltan// /}" ]; then
    # shellcheck disable=SC2086
    construir_lista "$version" $faltan
    # shellcheck disable=SC2086
    importar_imagenes $(for s in $faltan; do printf 'grcup/%s:%s ' "$s" "$version"; done)
  fi
  for s in $todas; do printf 'grcup/%s:%s\n' "$s" "$version"; done
}
