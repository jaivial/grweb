/**
 * Decides whether the 3D medals can run, or the static PNG + CSS fallback is shown instead.
 * Returns the reason for the fallback, or `null` when WebGL medals are fine.
 */
import { hasWebGL } from '@utils/webgl';

export type MedalFallbackReason = 'reduced-motion' | 'no-webgl' | 'save-data' | 'low-end-device';

interface NavigatorHints {
  connection?: { saveData?: boolean };
  hardwareConcurrency?: number;
}

/** Minimum logical cores for the physics medals (Figma spec: ≤ 4 cores → fallback). */
const MIN_CORES = 5;

export function getMedalFallbackReason(prefersReducedMotion: boolean): MedalFallbackReason | null {
  if (prefersReducedMotion) return 'reduced-motion';
  if (typeof window === 'undefined') return 'no-webgl';
  const nav = navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData) return 'save-data';
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency < MIN_CORES) return 'low-end-device';
  if (!hasWebGL()) return 'no-webgl';
  return null;
}
