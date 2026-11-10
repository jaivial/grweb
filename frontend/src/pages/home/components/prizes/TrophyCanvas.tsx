import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { Box3, Vector3, type Group } from 'three';
import { createLogger } from '@utils/logger';

const log = createLogger('trophy');

/** Draco decoder served from our own origin (meshopt ships inside three-stdlib, no files needed). */
useGLTF.setDecoderPath('/draco/gltf/');

/** One full turn in seconds (medium-slow). */
export const TROPHY_TURN_SECONDS = 12;
/** Height of the fitted model in world units. */
const MODEL_HEIGHT = 3.3;
/** The GLB's handles span its Z axis (wide side): turn it so the wide side faces the camera at start. */
const FRONT_OFFSET_Y = Math.PI / 2;
/** Extra turn of the fixed pose (reduced motion): a slight 3/4 view. */
const STILL_ROTATION_Y = -0.35;

interface TrophyModelProps {
  url: string;
  spin: boolean;
  onReady: () => void;
}

function TrophyModel({ url, spin, onReady }: TrophyModelProps) {
  // Draco + meshopt enabled: the GLB may use either (or none).
  const { scene } = useGLTF(url, true, true);
  const groupRef = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  const fit = useMemo(() => {
    const object = scene.clone(true);
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const scale = MODEL_HEIGHT / (size.y || 1);
    return { object, scale, offset: centre.multiplyScalar(-scale) };
  }, [scene]);

  useLayoutEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = spin ? 0 : STILL_ROTATION_Y;
    invalidate();
  }, [spin, invalidate]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame((_, delta) => {
    if (spin && groupRef.current) groupRef.current.rotation.y += (delta * Math.PI * 2) / TROPHY_TURN_SECONDS;
  });

  return (
    <group ref={groupRef}>
      <group rotation={[0, FRONT_OFFSET_Y, 0]}>
        <group position={fit.offset} scale={fit.scale}>
          <primitive object={fit.object} />
        </group>
      </group>
    </group>
  );
}

export interface TrophyCanvasProps {
  url: string;
  /** In viewport: renders every frame; otherwise the loop is stopped. */
  active: boolean;
  /** False (prefers-reduced-motion): fixed pose, renders on demand only. */
  spin: boolean;
  onReady: () => void;
}

/** Lazy chunk: three + R3F canvas with the rotating trophy GLB. Decorative (aria-hidden). */
export default function TrophyCanvas({ url, active, spin, onReady }: TrophyCanvasProps) {
  const frameloop = !spin ? 'demand' : active ? 'always' : 'never';
  const handleReady = useMemo(
    () => () => {
      log.info('trophy GLB ready', { url });
      onReady();
    },
    [url, onReady],
  );
  return (
    <Canvas
      aria-hidden
      data-ui="trophy-canvas"
      style={{ touchAction: 'pan-y' }}
      dpr={[1, 2]}
      frameloop={frameloop}
      camera={{ fov: 28, position: [0, 0.15, 7.5], near: 0.1, far: 30 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[-3, 5, 4]} intensity={2.2} color="#FFF1D6" />
      <pointLight position={[3, 1, -3]} intensity={0.6} decay={0} color="#DC143C" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#14110f']} />
        <Lightformer form="rect" intensity={0.8} color="#FFF1D6" position={[0, 0, 6]} scale={[14, 8, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#FFF1D6" position={[-4, 5, 3]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1} position={[5, 1, 2]} scale={[3, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" color="#DC143C" intensity={1.5} position={[2, 1, -4]} scale={3} />
      </Environment>
      <Suspense fallback={null}>
        <TrophyModel url={url} spin={spin} onReady={handleReady} />
      </Suspense>
    </Canvas>
  );
}
