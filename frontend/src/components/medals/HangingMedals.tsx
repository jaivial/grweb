import { memo, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { atom, useAtom } from 'jotai';
import { useIntersectionObserver } from '@hooks/useIntersectionObserver';
import { useMatchingEntry, useMediaQuery } from '@hooks/useMediaQuery';
import { createLogger } from '@utils/logger';
import { getMedalFallbackReason } from './medalCapability';
import { createEntranceCurve } from './medalEntrance';
import { useMedalStage, type SlotEntrance } from './MedalStage';
import { StaticMedal } from './StaticMedal';
import type { HangingLayout, HangingMedalSpec, MedalCollisions, MedalEntrance, MedalPhysics, ResolvedMedal } from './types';

const log = createLogger('medals');

/** Groups that already dropped in during this page load (the entrance never repeats). */
const enteredGroups = new Set<string>();

/** Entrance of a group: not decided yet, dropping, or none (at rest). */
export type EntrancePhase = 'waiting' | 'playing' | 'off';

export interface HangingMedalsProps {
  /** Group id (one view of the shared `<MedalStage>` canvas), e.g. «movements», «podium». */
  id: string;
  medals: readonly HangingMedalSpec[];
  layouts: readonly HangingLayout[];
  physics: MedalPhysics;
  /** Let the medals of this group hit each other (e.g. a podium). Default: no collisions. */
  collisions?: MedalCollisions | null;
  /** Positioned element the medals hang from (its top edge is the rail; anchors are relative to it). */
  containerRef: RefObject<HTMLElement>;
  onMedalHover?: (id: string | null) => void;
  /** Entrance drop when the band shows up (3D only, once per page load); null = none. */
  entrance?: MedalEntrance | null;
  /** Entrance phase changes (e.g. to fade a halo in with the drop). */
  onEntranceChange?: (phase: EntrancePhase, info: { startAt: number; durationMs: number }) => void;
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
 * - 3D when the band is within one viewport: a view of the enclosing `<MedalStage>` canvas (lazy
 *   three + rapier), static PNGs until it is ready. Without a stage it stays static.
 * - Static PNGs with a CSS swing without WebGL, with save-data or on low-end devices; still
 *   PNGs with prefers-reduced-motion; the same PNGs if the 3D chunk or the GLB fails.
 * - Anchors: centre of each medal's `anchorRef` (ResizeObserver) or `anchorsPct` of the width.
 * - A breakpoint change swaps the layout in place (same view, world and models).
 */
export function HangingMedals({ id, medals, layouts, physics, collisions = null, containerRef, onMedalHover, entrance = null, onEntranceChange }: HangingMedalsProps) {
  const stage = useMedalStage();
  const layout = useMatchingEntry(layouts);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const fallbackReason = useMemo(() => getMedalFallbackReason(reducedMotion), [reducedMotion]);

  const atoms = useMemo(
    () => ({
      measure: atom<Measure | null>(null),
      hoveredId: atom<string | null>(null),
      entrance: atom<{ phase: EntrancePhase; startAt: number }>({ phase: entrance && !enteredGroups.has(id) ? 'waiting' : 'off', startAt: 0 }),
      waitedOut: atom(false),
    }),
    [],
  );
  const [measure, setMeasure] = useAtom(atoms.measure);
  const [hoveredId, setHoveredId] = useAtom(atoms.hoveredId);
  const [entranceState, setEntranceState] = useAtom(atoms.entrance);
  const [waitedOut, setWaitedOut] = useAtom(atoms.waitedOut);
  const handleHover = useCallback((medalId: string | null) => {
    setHoveredId(medalId);
    onMedalHover?.(medalId);
  }, [setHoveredId, onMedalHover]);

  const near = useIntersectionObserver({ rootMargin: '100% 0px', threshold: 0, triggerOnce: true });
  const visible = useIntersectionObserver({ threshold: 0 });
  const shown = useIntersectionObserver({ threshold: entrance?.threshold ?? 0.3, triggerOnce: true });
  const { ref: nearRef } = near;
  const { ref: visibleRef } = visible;
  const { ref: shownRef } = shown;
  const setBandRef = useCallback((node: HTMLDivElement | null) => {
    nearRef(node);
    visibleRef(node);
    shownRef(node);
  }, [nearRef, visibleRef, shownRef]);

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

  const failed = !!stage?.failed.has(id);
  const ready = !!stage?.ready.has(id);
  const useCanvas = !!stage && !fallbackReason && !failed && near.isIntersecting && resolved.length > 0;

  // Entrance: starts when the band is `threshold` visible AND the models are ready. If they are
  // not ready `maxWaitMs` after it showed up, the medals appear at rest (no late drop). Only 3D:
  // the PNG fallback and reduced motion never drop (see MEDAL_ENTRANCE in the page config).
  const phase: EntrancePhase = useCanvas ? entranceState.phase : 'off';
  useEffect(() => {
    if (entranceState.phase !== 'waiting') return;
    if (!useCanvas && (fallbackReason || failed)) {
      setEntranceState({ phase: 'off', startAt: 0 });
      return;
    }
    if (!shown.isIntersecting) return;
    if (ready) {
      enteredGroups.add(id);
      setEntranceState({ phase: 'playing', startAt: performance.now() });
      return;
    }
    const timer = setTimeout(() => {
      log.info('entrance skipped: model not ready in time', { id, maxWaitMs: entrance?.maxWaitMs });
      enteredGroups.add(id);
      setWaitedOut(true);
      setEntranceState({ phase: 'off', startAt: 0 });
    }, entrance?.maxWaitMs ?? 0);
    return () => clearTimeout(timer);
  }, [entranceState.phase, useCanvas, fallbackReason, failed, shown.isIntersecting, ready, id, entrance, setEntranceState, setWaitedOut]);

  // Playing → off once the last medal has landed (state only; the rigs land on their own).
  const lastDelay = useMemo(() => Math.max(0, ...medals.map((medal, index) => medal.entryOrder ?? index)) * (entrance?.staggerMs ?? 0), [medals, entrance]);
  useEffect(() => {
    if (entranceState.phase !== 'playing') return;
    const remaining = entranceState.startAt + lastDelay + layout.entranceMs - performance.now();
    const timer = setTimeout(() => setEntranceState({ phase: 'off', startAt: 0 }), Math.max(0, remaining) + 50);
    return () => clearTimeout(timer);
  }, [entranceState, lastDelay, layout.entranceMs, setEntranceState]);

  useEffect(() => {
    onEntranceChange?.(phase, { startAt: entranceState.startAt, durationMs: layout.entranceMs });
  }, [phase, entranceState.startAt, layout.entranceMs, onEntranceChange]);

  // PNG placeholder: fallback, or loading at rest. Not while a drop may still come (the band
  // stays empty until the medals fall in), only once the wait ran out.
  const showStatic = !useCanvas || (!ready && (phase === 'off' || waitedOut));
  const hovered = useMemo(() => resolved.find((medal) => medal.id === hoveredId), [resolved, hoveredId]);

  useEffect(() => {
    if (!stage) log.warn('HangingMedals outside a <MedalStage>: static medals', { id });
  }, [stage, id]);

  // Register this group as a view of the shared canvas. Re-registering with a new layout or
  // anchors updates the view in place; it is only removed when 3D is no longer wanted.
  const trackRef = useRef<HTMLDivElement>(null);
  const register = stage?.register;
  const unregister = stage?.unregister;
  const active = visible.isIntersecting;
  const width = measure?.width ?? 0;
  const curve = useMemo(() => (entrance ? createEntranceCurve(entrance) : null), [entrance]);
  const slotEntrance = useMemo<SlotEntrance>(
    () => ({ state: phase, startAt: entranceState.startAt, staggerMs: entrance?.staggerMs ?? 0, curve }),
    [phase, entranceState.startAt, entrance, curve],
  );
  useEffect(() => {
    if (!register || !useCanvas) return;
    register({ id, trackRef, medals: resolved, layout, width, physics, collisions, active, onHover: handleHover, entrance: slotEntrance });
  }, [register, useCanvas, id, resolved, layout, width, physics, collisions, active, handleHover, slotEntrance]);
  useEffect(() => {
    if (!unregister || useCanvas) return;
    unregister(id);
  }, [unregister, useCanvas, id]);
  useEffect(() => () => unregister?.(id), [unregister, id]);

  return (
    <div
      ref={setBandRef}
      className="pointer-events-none absolute inset-x-0 z-30"
      style={{ top: layout.anchorY ?? 0, height: layout.canvasHeight }}
      aria-hidden
      data-ui="hanging-medals"
      data-mode={useCanvas ? '3d' : `static${fallbackReason ? `-${fallbackReason}` : ''}`}
      data-entrance={phase}
    >
      {showStatic && <StaticMedalRow medals={resolved} layout={layout} swing={!!fallbackReason || failed} />}
      {useCanvas && (
        // Band of this group's view: the shared canvas draws here and takes the pointer events
        // that target it; vertical touch pans and the wheel still scroll the page.
        <div
          ref={trackRef}
          className="absolute inset-0"
          style={{ pointerEvents: 'auto', touchAction: 'pan-y' }}
          data-ui="hanging-medals-view"
        />
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
