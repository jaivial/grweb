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

interface BreakpointConfig {
  scaleMultiplier: number;
  clouds: CloudConfig[];
}

const CLOUD_OPACITY = 0.8;
const BASE_OPACITY = 0.8;

function getBreakpointConfig(width: number): BreakpointConfig {
  if (width <= 320) {
    const s = 0.25;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 101, scale: [4 * s, 1.5 * s, 1.5 * s], volume: 8 * s, color: '#888888', speed: 0.08, fade: 16, segments: 7, position: [0, -15, -8], growth: 0.25, concentrate: 'inside' },
        { seed: 102, scale: [3 * s, 1 * s, 1 * s], volume: 6 * s, color: '#999999', speed: 0.06, fade: 15, segments: 6, position: [-3 * s, -14, -9], growth: 0.2, concentrate: 'inside' },
        { seed: 103, scale: [3 * s, 1 * s, 1 * s], volume: 6 * s, color: '#777777', speed: 0.07, fade: 15, segments: 6, position: [3 * s, -16, -10], growth: 0.2, concentrate: 'inside' },
        { seed: 104, scale: [3.5 * s, 1.2 * s, 1.2 * s], volume: 7 * s, color: '#888888', speed: 0.05, fade: 17, segments: 6, position: [-2 * s, -17, -11], growth: 0.2, concentrate: 'outside' },
        { seed: 105, scale: [3.5 * s, 1.2 * s, 1.2 * s], volume: 7 * s, color: '#666666', speed: 0.055, fade: 16, segments: 6, position: [2 * s, -18, -12], growth: 0.2, concentrate: 'outside' },
      ],
    };
  }

  if (width <= 480) {
    const s = 0.35;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 101, scale: [5 * s, 2 * s, 2 * s], volume: 10 * s, color: '#888888', speed: 0.08, fade: 18, segments: 8, position: [0, -16, -8], growth: 0.25, concentrate: 'inside' },
        { seed: 102, scale: [4 * s, 1.3 * s, 1.3 * s], volume: 8 * s, color: '#999999', speed: 0.06, fade: 16, segments: 7, position: [-4 * s, -15, -9], growth: 0.2, concentrate: 'inside' },
        { seed: 103, scale: [4 * s, 1.3 * s, 1.3 * s], volume: 8 * s, color: '#777777', speed: 0.07, fade: 16, segments: 7, position: [4 * s, -17, -10], growth: 0.2, concentrate: 'inside' },
        { seed: 104, scale: [4.5 * s, 1.5 * s, 1.5 * s], volume: 9 * s, color: '#888888', speed: 0.05, fade: 19, segments: 7, position: [-3 * s, -18, -11], growth: 0.2, concentrate: 'outside' },
        { seed: 105, scale: [4.5 * s, 1.5 * s, 1.5 * s], volume: 9 * s, color: '#666666', speed: 0.055, fade: 18, segments: 7, position: [3 * s, -19, -12], growth: 0.2, concentrate: 'outside' },
      ],
    };
  }

  if (width <= 640) {
    const s = 0.5;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 101, scale: [6 * s, 2.5 * s, 2.5 * s], volume: 14 * s, color: '#888888', speed: 0.08, fade: 20, segments: 9, position: [0, -18, -8], growth: 0.25, concentrate: 'inside' },
        { seed: 102, scale: [5 * s, 1.8 * s, 1.8 * s], volume: 10 * s, color: '#999999', speed: 0.06, fade: 18, segments: 8, position: [-5 * s, -17, -9], growth: 0.2, concentrate: 'inside' },
        { seed: 103, scale: [5 * s, 1.8 * s, 1.8 * s], volume: 10 * s, color: '#777777', speed: 0.07, fade: 18, segments: 8, position: [5 * s, -19, -10], growth: 0.2, concentrate: 'inside' },
        { seed: 104, scale: [5.5 * s, 2 * s, 2 * s], volume: 12 * s, color: '#888888', speed: 0.05, fade: 22, segments: 8, position: [-4 * s, -20, -11], growth: 0.2, concentrate: 'outside' },
        { seed: 105, scale: [5.5 * s, 2 * s, 2 * s], volume: 12 * s, color: '#666666', speed: 0.055, fade: 20, segments: 8, position: [4 * s, -21, -12], growth: 0.2, concentrate: 'outside' },
      ],
    };
  }

  if (width <= 769) {
    const s = 0.65;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 101, scale: [7 * s, 3 * s, 3 * s], volume: 18 * s, color: '#888888', speed: 0.08, fade: 22, segments: 10, position: [0, -20, -8], growth: 0.25, concentrate: 'inside' },
        { seed: 102, scale: [6 * s, 2.2 * s, 2.2 * s], volume: 12 * s, color: '#999999', speed: 0.06, fade: 19, segments: 9, position: [-6 * s, -19, -9], growth: 0.2, concentrate: 'inside' },
        { seed: 103, scale: [6 * s, 2.2 * s, 2.2 * s], volume: 12 * s, color: '#777777', speed: 0.07, fade: 19, segments: 9, position: [6 * s, -21, -10], growth: 0.2, concentrate: 'inside' },
        { seed: 104, scale: [6.5 * s, 2.5 * s, 2.5 * s], volume: 14 * s, color: '#888888', speed: 0.05, fade: 24, segments: 9, position: [-5 * s, -22, -11], growth: 0.2, concentrate: 'outside' },
        { seed: 105, scale: [6.5 * s, 2.5 * s, 2.5 * s], volume: 14 * s, color: '#666666', speed: 0.055, fade: 22, segments: 9, position: [5 * s, -23, -12], growth: 0.2, concentrate: 'outside' },
      ],
    };
  }

  if (width <= 980) {
    const s = 0.8;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 101, scale: [8 * s, 3.5 * s, 3.5 * s], volume: 20 * s, color: '#888888', speed: 0.08, fade: 24, segments: 10, position: [0, -22, -8], growth: 0.25, concentrate: 'inside' },
        { seed: 102, scale: [7 * s, 2.5 * s, 2.5 * s], volume: 14 * s, color: '#999999', speed: 0.06, fade: 20, segments: 9, position: [-7 * s, -21, -9], growth: 0.2, concentrate: 'inside' },
        { seed: 103, scale: [7 * s, 2.5 * s, 2.5 * s], volume: 14 * s, color: '#777777', speed: 0.07, fade: 20, segments: 9, position: [7 * s, -23, -10], growth: 0.2, concentrate: 'inside' },
        { seed: 104, scale: [7.5 * s, 3 * s, 3 * s], volume: 16 * s, color: '#888888', speed: 0.05, fade: 26, segments: 9, position: [-6 * s, -24, -11], growth: 0.2, concentrate: 'outside' },
        { seed: 105, scale: [7.5 * s, 3 * s, 3 * s], volume: 16 * s, color: '#666666', speed: 0.055, fade: 24, segments: 9, position: [6 * s, -25, -12], growth: 0.2, concentrate: 'outside' },
      ],
    };
  }

  if (width <= 1024) {
    const s = 0.9;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 101, scale: [9 * s, 4 * s, 4 * s], volume: 22 * s, color: '#888888', speed: 0.08, fade: 26, segments: 11, position: [0, -24, -8], growth: 0.25, concentrate: 'inside' },
        { seed: 102, scale: [8 * s, 3 * s, 3 * s], volume: 16 * s, color: '#999999', speed: 0.06, fade: 22, segments: 10, position: [-8 * s, -23, -9], growth: 0.2, concentrate: 'inside' },
        { seed: 103, scale: [8 * s, 3 * s, 3 * s], volume: 16 * s, color: '#777777', speed: 0.07, fade: 22, segments: 10, position: [8 * s, -25, -10], growth: 0.2, concentrate: 'inside' },
        { seed: 104, scale: [8.5 * s, 3.5 * s, 3.5 * s], volume: 18 * s, color: '#888888', speed: 0.05, fade: 28, segments: 10, position: [-7 * s, -26, -11], growth: 0.2, concentrate: 'outside' },
        { seed: 105, scale: [8.5 * s, 3.5 * s, 3.5 * s], volume: 18 * s, color: '#666666', speed: 0.055, fade: 26, segments: 10, position: [7 * s, -27, -12], growth: 0.2, concentrate: 'outside' },
      ],
    };
  }

  // > 1024px: full size
  const s = 1;
  return {
    scaleMultiplier: s,
    clouds: [
      { seed: 101, scale: [10 * s, 4.5 * s, 4.5 * s], volume: 24 * s, color: '#888888', speed: 0.08, fade: 28, segments: 12, position: [0, -26, -8], growth: 0.25, concentrate: 'inside' },
      { seed: 102, scale: [9 * s, 3.5 * s, 3.5 * s], volume: 18 * s, color: '#999999', speed: 0.06, fade: 24, segments: 10, position: [-9 * s, -25, -9], growth: 0.2, concentrate: 'inside' },
      { seed: 103, scale: [9 * s, 3.5 * s, 3.5 * s], volume: 18 * s, color: '#777777', speed: 0.07, fade: 24, segments: 10, position: [9 * s, -27, -10], growth: 0.2, concentrate: 'inside' },
      { seed: 104, scale: [9.5 * s, 4 * s, 4 * s], volume: 20 * s, color: '#888888', speed: 0.05, fade: 30, segments: 10, position: [-8 * s, -28, -11], growth: 0.2, concentrate: 'outside' },
      { seed: 105, scale: [9.5 * s, 4 * s, 4 * s], volume: 20 * s, color: '#666666', speed: 0.055, fade: 28, segments: 10, position: [8 * s, -29, -12], growth: 0.2, concentrate: 'outside' },
    ],
  };
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
      // Move clouds from bottom (negative Y) to fill the screen (Y = 0)
      // The total movement distance is from their starting positions to Y = 0
      groupRef.current.children.forEach((child, index) => {
        const cfg = cloudConfigs[index];
        if (cfg) {
          const startY = cfg.position[1];
          const targetY = 0; // Fill the viewport
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
  const [breakpointConfig, setBreakpointConfig] = useState<BreakpointConfig>(() =>
    getBreakpointConfig(typeof window !== 'undefined' ? window.innerWidth : 1024)
  );

  useEffect(() => {
    const handleResize = () => {
      setBreakpointConfig(getBreakpointConfig(window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const divClassName = 'absolute inset-0 pointer-events-none overflow-hidden ' + className;

  return (
    <div
      className={divClassName}
      style={{ zIndex: 15 }}
      data-component="CloudsEnter"
    >
      <Canvas
        camera={{ fov: 60, position: [0, 0, 20], near: 0.1, far: 2000 }}
        scene={{ background: null }}
        style={{ background: 'transparent' }}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <ambientLight intensity={0.5} />
        <directionalLight intensity={0.3} position={[0, 1, 1]} />
        <CloudController progress={progress} cloudConfigs={breakpointConfig.clouds} />
      </Canvas>
    </div>
  );
};
