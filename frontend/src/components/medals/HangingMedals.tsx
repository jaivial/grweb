import { Suspense, lazy, memo, useCallback, useEffect, useMemo, type RefObject } from 'react';
import { atom, useAtom } from 'jotai';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { useIntersectionObserver } from '@hooks/useIntersectionObserver';
import { useMatchingEntry, useMediaQuery } from '@hooks/useMediaQuery';
import { createLogger } from '@utils/logger';
import { getMedalFallbackReason } from './medalCapability';
import { StaticMedal } from './StaticMedal';
import type { HangingLayout, HangingMedalSpec, MedalCollisions, MedalPhysics, ResolvedMedal } from './types';

const HangingMedalsCanvas = lazy(() => import('./HangingMedalsCanvas'));
const log = createLogger('medals');

export interface HangingMedalsProps {
  medals: readonly HangingMedalSpec[];
  layouts: readonly HangingLayout[];
  physics: MedalPhysics;
  /** Let the medals of this group hit each other (e.g. a podium). Default: no collisions. */
  collisions?: MedalCollisions | null;
  /** Positioned element the medals hang from (its top edge is the rail; anchors are relative to it). */
  containerRef: RefObject<HTMLElement>;
  onMedalHover?: (id: string | null) => void;
}

interface Measure {
  width: number;
  anchors: number[];
}

const sameMeasure = (a: Measure | null, b: Measure) =>
  !!a && a.width === b.width && a.anchors.every((x, i) => x === b.anchors[i]);

/** Static PNG medals at the anchors: first paint, loading state and fallback (CSS swing ±2°). */
const StaticMedalRow = memo(function StaticMedalRow({ medals, layout, swing }: { medals: ResolvedMedal[]; layout: HangingLayout; swing: boolean }) {
  return (
    <>
      {medals.map((medal) => (
        <div
          key={medal.id}
          className="absolute top-0 -translate-x-1/2"
          style={{ left: medal.anchorX, zIndex: medal.geometry.z }}
          data-ui={`hanging-medal-static-slot-${medal.id}`}
        >
          <StaticMedal
            src={medal.assets.image}
            ribbonSrc={medal.assets.ribbon}
            width={medal.geometry.medalWidth}
            ribbonLength={medal.geometry.ribbonLength}
            ribbonWidth={layout.ribbonWidth}
            ribbonSpreadTop={layout.ribbonSpreadTop}
            ribbonSpreadBottom={layout.ribbonSpreadBottom}
            swing={swing}
            phase={medal.phase}
            dataUi={`hanging-medal-static-${medal.id}`}
          />
        </div>
      ))}
    </>
  );
});

/**
 * Medals hanging from the top edge of `containerRef`, over a band `layout.canvasHeight` px tall
 * (the container reserves it as padding-top, so there is no layout shift).
 *
 * - 3D (lazy three + rapier) when the band is within one viewport; static PNGs until it is ready.
 * - Static PNGs with a CSS swing without WebGL, with save-data or on low-end devices; still
 *   PNGs with prefers-reduced-motion; the same PNGs if the 3D chunk or the GLB fails.
 * - Anchors: centre of each medal's `anchorRef` (ResizeObserver) or `anchorsPct` of the width.
 */
