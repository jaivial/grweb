import { memo, useMemo, type CSSProperties } from 'react';

/** One blurred ellipse of the cloud, in Figma px inside the 1440 × 400 layer (199:1739). */
interface Puff {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  /** Flat colour, or a radial glow when `glow` is set. */
  color: string;
  /** Figma layer-blur radius (CSS blur() = radius / 2). */
  blur: number;
  glow?: boolean;
}

const STAGE_W = 1440;
const STAGE_H = 400;
const LAYER_Y = 1252;

const raw: ReadonlyArray<[string, number, number, number, number, number, string, number, boolean?]> = [
  ['base-top', -240, 1262, 1920, 130, 0.92, '#0a0809', 60],
  ['base-mid', -160, 1322, 1760, 180, 0.7, '#0e0b0c', 80],
  ['base-low', -100, 1392, 1640, 200, 0.5, '#100d0e', 100],
  ['base-fade', -60, 1467, 1560, 170, 0.35, '#120f10', 110],
  ['tone-left', 80, 1312, 520, 120, 0.6, '#1c1718', 60],
  ['tone-right', 840, 1292, 560, 140, 0.6, '#1c1718', 60],
  ['tone-centre-low', 360, 1402, 720, 130, 0.4, '#1a1516', 80],
  ['red-left', 209, 1307, 302, 79, 0.35, '#1f0c0f', 60],
  ['red-centre', 576, 1286, 288, 72, 0.35, '#1f0c0f', 60],
  ['red-right', 929, 1317, 302, 79, 0.35, '#1f0c0f', 60],
  ['red-low', 490, 1392, 461, 101, 0.3, '#1a0a0d', 80],
  ['glow-left', 300, 1279, 259, 86, 0.09, '#7a1a26', 50, true],
  ['glow-centre', 590, 1279, 259, 86, 0.09, '#7a1a26', 50, true],
  ['glow-right', 880, 1279, 259, 86, 0.09, '#7a1a26', 50, true],
];

/** Figma 199:1739 «Nube · niebla del fondo»: ellipses in % of the stage so it scales with the layer. */
const PUFFS: readonly Puff[] = raw.map(([id, x, y, w, h, opacity, color, blur, glow]) => ({ id, x, y, w, h, opacity, color, blur, glow }));

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

export interface SmokeCloudProps {
  /** Layer height, CSS px (Figma 400). */
  height: number;
  className?: string;
}

/**
 * Block B smoke: edge-to-edge (100vw) layer of blurred dark ellipses with faint red tints.
 * Pure CSS (no images). The stage keeps at least 1440 px so narrow screens show its centre.
 */
export const SmokeCloud = memo(function SmokeCloud({ height, className = '' }: SmokeCloudProps) {
  const scale = height / STAGE_H;
  const puffs = useMemo(
    () =>
      PUFFS.map((puff) => {
        const style: CSSProperties = {
          left: pct(puff.x, STAGE_W),
          top: pct(puff.y - LAYER_Y, STAGE_H),
          width: pct(puff.w, STAGE_W),
          height: pct(puff.h, STAGE_H),
          opacity: puff.opacity,
          filter: `blur(${Math.max(2, (puff.blur / 2) * scale)}px)`,
          background: puff.glow ? `radial-gradient(closest-side, ${puff.color} 0%, transparent 100%)` : puff.color,
          borderRadius: puff.glow ? undefined : '50%',
        };
        return { id: puff.id, style };
      }),
    [scale],
  );

  return (
    <div
      className={`pointer-events-none absolute left-1/2 w-screen -translate-x-1/2 ${className}`}
      style={{ height }}
      aria-hidden
      data-ui="smoke-cloud"
    >
      <div className="absolute left-1/2 top-0 h-full w-[max(100%,1440px)] -translate-x-1/2" data-ui="smoke-cloud-stage">
        {puffs.map((puff) => (
          <div key={puff.id} className="absolute" style={puff.style} data-ui={`smoke-cloud-${puff.id}`} />
        ))}
      </div>
    </div>
  );
});
