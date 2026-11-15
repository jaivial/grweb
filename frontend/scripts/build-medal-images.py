#!/usr/bin/env python3
"""Builds the 2D medal assets of the home premios section.

Inputs  (canonical WaveSpeed views, 2048² on a flat #D9D9D9-ish background):
  <views>/{gold,silver,bronze}_front.png   medal front, no ribbon
  <views>/gold_ribbon.png                  medal hanging from the real lanyard
Outputs (frontend/public/images/medals/):
  medal-{metal}-lg.png   440 px wide cut-out (static GL Points medal, CSS fallback of the 3D medals)
  ribbon.png             straight vertical strip of the real lanyard (3D texture + CSS ribbon)

Cut-out (gold, bronze): the background is neutral grey, the medal is saturated metal or red enamel.
Low-saturation pixels form candidate background regions; only large connected regions
(outer background and the tab slot) are removed, so pale specular highlights inside the
medal stay opaque. No rembg needed.

Usage: python3 frontend/scripts/build-medal-images.py [VIEWS_DIR]
       (default VIEWS_DIR=/home/jaime/medals-capture/wavespeed/views; needs Pillow, numpy, scipy)
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

VIEWS = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/jaime/medals-capture/wavespeed/views")
OUT = Path(__file__).resolve().parent.parent / "public" / "images" / "medals"
SIZES = {"lg": 440}
SATURATION_MAX = 0.16  # max (max-min)/max of a background pixel
MIN_BG_REGION = 6000  # px at 2048²: smaller grey blobs are highlights, not background
# Silver is itself near-grey, so saturation cannot separate it from the background. The
# three fronts share one silhouette (same master image), so silver reuses the gold mask.
MASK_FROM = {"silver": "gold"}

# Lanyard strip: the left strap of gold_ribbon.png runs down-right at atan(66/250).
RIBBON_CENTER = (516, 300)
RIBBON_ANGLE = -math.degrees(math.atan(66 / 250))
RIBBON_CROP = (446, 20, 650, 560)
RIBBON_OUT = (96, 256)


def load(metal: str) -> np.ndarray:
    return np.asarray(Image.open(VIEWS / f"{metal}_front.png").convert("RGB")).astype(np.float32)


def medal_mask(rgb: np.ndarray) -> np.ndarray:
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    grey = sat < SATURATION_MAX
    labels, count = ndimage.label(grey)
    sizes = ndimage.sum(grey, labels, range(1, count + 1))
    background = np.isin(labels, np.nonzero(sizes >= MIN_BG_REGION)[0] + 1)
    return ndimage.binary_opening(~background, iterations=2)


def cut_out(rgb: np.ndarray, medal: np.ndarray) -> Image.Image:
    alpha = Image.fromarray((medal * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    out.putalpha(alpha)
    return out.crop(out.getbbox())


def save_sizes(img: Image.Image, metal: str) -> None:
    for name, width in SIZES.items():
        h = round(img.height * width / img.width)
        dst = OUT / f"medal-{metal}-{name}.png"
        img.resize((width, h), Image.LANCZOS).save(dst, optimize=True)
        print(f"[medals] {dst.name} {width}x{h} {dst.stat().st_size} B")


def ribbon() -> None:
    src = Image.open(VIEWS / "gold_ribbon.png").convert("RGB")
    strip = src.rotate(RIBBON_ANGLE, center=RIBBON_CENTER, resample=Image.BICUBIC).crop(RIBBON_CROP)
    dst = OUT / "ribbon.png"
    strip.resize(RIBBON_OUT, Image.LANCZOS).save(dst, optimize=True)
    print(f"[medals] {dst.name} {RIBBON_OUT} {dst.stat().st_size} B")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    masks = {}
    for metal in ("gold", "bronze", "silver"):
        rgb = load(metal)
        masks[metal] = masks[MASK_FROM[metal]] if metal in MASK_FROM else medal_mask(rgb)
        save_sizes(cut_out(rgb, masks[metal]), metal)
    ribbon()


if __name__ == "__main__":
    main()
