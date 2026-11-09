import { Suspense, useCallback, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { Environment, Lightformer, PerspectiveCamera } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { MathUtils } from 'three';
import { createLogger } from '@utils/logger';
import { MedalRig, type RigEntrance } from './MedalRig';
import type { MedalSlot } from './MedalStage';
import type { MedalAssets, MedalMaterial, MedalStageConfig } from './types';

const log = createLogger('medals');

/** Vertical field of view: the z = 0 plane spans exactly the band height (pxPerUnit px = 1 unit). */
const FOV = 20;

export interface MedalGroupSceneProps {
  slot: MedalSlot;
  config: MedalStageConfig;
  onReady: (id: string) => void;
}

/** Blocks touch scrolling only while a medal is being dragged (the band stays touch-action pan-y). */
function useTouchScrollGuard(trackRef: RefObject<HTMLElement>, grabbingRef: MutableRefObject<boolean>) {
  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const block = (event: TouchEvent) => {
      if (grabbingRef.current && event.cancelable) event.preventDefault();
    };
    element.addEventListener('touchstart', block, { passive: false });
    element.addEventListener('touchmove', block, { passive: false });
    return () => {
      element.removeEventListener('touchstart', block);
      element.removeEventListener('touchmove', block);
    };
  }, [trackRef, grabbingRef]);
}

function ReadySignal({ id, startedAt, onReady }: { id: string; startedAt: number; onReady: (id: string) => void }) {
  useEffect(() => {
    log.info('medal view ready (GLB, textures and physics loaded)', { id, ms: Math.round(performance.now() - startedAt) });
    onReady(id);
  }, [id, startedAt, onReady]);
  return null;
}

/** Studio light of one view: direct lights plus the light-former environment the metal reflects. */
function StudioLight({ config }: { config: MedalStageConfig }) {
  const { environment: env } = config;
  return (
    <>
      <ambientLight intensity={config.ambientIntensity} />
      {config.lights.map((light, index) =>
        light.type === 'point' ? (
          <pointLight key={index} position={light.position} intensity={light.intensity} color={light.color} decay={0} />
        ) : (
          <directionalLight key={index} position={light.position} intensity={light.intensity} color={light.color} />
        ),
      )}
      {/* Built from local light-formers (no HDRI download); rendered once per view. No scene
          background colour in it: a <color attach="background"> leaves the GL clear colour opaque
          after the cube render, and the next full-canvas clear then blacked out the page. */}
      <Environment resolution={env.resolution} frames={1}>
        {env.lightformers.map((former, index) => (
          <Lightformer
            key={index}
            form={former.form}
            intensity={former.intensity}
            color={former.color}
            position={former.position}
            scale={former.scale}
            target={former.target}
          />
        ))}
      </Environment>
    </>
  );
}

/**
 * Contents of one `<View>`: camera framing the band, studio light and the group's physics world.
 * Every value comes from the slot, so a breakpoint change re-renders it in place: the camera
 * moves, the rigs rescale and re-hang; the world, the joints and the GLB clones are kept.
 */
export function MedalGroupScene({ slot, config, onReady }: MedalGroupSceneProps) {
  const { id, medals, layout, width, physics, collisions, active, onHover, trackRef, entrance } = slot;
  const ppu = physics.pxPerUnit;
  const grabbingRef = useRef(false);
  const startedAt = useMemo(() => performance.now(), []);
  useTouchScrollGuard(trackRef, grabbingRef);

  const cameraZ = layout.canvasHeight / ppu / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
  const railY = layout.canvasHeight / 2 / ppu;

  // Stage finish + per-metal overrides: one stable object per metal (the model clone depends on
  // it), cached by asset entry because the medal objects change with every re-measure.
  const materialCache = useMemo(() => new Map<MedalAssets, MedalMaterial>(), [config.material]);
  const materialFor = useCallback((assets: MedalAssets) => {
    let material = materialCache.get(assets);
    if (!material) {
      material = { ...config.material, ...assets.material };
      materialCache.set(assets, material);
    }
    return material;
  }, [materialCache, config.material]);

  // Per-medal entrance: group timing + the medal's place in the sequence.
  const entrances = useMemo<RigEntrance[]>(
    () =>
      medals.map((medal, index) => ({
        state: entrance.state,
        startAt: entrance.startAt,
        delayMs: (medal.entryOrder ?? index) * entrance.staggerMs,
        durationMs: layout.entranceMs,
        curve: entrance.curve,
      })),
    [medals, entrance, layout.entranceMs],
  );

  // Logged once per start, not on every re-measure.
  const entrancesRef = useRef(entrances);
  entrancesRef.current = entrances;
  useEffect(() => {
    if (entrance.state === 'playing') log.info('entrance drop', { id, durationMs: layout.entranceMs, delays: entrancesRef.current.map((e) => e.delayMs) });
  }, [id, entrance.state, entrance.startAt, layout.entranceMs]);

  const setCursor = useCallback((cursor: string) => {
    if (trackRef.current) trackRef.current.style.cursor = cursor;
  }, [trackRef]);

  const previousLayout = useRef(layout.id);
  useEffect(() => {
    if (previousLayout.current === layout.id) return;
    log.info('breakpoint change: re-anchoring medals in place (no remount)', { id, from: previousLayout.current, to: layout.id, width });
    previousLayout.current = layout.id;
  }, [id, layout.id, width]);

  useEffect(() => {
    log.debug(active ? 'physics resumed (in viewport)' : 'physics paused (out of viewport)', { id });
  }, [id, active]);

  const mountedLayout = useRef(layout.id);
  useEffect(() => {
    log.debug('medal view mounted', { id, layout: mountedLayout.current });
    return () => log.debug('medal view unmounted', { id });
  }, [id]);

  return (
    <>
      <PerspectiveCamera makeDefault fov={FOV} position={[0, 0, cameraZ]} near={0.1} far={cameraZ + 20} />
      <StudioLight config={config} />
      <Suspense fallback={null}>
        <Physics paused={!active} timeStep={1 / 60} updatePriority={-1}>
          {medals.map((medal, index) => (
            <MedalRig
              key={medal.id}
              medal={medal}
              railX={(medal.anchorX - width / 2) / ppu}
              railY={railY}
              layout={layout}
              physics={physics}
              material={materialFor(medal.assets)}
              collisions={collisions}
              active={active}
              grabbingRef={grabbingRef}
              setCursor={setCursor}
              onHover={onHover}
              entrance={entrances[index]}
            />
          ))}
        </Physics>
        <ReadySignal id={id} startedAt={startedAt} onReady={onReady} />
      </Suspense>
    </>
  );
}
