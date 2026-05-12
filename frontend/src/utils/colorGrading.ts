import type { GlobalCompositeOperation } from 'canvas';

export interface ColorGradeConfig {
  brightness?: number;
  contrast?: number;
  saturate?: number;
  hueShift?: number;
  tint?: string;
  tintOpacity?: number;
}

export interface BlendOverlayConfig {
  color: string;
  opacity: number;
  compositeOp: GlobalCompositeOperation;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function applyColorGrade(
  imageData: ImageData,
  config: ColorGradeConfig
): ImageData {
  const data = imageData.data;
  const { brightness = 1, contrast = 1, saturate = 1 } = config;

  const contrastFactor = (259 * (contrast * 255 + 255)) / (255 * (259 + contrast * 255 - 255));

  const tintRgb = config.tint ? hexToRgb(config.tint) : null;
  const tintAlpha = config.tintOpacity ?? 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r *= brightness;
    g *= brightness;
    b *= brightness;

    // Contrast
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // Saturation
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = gray + saturate * (r - gray);
    g = gray + saturate * (g - gray);
    b = gray + saturate * (b - gray);

    // Tint overlay
    if (tintRgb) {
      r = r * (1 - tintAlpha) + tintRgb.r * tintAlpha;
      g = g * (1 - tintAlpha) + tintRgb.g * tintAlpha;
      b = b * (1 - tintAlpha) + tintRgb.b * tintAlpha;
    }

    data[i] = clamp(Math.round(r), 0, 255);
    data[i + 1] = clamp(Math.round(g), 0, 255);
    data[i + 2] = clamp(Math.round(b), 0, 255);
  }

  return imageData;
}

export function applyBlendOverlay(
  ctx: CanvasRenderingContext2D,
  config: BlendOverlayConfig,
  width: number,
  height: number
): void {
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;

  ctx.globalCompositeOperation = config.compositeOp;
  ctx.globalAlpha = config.opacity;
  ctx.fillStyle = config.color;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevAlpha;
}

export const FER_VIDEO_GRADE: ColorGradeConfig = {
  brightness: 0.85,
  contrast: 1.1,
  saturate: 0.8,
  tint: '#0A1628',
  tintOpacity: 0.25,
};

export const FER_VIDEO_BLEND: BlendOverlayConfig = {
  color: '#0A1628',
  opacity: 0.55,
  compositeOp: 'multiply',
};