export function HangingMedals({ medals, layouts, physics, collisions = null, containerRef, onMedalHover }: HangingMedalsProps) {
  const layout = useMatchingEntry(layouts);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const fallbackReason = useMemo(() => getMedalFallbackReason(reducedMotion), [reducedMotion]);

  const atoms = useMemo(
    () => ({
      measure: atom<Measure | null>(null),
      readyLayout: atom<string | null>(null),
      failed: atom(false),
      hoveredId: atom<string | null>(null),
    }),
    [],
  );
  const [measure, setMeasure] = useAtom(atoms.measure);
  const [readyLayout, setReadyLayout] = useAtom(atoms.readyLayout);
  const [failed, setFailed] = useAtom(atoms.failed);
  const [hoveredId, setHoveredId] = useAtom(atoms.hoveredId);
  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
    onMedalHover?.(id);
  }, [setHoveredId, onMedalHover]);

  const near = useIntersectionObserver({ rootMargin: '100% 0px', threshold: 0, triggerOnce: true });
  const visible = useIntersectionObserver({ threshold: 0 });
  const { ref: nearRef } = near;
  const { ref: visibleRef } = visible;
  const setBandRef = useCallback((node: HTMLDivElement | null) => {
    nearRef(node);
    visibleRef(node);
  }, [nearRef, visibleRef]);

  // Passive effect: the container and anchor refs belong to ancestors/siblings and are attached after this layout phase.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      const anchors = medals.map((medal, index) => {
        const element = layout.followAnchors ? medal.anchorRef?.current : null;
        const box = element?.getBoundingClientRect();
        const x = box && box.width > 0 ? box.left + box.width / 2 - rect.left : rect.width * (layout.anchorsPct[index] ?? 0.5);
        return Math.round(x);
      });
      const next = { width: Math.round(rect.width), anchors };
      setMeasure((previous) => (sameMeasure(previous, next) ? previous : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    medals.forEach((medal) => medal.anchorRef?.current && observer.observe(medal.anchorRef.current));
    return () => observer.disconnect();
  }, [containerRef, medals, layout, setMeasure]);

  useEffect(() => {
    if (fallbackReason) log.info('static medals fallback', { reason: fallbackReason });
  }, [fallbackReason]);

  const resolved = useMemo<ResolvedMedal[]>(
    () =>
      measure
        ? medals.map((medal, index) => ({
            ...medal,
            anchorX: measure.anchors[index],
            geometry: {
              ribbonLength: layout.ribbonLength,
              medalWidth: layout.medalWidth,
              medalHeight: layout.medalHeight,
              wind: layout.wind,
              z: 0,
              ...layout.medals?.[index],
            },
          }))
        : [],
    [medals, measure, layout],
  );

  const handleReady = useCallback(() => setReadyLayout(layout.id), [layout.id, setReadyLayout]);
  const handleError = useCallback((error: Error) => {
    log.error('3D medals failed, static fallback', error);
    setFailed(true);
  }, [setFailed]);

  const useCanvas = !fallbackReason && !failed && near.isIntersecting && resolved.length > 0;
  const showStatic = !useCanvas || readyLayout !== layout.id;
  const hovered = useMemo(() => resolved.find((medal) => medal.id === hoveredId), [resolved, hoveredId]);

  return (
    <div
      ref={setBandRef}
      className="pointer-events-none absolute inset-x-0 top-0 z-30"
      style={{ height: layout.canvasHeight }}
      aria-hidden
      data-ui="hanging-medals"
      data-mode={useCanvas ? '3d' : `static${fallbackReason ? `-${fallbackReason}` : ''}`}
    >
      {showStatic && <StaticMedalRow medals={resolved} layout={layout} swing={!!fallbackReason || failed} />}
      {useCanvas && (
        <div className="absolute inset-0" key={layout.id} data-ui="hanging-medals-canvas-wrapper">
          <ErrorBoundary fallback={null} onError={handleError}>
            <Suspense fallback={null}>
              <HangingMedalsCanvas
                medals={resolved}
                layout={layout}
                physics={physics}
                collisions={collisions}
                active={visible.isIntersecting}
                onMedalHover={handleHover}
                onReady={handleReady}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {hovered && (
        <div
          className="absolute -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-3 py-1 text-xs uppercase tracking-wider text-white/90 backdrop-blur-sm"
          style={{ left: hovered.anchorX, top: Math.min(hovered.geometry.ribbonLength + hovered.geometry.medalHeight + 6, layout.canvasHeight - 24) }}
          data-ui="hanging-medal-tooltip"
        >
          {hovered.label}
        </div>
      )}
    </div>
  );
}
