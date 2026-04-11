import React, { FC, useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Cloud } from '@react-three/drei';
import * as THREE from 'three';

export interface CloudsEnterProps {
  progress: number;
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
}

const CLOUD_OPACITY = 0.6;
const BASE_OPACITY = 0.6;

const CLOUD_CONFIGS: CloudConfig[] = [
  { seed: 101, scale: [9, 4, 4], volume: 22, color: '#888888', speed: 0.08, fade: 32, segments: 12, position: [0, -26, -8], growth: 0.25, concentrate: 'inside' },
  { seed: 102, scale: [8, 3.5, 3.5], volume: 18, color: '#999999', speed: 0.06, fade: 28, segments: 11, position: [-9, -25, -9], growth: 0.2, concentrate: 'inside' },
  { seed: 103, scale: [8, 3.5, 3.5], volume: 18, color: '#777777', speed: 0.07, fade: 28, segments: 11, position: [9, -27, -10], growth: 0.2, concentrate: 'inside' },
  { seed: 104, scale: [10, 4, 4], volume: 20, color: '#888888', speed: 0.05, fade: 34, segments: 11, position: [-8, -28, -11], growth: 0.2, concentrate: 'outside' },
  { seed: 105, scale: [10, 4, 4], volume: 20, color: '#666666', speed: 0.055, fade: 32, segments: 11, position: [8, -29, -12], growth: 0.2, concentrate: 'outside' },
  { seed: 106, scale: [11, 4.5, 4.5], volume: 22, color: '#777777', speed: 0.045, fade: 34, segments: 11, position: [0, -30, -13], growth: 0.2, concentrate: 'outside' },
  { seed: 107, scale: [7, 3, 3], volume: 16, color: '#555555', speed: 0.05, fade: 30, segments: 10, position: [0, -24, -10], growth: 0.2, concentrate: 'inside' },
];

function getCameraZ(width: number): number {
  if (width <= 480) return 20;
  if (width <= 540) return 19;
  if (width <= 640) return 18;
  if (width <= 760) return 16;
  return 20;
}

interface CloudControllerProps {
  progress: number;
  cloudConfigs: CloudConfig[];
}

const CloudController: FC<CloudControllerProps> = ({ progress, cloudConfigs }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const currentProgressRef = useRef(0);

  useFrame(() => {
    const lerpFactor = 0.12;
    currentProgressRef.current += (progress - currentProgressRef.current) * lerpFactor;

    if (groupRef.current) {
      groupRef.current.children.forEach((child, index) => {
        const cfg = cloudConfigs[index];
        if (cfg) {
          const startY = cfg.position[1];
          const targetY = 0;
          child.position.y = startY + (targetY - startY) * currentProgressRef.current;
        }

        child.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mat = mesh.material as THREE.MeshLambertMaterial;
            if (mat.opacity !== undefined) {
              mat.opacity = currentProgressRef.current * BASE_OPACITY;
              mat.transparent = true;
              mat.depthWrite = false;
              mat.needsUpdate = true;
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

export const CloudsEnter: FC<CloudsEnterProps> = ({
  progress,
  className = '',
}) => {
  const [cameraZ, setCameraZ] = useState(() =>
    getCameraZ(typeof window !== 'undefined' ? window.innerWidth : 1024)
  );

  useEffect(() => {
    const handleResize = () => {
      setCameraZ(getCameraZ(window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const divClassName = 'absolute inset-0 pointer-events-none overflow-hidden ' + className;

  return (
    <div
      className={divClassName}
      style={{ zIndex: 15 }}
      data-ui="clouds-enter"
    >
      <Canvas
        key={cameraZ}
        camera={{ fov: 60, position: [0, 0, cameraZ], near: 0.1, far: 2000 }}
        scene={{ background: null }}
        style={{ background: 'transparent' }}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <ambientLight intensity={0.5} />
        <directionalLight intensity={0.3} position={[0, 1, 1]} />
        <CloudController progress={progress} cloudConfigs={CLOUD_CONFIGS} />
      </Canvas>
    </div>
  );
};
