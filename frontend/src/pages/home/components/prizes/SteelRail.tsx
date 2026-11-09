import { memo, useMemo, type CSSProperties } from 'react';
import { STEEL_FINISH, type PrizeRailLayout } from './medals.config';

/** Horizontal brushed grain: turbulence stretched along x (low x frequency, high y frequency). */
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="24"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.2"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>',
)}")`;

/** Brushed-steel surface (rail bar, card clip): gradient + ~4 % grain on top. */
const SteelSurface = memo(function SteelSurface({ style, dataUi }: { style: CSSProperties; dataUi: string }) {
  return (
    <div className="absolute overflow-hidden" style={{ background: STEEL_FINISH.gradient, ...style }} data-ui={dataUi}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: GRAIN_URL, backgroundSize: '240px 100%', opacity: STEEL_FINISH.grainOpacity, mixBlendMode: 'overlay' }}
        data-ui={`${dataUi}-grain`}
        aria-hidden
      />
    </div>
  );
});

/**
 * Steel rail the podium hangs from (DOM, above the shared medal canvas): bar between two
 * crimson caps, centred on `axisY`. Decorative.
 */
export const SteelRail = memo(function SteelRail({ rail, dataUi = 'prize-rail' }: { rail: PrizeRailLayout; dataUi?: string }) {
  const { capDiameter: cap, thickness } = rail;
  const frame = useMemo<CSSProperties>(
    () => ({ left: `${rail.left * 100}%`, width: `${rail.width * 100}%`, top: rail.axisY - cap / 2, height: cap }),
    [rail.left, rail.width, rail.axisY, cap],
  );
  const capStyle = (side: 'left' | 'right'): CSSProperties => ({
    [side]: 0,
    top: 0,
    width: cap,
    height: cap,
    background: STEEL_FINISH.cap,
    border: STEEL_FINISH.capBorder,
    boxShadow: rail.capShadow,
  });
  return (
    // z-[31]: above the medal canvas (z-30), which is why its ancestors must not stack (no z-index).
    <div className="pointer-events-none absolute z-[31]" style={frame} aria-hidden data-ui={dataUi}>
      <SteelSurface
        style={{ left: cap / 2, right: cap / 2, top: (cap - thickness) / 2, height: thickness, borderRadius: rail.radius, boxShadow: rail.shadow }}
        dataUi={`${dataUi}-bar`}
      />
      <span className="absolute rounded-full" style={capStyle('left')} data-ui={`${dataUi}-cap-left`} />
      <span className="absolute rounded-full" style={capStyle('right')} data-ui={`${dataUi}-cap-right`} />
    </div>
  );
});

/** Steel clip (pasador) on a card's top edge, centred on `centerX` (px or CSS length). */
export const SteelClip = memo(function SteelClip({ width, height, radius, centerX, dataUi = 'steel-clip' }: { width: number; height: number; radius: number; centerX: number | string; dataUi?: string }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-[31] -translate-x-1/2"
      style={{ left: centerX, width, height }}
      aria-hidden
      data-ui={dataUi}
    >
      <SteelSurface style={{ inset: 0, borderRadius: `0 0 ${radius}px ${radius}px`, boxShadow: '0 5px 12px rgba(0, 0, 0, 0.55)' }} dataUi={`${dataUi}-surface`} />
    </div>
  );
});
