import React, { FC, MutableRefObject, Suspense, useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Cloud } from '@react-three/drei';
import * as THREE from 'three';

export interface SmokeState {
  opacity: number;
  offset: number;
}

export interface SmokeOverlayProps {
  smokeStateRef: MutableRefObject<SmokeState>;
  className?: string;
}

interface CloudConfig {
  seed: number;
  scale: [number, number, number];
  volume: number;
  color: string;
  speed: number;
  fade: number;
  segments: number;
  position: [number, number, number];
  growth: number;
  concentrate: 'inside' | 'outside';
  drift: number;
  fixed?: boolean;
}

const CLOUD_OPACITY = 0.6;
const BASE_OPACITY = 0.6;

// Memoize cloud configs to prevent recreation
const CLOUD_CONFIGS: CloudConfig[] = [
  { seed: 1, scale: [9, 3.5, 3.5], volume: 22, color: '#888888', speed: 0.1, fade: 30, segments: 12, position: [0, 10, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
  { seed: 2, scale: [7, 2.5, 2.5], volume: 14, color: '#999999', speed: 0.08, fade: 26, segments: 10, position: [-8, 8, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
  { seed: 3, scale: [7, 2.5, 2.5], volume: 14, color: '#777777', speed: 0.09, fade: 26, segments: 10, position: [8, 9, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
  { seed: 4, scale: [9, 3, 3], volume: 16, color: '#888888', speed: 0.07, fade: 28, segments: 10, position: [0, 1, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
  { seed: 5, scale: [11, 2.5, 5], volume: 18, color: '#666666', speed: 0.05, fade: 35, segments: 10, position: [-10, -11, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
  { seed: 6, scale: [9, 2.5, 3.5], volume: 14, color: '#555555', speed: 0.04, fade: 32, segments: 10, position: [10, -12, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
  { seed: 7, scale: [10, 3, 4], volume: 16, color: '#666666', speed: 0.045, fade: 32, segments: 10, position: [0, -14, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
  { seed: 200, scale: [5, 2, 2], volume: 8, color: '#aaaaaa', speed: 0.03, fade: 20, segments: 8, position: [12, -2, -8], growth: 0.3, concentrate: 'inside', drift: 0, fixed: true },
  { seed: 201, scale: [6, 2.5, 2.5], volume: 10, color: '#bbbbbb', speed: 0.025, fade: 22, segments: 8, position: [10, 2, -9], growth: 0.3, concentrate: 'inside', drift: 0, fixed: true },
  { seed: 202, scale: [7, 3, 3], volume: 12, color: '#cccccc', speed: 0.02, fade: 24, segments: 8, position: [14, -4, -10], growth: 0.3, concentrate: 'inside', drift: 0, fixed: true },
  { seed: 203, scale: [4, 1.8, 1.8], volume: 6, color: '#aaaaaa', speed: 0.035, fade: 18, segments: 8, position: [8, 0, -7], growth: 0.3, concentrate: 'inside', drift: 0, fixed: true },
  { seed: 204, scale: [5.5, 2.2, 2.2], volume: 9, color: '#bbbbbb', speed: 0.028, fade: 20, segments: 8, position: [15, 4, -8], growth: 0.3, concentrate: 'inside', drift: 0, fixed: true },
];

function getCameraZ(width: number): number {
  if (width <= 480) return 20;
  if (width <= 540) return 19;
  if (width <= 640) return 18;
  if (width <= 760) return 16;
  return 20;
}

interface CloudControllerProps {
  smokeStateRef: MutableRefObject<SmokeState>;
  cloudConfigs: CloudConfig[];
}

// Camera updater - updates camera position without recreating WebGL context
const CameraUpdater: FC<{ cameraZ: number }> = ({ cameraZ }) => {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.z = cameraZ;
    camera.updateProjectionMatrix();
  }, [camera, cameraZ]);

  return null;
};

const CloudController: FC<CloudControllerProps> = ({ smokeStateRef, cloudConfigs }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const materialOpacityRef = useRef(1);
  const currentOffsetRef = useRef(0);
  // Store initial positions once - use useMemo to compute once
  const initialPositions = useMemo(() => {
    const map = new Map<number, [number, number, number]>();
    cloudConfigs.forEach(cfg => map.set(cfg.seed, cfg.position));
    return map;
  }, [cloudConfigs]);

  useFrame(() => {
    const state = smokeStateRef.current;
    const targetOpacity = state.opacity;
    const targetOffset = state.offset;

    const lerpFactor = 0.12;
    materialOpacityRef.current += (targetOpacity - materialOpacityRef.current) * lerpFactor;
    currentOffsetRef.current += (targetOffset - currentOffsetRef.current) * lerpFactor;

    if (groupRef.current) {
      groupRef.current.position.y = currentOffsetRef.current * 30;

      groupRef.current.children.forEach((child, index) => {
        const cfg = cloudConfigs[index];
        if (cfg && !cfg.fixed && initialPositions.has(cfg.seed)) {
          const initialPos = initialPositions.get(cfg.seed)!;
          child.position.x = initialPos[0] + currentOffsetRef.current * cfg.drift * 40;
        }
        const opacity = cfg.fixed ? 1 : materialOpacityRef.current * BASE_OPACITY;
        child.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mat = mesh.material as THREE.MeshLambertMaterial;
            if (mat.opacity !== undefined) {
              mat.opacity = opacity;
              mat.transparent = true;
              mat.depthWrite = false;
            }
          }
        });
      });
    }

    invalidate();
  });

  return (
    <group ref={groupRef}>
      {cloudConfigs.map((cfg) => (
        <Cloud
          key={cfg.seed}
          seed={cfg.seed}
          scale={cfg.scale}
          volume={cfg.volume}
          color={cfg.color}
          opacity={CLOUD_OPACITY}
          speed={cfg.speed}
          fade={cfg.fade}
          segments={cfg.segments}
          position={cfg.position}
          growth={cfg.growth}
          concentrate={cfg.concentrate}
        />
      ))}
    </group>
  );
};

export const SmokeOverlay: FC<SmokeOverlayProps> = ({
  smokeStateRef,
  className = '',
}) => {
  // Calculate initial camera Z - no state to avoid re-renders
  const cameraZ = useMemo(() =>
    getCameraZ(typeof window !== 'undefined' ? window.innerWidth : 1024),
    []
  );

  const divClassName = 'absolute inset-0 pointer-events-none overflow-hidden ' + className;

  return (
    <div
      className={divClassName}
      style={{ zIndex: 10, background: 'transparent' }}
      data-component="SmokeOverlay"
    >
      <Canvas
        id="fixed-clouds-canvas"
        camera={{ fov: 60, position: [0, 0, cameraZ], near: 0.1, far: 2000 }}
        scene={{ background: null }}
        style={{ background: 'transparent' }}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <CameraUpdater cameraZ={cameraZ} />
        <ambientLight intensity={0.5} />
        <directionalLight intensity={0.3} position={[0, 1, 1]} />
        <Suspense fallback={null}>
          <CloudController smokeStateRef={smokeStateRef} cloudConfigs={CLOUD_CONFIGS} />
        </Suspense>
      </Canvas>
    </div>
  );
};
