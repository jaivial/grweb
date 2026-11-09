import type { BezierCurve, MedalEntrance } from './types';

/** CSS-style cubic-bezier easing: x(u) solved by Newton/bisection, then y(u). */
function bezierEasing([x1, y1, x2, y2]: BezierCurve): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 6; i++) {
      const error = sampleX(u) - x;
      const slope = slopeX(u);
      if (Math.abs(error) < 1e-5) return sampleY(u);
      if (Math.abs(slope) < 1e-6) break;
      u -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 20; i++) {
      const value = sampleX(u);
      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return sampleY(u);
  };
}

export interface EntranceCurve {
  /** Vertical offset from the rest position (px, positive = down) at time t ∈ [0, 1]. */
  offset: (t: number, ribbonLength: number, medalHeight: number) => number;
}

/** Keyframed drop: start (above the anchor) → overshoot → rebound → rest, each segment eased. */
export function createEntranceCurve(entrance: MedalEntrance): EntranceCurve {
  const fall = bezierEasing(entrance.easing.fall);
  const rebound = bezierEasing(entrance.easing.rebound);
  const settle = bezierEasing(entrance.easing.settle);
  const { overshoot, rebound: back, startGapPx } = entrance;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  return {
    offset: (t, length, height) => {
      const start = -(length + height + startGapPx);
      const over = overshoot.l * length;
      const bounce = back.l * length;
      if (t <= 0) return start;
      if (t >= 1) return 0;
      if (t < overshoot.at) return lerp(start, over, fall(t / overshoot.at));
      if (t < back.at) return lerp(over, bounce, rebound((t - overshoot.at) / (back.at - overshoot.at)));
      return lerp(bounce, 0, settle((t - back.at) / (1 - back.at)));
    },
  };
}
