import { useCallback, useEffect, useMemo, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type ToneMapping } from 'three';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { createLogger } from '@utils/logger';
import { MedalGroupScene } from './MedalGroupScene';
import type { MedalSlot } from './MedalStage';
import type { MedalStageConfig } from './types';

const log = createLogger('medals');

export interface MedalStageCanvasProps {
  slots: MedalSlot[];
  config: MedalStageConfig;
  eventSourceRef: RefObject<HTMLElement>;
  onSlotReady: (id: string) => void;
  onSlotError: (id: string, error: Error) => void;
}

const TONE_MAPPING: Record<MedalStageConfig['toneMapping'], ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
};

/** Frame priority of the full clear; views render after it (priority = FIRST_VIEW + order). */
const CLEAR_PRIORITY = 1;
const FIRST_VIEW = 2;

/**
 * Clears the whole canvas at the start of every frame. The canvas is fixed over the viewport and
 * views only draw their own band, so without it a view that stops drawing (scrolled out, paused)
 * would leave its last image stuck on screen. When the last view pauses it asks for one more
 * (empty) frame before the loop goes on demand.
 */
function FrameClear({ anyActive }: { anyActive: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.clear(true, true, false);
  }, CLEAR_PRIORITY);
  useEffect(() => {
    if (!anyActive) invalidate();
  }, [anyActive, invalidate]);
  return null;
}

/** Logs context loss/restore of the shared canvas (iOS drops contexts under memory pressure). */
function ContextWatch() {
  const element = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      log.warn('shared medal canvas: WebGL context lost');
    };
    const restored = () => log.info('shared medal canvas: WebGL context restored');
    element.addEventListener('webglcontextlost', lost);
    element.addEventListener('webglcontextrestored', restored);
    return () => {
      element.removeEventListener('webglcontextlost', lost);
      element.removeEventListener('webglcontextrestored', restored);
    };
  }, [element]);
  return null;
}

/** Error boundary of one view: a failing group falls back to PNGs, the others keep running. */
function SlotBoundary({ id, onError, children }: { id: string; onError: (id: string, error: Error) => void; children: React.ReactNode }) {
  const handleError = useCallback((error: Error) => onError(id, error), [id, onError]);
  return (
    <ErrorBoundary fallback={null} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * The single WebGL canvas of the hanging medals: fixed over the viewport, transparent and
 * pointer-transparent; every slot is a drei `<View>` scissored to its DOM band (`trackRef`),
 * with its own camera, environment, physics world and pause. Pointer events come from
 * `eventSourceRef` and each view only takes those aimed at its band, so the page keeps
 * scrolling with the wheel and with touch (bands are `touch-action: pan-y`).
 */
export default function MedalStageCanvas({ slots, config, eventSourceRef, onSlotReady, onSlotError }: MedalStageCanvasProps) {
  const anyActive = slots.some((slot) => slot.active);
  const activeIds = useMemo(() => slots.filter((slot) => slot.active).map((slot) => slot.id).join(','), [slots]);

  useEffect(() => {
    log.debug(activeIds ? 'shared canvas rendering' : 'shared canvas idle (no view in viewport)', { active: activeIds || 'none' });
  }, [activeIds]);

  useEffect(() => {
    log.info('shared medal canvas mounted');
    return () => log.debug('shared medal canvas unmounted');
  }, []);

  const handleCreated = useCallback((state: RootState) => {
    state.gl.toneMapping = TONE_MAPPING[config.toneMapping];
    state.gl.toneMappingExposure = config.exposure;
    const context = state.gl.getContext();
    log.info('shared medal canvas: WebGL context created', {
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext,
      dpr: state.viewport.dpr,
      size: `${state.size.width}x${state.size.height}`,
    });
  }, [config.toneMapping, config.exposure]);

  return (
    <Canvas
      aria-hidden
      data-ui="medal-stage-canvas"
      // R3F/drei type these refs as mutable; they are only read.
      eventSource={eventSourceRef as MutableRefObject<HTMLElement>}
      eventPrefix="client"
      style={{ position: 'fixed', inset: 0, zIndex: 30, pointerEvents: 'none', visibility: anyActive ? 'visible' : 'hidden' }}
      resize={{ scroll: false }}
      dpr={config.dpr}
      frameloop={anyActive ? 'always' : 'demand'}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={handleCreated}
    >
      <FrameClear anyActive={anyActive} />
      <ContextWatch />
      {slots.map((slot) => (
        <View key={slot.id} track={slot.trackRef as MutableRefObject<HTMLElement>} index={FIRST_VIEW + slot.order} visible={slot.active}>
          <SlotBoundary id={slot.id} onError={onSlotError}>
            <MedalGroupScene slot={slot} config={config} onReady={onSlotReady} />
          </SlotBoundary>
        </View>
      ))}
    </Canvas>
  );
}
