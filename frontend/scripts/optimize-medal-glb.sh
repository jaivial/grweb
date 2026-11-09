#!/usr/bin/env bash
# Optimizes the GR Cup medal GLBs for the web (home premios section).
#
# Source: glTF 2.0 core models (Y-up, front +Z, `ribbon_anchor` node in the tab slot),
#         ~7 MB each with 2K textures and ~149k triangles.
# Output: frontend/public/models/medals/{gold,silver,bronze}.glb, each < 3.5 MB.
#
# Pipeline (gltf-transform 4, every step is loader-free in three.js GLTFLoader):
#   weld + simplify (≈50 % triangles; the relief stays in the normal map)
#   resize textures to 1024² + WebP (EXT_texture_webp)
#   quantize (KHR_mesh_quantization)
#
# Usage: frontend/scripts/optimize-medal-glb.sh [SOURCE_DIR]
#        (default SOURCE_DIR=/home/jaime/medals-capture/models)
# Wrap it in cgrun on shared hosts:  cgrun -- frontend/scripts/optimize-medal-glb.sh
set -euo pipefail

SRC_DIR="${1:-/home/jaime/medals-capture/models}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/models/medals"
GT="npx -y @gltf-transform/cli@4"
MAX_BYTES=$((3500 * 1024))

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for metal in gold silver bronze; do
  in="$SRC_DIR/$metal.glb"
  out="$OUT_DIR/$metal.glb"
  echo "[medals] $metal: $in"
  $GT weld "$in" "$TMP/$metal-1.glb"
  $GT simplify "$TMP/$metal-1.glb" "$TMP/$metal-2.glb" --ratio 0.5 --error 0.0005
  $GT resize "$TMP/$metal-2.glb" "$TMP/$metal-3.glb" --width 1024 --height 1024
  $GT webp "$TMP/$metal-3.glb" "$TMP/$metal-4.glb" --quality 85
  $GT quantize "$TMP/$metal-4.glb" "$out"
  size=$(stat -c %s "$out")
  echo "[medals] $metal -> $out ($size bytes)"
  if [ "$size" -ge "$MAX_BYTES" ]; then
    echo "[medals] ERROR: $metal.glb is over 3.5 MB" >&2
    exit 1
  fi
done
