import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { MathUtils } from 'three';
import { createLogger } from '@utils/logger';
import { MedalRig } from './MedalRig';
import type { HangingLayout, MedalCollisions, MedalPhysics, ResolvedMedal } from './types';

const log = createLogger('medals');

export interface HangingMedalsCanvasProps {
  medals: ResolvedMedal[];
  layout: HangingLayout;
  physics: MedalPhysics;
  collisions: MedalCollisions | null;
  /** False out of the viewport: physics paused and frameloop on demand. */
  active: boolean;
  onMedalHover?: (id: string | null) => void;
  /** Element that receives the pointer events (the hanging container): the canvas itself ignores them, so the page below stays interactive. */
  eventSource: HTMLElement;
  /** Called once the GLB, textures and physics are ready and the rigs are mounted. */
  onReady?: () => void;
}

/** Vertical field of view: the z = 0 plane spans exactly the canvas height (100 px = 1 unit). */
const FOV = 20;

/** Blocks touch scrolling only while a medal is being dragged (touch-action stays pan-y). */
function TouchScrollGuard({ grabbingRef, element }: { grabbingRef: MutableRefObject<boolean>; element: HTMLElement }) {
  useEffect(() => {
    const block = (event: TouchEvent) => {
      if (grabbingRef.current && event.cancelable) event.preventDefault();
    };
    element.addEventListener('touchstart', block, { passive: false });
    element.addEventListener('touchmove', block, { passive: false });
    return () => {
      element.removeEventListener('touchstart', block);
      element.removeEventListener('touchmove', block);
    };
  }, [element, grabbingRef]);
  return null;
}

/** Medal rigs in canvas units: x from the anchors, rail at the top edge of the canvas. */
function MedalRigs({ medals, layout, physics, collisions, active, onMedalHover, grabbingRef }: Omit<HangingMedalsCanvasProps, 'onReady' | 'eventSource'> & { grabbingRef: MutableRefObject<boolean> }) {
  const size = useThree((state) => state.size);
  const ppu = physics.pxPerUnit;
  const railY = size.height / 2 / ppu;
  return (
    <>
      {medals.map((medal) => (
        <MedalRig
          key={medal.id}
          medal={medal}
          railX={(medal.anchorX - size.width / 2) / ppu}
          railY={railY}
          layout={layout}
          physics={physics}
          collisions={collisions}
          active={active}
          grabbingRef={grabbingRef}
          onHover={onMedalHover}
        />
      ))}
    </>
  );
}

function ReadySignal({ startedAt, urls, onReady }: { startedAt: number; urls: string[]; onReady?: () => void }) {
  useEffect(() => {
    log.info('GLB loaded, rigs mounted', { urls, ms: Math.round(performance.now() - startedAt) });
    onReady?.();
  }, [startedAt, urls, onReady]);
  return null;
}

/**
 * Canvas of the hanging medals (lazy chunk: three + rapier). Decorative: aria-hidden, the DOM
 * keeps all the information. Out of the viewport the simulation pauses and nothing renders.
 */
export default function HangingMedalsCanvas({ medals, layout, physics, collisions, active, onMedalHover, onReady, eventSource }: HangingMedalsCanvasProps) {
  const glbUrls = useMemo(() => [...new Set(medals.map((medal) => medal.assets.glb))], [medals]);
  const grabbingRef = useRef(false);
  const startedAt = useMemo(() => performance.now(), []);
  const cameraZ = useMemo(
    () => layout.canvasHeight / physics.pxPerUnit / 2 / Math.tan(MathUtils.degToRad(FOV / 2)),
    [layout.canvasHeight, physics.pxPerUnit],
  );

  const mountInfo = useRef({ layout: layout.id, medals: medals.length });
  useEffect(() => {
    const info = mountInfo.current;
    log.info('canvas mounted', info);
    return () => log.debug('canvas unmounted', info);
  }, []);

  useEffect(() => {
    log.debug(active ? 'physics resumed (in viewport)' : 'physics paused (out of viewport)');
  }, [active]);

  return (
    <Canvas
      aria-hidden
      data-ui="hanging-medals-canvas"
      style={{ touchAction: 'pan-y', pointerEvents: 'none' }}
      eventSource={eventSource}
      eventPrefix="client"
      dpr={[1, 2]}
      frameloop={active ? 'always' : 'demand'}
      camera={{ fov: FOV, position: [0, 0, cameraZ], near: 0.1, far: cameraZ + 20 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[-3, 5, 4]} intensity={2.2} color="#FFF1D6" />
      <pointLight position={[2, 1, -3]} intensity={0.6} decay={0} color="#DC143C" />
      {/* Studio env built from local light-formers (no HDRI download): the metal reflects these. */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#14110f']} />
        <Lightformer form="rect" intensity={0.7} color="#FFF1D6" position={[0, 0, 6]} scale={[14, 8, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#FFF1D6" position={[-4, 5, 3]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1} position={[5, 1, 2]} scale={[3, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" color="#DC143C" intensity={1.5} position={[2, 1, -4]} scale={3} />
      </Environment>
      <TouchScrollGuard grabbingRef={grabbingRef} element={eventSource} />
      <Suspense fallback={null}>
        <Physics paused={!active} timeStep={1 / 60} updatePriority={-1}>
          <MedalRigs
            medals={medals}
            layout={layout}
            physics={physics}
            collisions={collisions}
            active={active}
            onMedalHover={onMedalHover}
            grabbingRef={grabbingRef}
          />
        </Physics>
        <ReadySignal startedAt={startedAt} urls={glbUrls} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
