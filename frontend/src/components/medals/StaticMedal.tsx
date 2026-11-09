import { memo, useMemo, type CSSProperties } from 'react';

export interface StaticMedalProps {
  src: string;
  ribbonSrc: string;
  alt?: string;
  /** Medal width, CSS px. */
  width: number;
  /** Vertical distance from the rail (top of the component) to the medal tab, CSS px. */
  ribbonLength: number;
  ribbonWidth: number;
  ribbonSpreadTop: number;
  ribbonSpreadBottom: number;
  /** CSS keyframes swing ±2° around the rail (off with prefers-reduced-motion). */
  swing?: boolean;
  /** Swing phase in [0, 1). */
  phase?: number;
  className?: string;
  style?: CSSProperties;
  dataUi?: string;
}

/** Cut-out aspect (height / width) and tab position of /images/medals/medal-*-lg.png. */
const MEDAL_ASPECT = 401 / 440;
const TAB_X = 0.51;
const TAB_Y = 0.035;
const SWING_PERIOD_S = 4;

/**
 * Medal cut-out hanging from a V of two lanyard strands, drawn in plain DOM/CSS.
 * Used for the static medal of the absolute winner and as the fallback of the 3D medals.
 */
export const StaticMedal = memo(function StaticMedal({
  src,
  ribbonSrc,
  alt = '',
  width,
  ribbonLength,
  ribbonWidth,
  ribbonSpreadTop,
  ribbonSpreadBottom,
  swing = false,
  phase = 0,
  className = '',
  style,
  dataUi = 'static-medal',
}: StaticMedalProps) {
  const geometry = useMemo(() => {
    const boxWidth = Math.max(width, ribbonSpreadTop + ribbonWidth);
    const centre = boxWidth / 2;
    const medalHeight = width * MEDAL_ASPECT;
    const strands = [-1, 1].map((side) => {
      const x0 = centre + (side * ribbonSpreadTop) / 2;
      const x1 = centre + (side * ribbonSpreadBottom) / 2;
      const length = Math.hypot(x1 - x0, ribbonLength);
      const angle = -Math.atan2(x1 - x0, ribbonLength);
      return { side, left: x0 - ribbonWidth / 2, length, angle };
    });
    return {
      boxWidth,
      height: ribbonLength + medalHeight * (1 - TAB_Y),
      medalLeft: centre - width * TAB_X,
      medalTop: ribbonLength - medalHeight * TAB_Y,
      strands,
    };
  }, [width, ribbonLength, ribbonWidth, ribbonSpreadTop, ribbonSpreadBottom]);

  const wrapperStyle = useMemo<CSSProperties>(
    () => ({
      width: geometry.boxWidth,
      height: geometry.height,
      transformOrigin: '50% 0',
      animationDelay: swing ? `${-phase * SWING_PERIOD_S}s` : undefined,
      ...style,
    }),
    [geometry, swing, phase, style],
  );

  return (
    <div
      className={`relative ${swing ? 'animate-medal-swing motion-reduce:animate-none' : ''} ${className}`}
      style={wrapperStyle}
      data-ui={dataUi}
    >
      {geometry.strands.map((strand) => (
        <div
          key={strand.side}
          className="absolute top-0"
          style={{
            left: strand.left,
            width: ribbonWidth,
            height: strand.length,
            transformOrigin: '50% 0',
            transform: `rotate(${strand.angle}rad)`,
            backgroundImage: `url(${ribbonSrc})`,
            backgroundSize: '100% auto',
            backgroundRepeat: 'repeat-y',
            boxShadow: 'inset 0 0 6px rgba(0, 0, 0, 0.35)',
          }}
          data-ui={`${dataUi}-ribbon-${strand.side < 0 ? 'left' : 'right'}`}
          aria-hidden
        />
      ))}
      <img
        src={src}
        alt={alt}
        width={width}
        height={Math.round(width * MEDAL_ASPECT)}
        className="absolute max-w-none select-none"
        style={{ left: geometry.medalLeft, top: geometry.medalTop, width, filter: 'drop-shadow(0 14px 18px rgba(0, 0, 0, 0.55))' }}
        draggable={false}
        loading="lazy"
        decoding="async"
        data-ui={`${dataUi}-image`}
      />
    </div>
  );
});
