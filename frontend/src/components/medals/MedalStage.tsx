import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { createLogger } from '@utils/logger';
import type { HangingLayout, MedalCollisions, MedalPhysics, MedalStageConfig, ResolvedMedal } from './types';

const MedalStageCanvas = lazy(() => import('./MedalStageCanvas'));
const log = createLogger('medals');

/** One group of hanging medals drawn by the shared canvas (one drei `<View>` each). */
export interface MedalSlot {
  id: string;
  /** Order of the view (render and event priority); assigned on registration. */
  order: number;
  /** DOM band the view is scissored to; it also receives the pointer events. */
  trackRef: RefObject<HTMLDivElement>;
  medals: ResolvedMedal[];
  layout: HangingLayout;
  /** Band width in CSS px (the measured container width). */
  width: number;
  physics: MedalPhysics;
  collisions: MedalCollisions | null;
  /** In the viewport: physics running and the view rendered. */
  active: boolean;
  onHover?: (id: string | null) => void;
}

export type MedalSlotInput = Omit<MedalSlot, 'order'>;

interface MedalStageApi {
  register: (slot: MedalSlotInput) => void;
  unregister: (id: string) => void;
  ready: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}

const MedalStageContext = createContext<MedalStageApi | null>(null);

/** Stage of the enclosing `<MedalStage>`, or null outside one (the groups then stay static). */
export const useMedalStage = () => useContext(MedalStageContext);

export interface MedalStageProps {
  /**
   * Element that contains every group of the stage: the canvas listens for pointer events on it
   * (each view only handles the events whose target is its own band).
   */
  eventSourceRef: RefObject<HTMLElement>;
  config: MedalStageConfig;
  children: ReactNode;
}

const ALL_FAILED = '*';

/**
 * One WebGL canvas for every group of hanging medals inside it (blocks A, B, and any later one):
 * each `<HangingMedals>` registers a slot and is drawn by its own `<View>`, physics world and
 * viewport pause. The canvas (lazy chunk: three + rapier) mounts with the first slot that
 * needs 3D and then stays, so a breakpoint change never recreates the context or the worlds.
 */
export function MedalStage({ eventSourceRef, config, children }: MedalStageProps) {
  const [slots, setSlots] = useState<Record<string, MedalSlot>>({});
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const nextOrder = useRef(0);
  const orders = useRef(new Map<string, number>());

  const register = useCallback((input: MedalSlotInput) => {
    let order = orders.current.get(input.id);
    if (order === undefined) {
      order = nextOrder.current++;
      orders.current.set(input.id, order);
      log.debug('stage slot registered', { id: input.id, order, layout: input.layout.id, medals: input.medals.length });
    }
    const slot: MedalSlot = { ...input, order };
    setSlots((previous) => ({ ...previous, [slot.id]: slot }));
  }, []);

  const unregister = useCallback((id: string) => {
    setSlots((previous) => {
      if (!(id in previous)) return previous;
      const { [id]: _removed, ...rest } = previous;
      return rest;
    });
    setReady((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }, []);

  const handleSlotReady = useCallback((id: string) => {
    setReady((previous) => (previous.has(id) ? previous : new Set(previous).add(id)));
  }, []);

  const handleSlotError = useCallback((id: string, error: Error) => {
    log.error('3D medal group failed, static fallback', { id, message: error.message });
    setFailed((previous) => new Set(previous).add(id));
  }, []);

  const handleCanvasError = useCallback((error: Error) => {
    log.error('shared medal canvas failed, static fallback for every group', error);
    setFailed(new Set([ALL_FAILED]));
  }, []);

  const slotList = useMemo(() => Object.values(slots).sort((a, b) => a.order - b.order), [slots]);
  // Mounted with the first slot and kept afterwards (no context churn).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!mounted && slotList.length > 0 && !failed.has(ALL_FAILED)) {
      log.info('shared medal canvas: mounting', { slots: slotList.map((slot) => slot.id) });
      setMounted(true);
    }
  }, [mounted, slotList, failed]);

  const failedView = useMemo<ReadonlySet<string>>(
    () => (failed.has(ALL_FAILED) ? new Set([...Object.keys(slots), ...orders.current.keys()]) : failed),
    [failed, slots],
  );
  const api = useMemo<MedalStageApi>(() => ({ register, unregister, ready, failed: failedView }), [register, unregister, ready, failedView]);
  const liveSlots = useMemo(() => slotList.filter((slot) => !failed.has(slot.id)), [slotList, failed]);

  return (
    <MedalStageContext.Provider value={api}>
      {children}
      {mounted && !failed.has(ALL_FAILED) && (
        <ErrorBoundary fallback={null} onError={handleCanvasError}>
          <Suspense fallback={null}>
            <MedalStageCanvas
              slots={liveSlots}
              config={config}
              eventSourceRef={eventSourceRef}
              onSlotReady={handleSlotReady}
              onSlotError={handleSlotError}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </MedalStageContext.Provider>
  );
}
