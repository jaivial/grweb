import React, { FC, MutableRefObject, Suspense, useRef, useMemo, useState, useEffect } from 'react';
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
        { seed: 1, scale: [3 * s, 1.2 * s, 1.2 * s], volume: 6 * s, color: '#888888', speed: 0.1, fade: 15, segments: 6, position: [0, 2.5, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
        { seed: 2, scale: [2.5 * s, 0.9 * s, 0.9 * s], volume: 5 * s, color: '#999999', speed: 0.08, fade: 14, segments: 5, position: [-2.75 * s, 2, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
        { seed: 3, scale: [2 * s, 0.7 * s, 0.7 * s], volume: 4 * s, color: '#777777', speed: 0.09, fade: 14, segments: 5, position: [2.75 * s, 2.25, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
        { seed: 4, scale: [2.5 * s, 0.9 * s, 0.9 * s], volume: 4 * s, color: '#888888', speed: 0.07, fade: 14, segments: 5, position: [0, 0.25, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
        { seed: 5, scale: [2 * s, 0.7 * s, 0.7 * s], volume: 3 * s, color: '#999999', speed: 0.08, fade: 13, segments: 5, position: [-2.25 * s, -1.75, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
        { seed: 6, scale: [1.5 * s, 0.6 * s, 0.6 * s], volume: 2.5 * s, color: '#777777', speed: 0.06, fade: 12, segments: 4, position: [2.25 * s, -2, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
        { seed: 7, scale: [3.5 * s, 0.8 * s, 1.4 * s], volume: 5 * s, color: '#666666', speed: 0.05, fade: 16, segments: 5, position: [-2.75 * s, -2.75, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
        { seed: 8, scale: [2.75 * s, 0.65 * s, 1.1 * s], volume: 4 * s, color: '#555555', speed: 0.04, fade: 15, segments: 4, position: [2.75 * s, -3, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
        { seed: 9, scale: [2 * s, 0.55 * s, 0.85 * s], volume: 3.25 * s, color: '#777777', speed: 0.05, fade: 14, segments: 4, position: [-2.5 * s, -3.25, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
        { seed: 10, scale: [2.25 * s, 0.6 * s, 0.9 * s], volume: 3.5 * s, color: '#666666', speed: 0.045, fade: 15, segments: 4, position: [2.5 * s, -3.5, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
      ],
    };
  }

  if (width <= 480) {
    const s = 0.35;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 1, scale: [4 * s, 1.6 * s, 1.6 * s], volume: 9 * s, color: '#888888', speed: 0.1, fade: 17, segments: 7, position: [0, 3.5, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
        { seed: 2, scale: [3.5 * s, 1.2 * s, 1.2 * s], volume: 7 * s, color: '#999999', speed: 0.08, fade: 16, segments: 6, position: [-3.85 * s, 2.8, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
        { seed: 3, scale: [2.5 * s, 0.9 * s, 0.9 * s], volume: 5 * s, color: '#777777', speed: 0.09, fade: 16, segments: 6, position: [3.85 * s, 3.15, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
        { seed: 4, scale: [3.5 * s, 1.2 * s, 1.2 * s], volume: 6 * s, color: '#888888', speed: 0.07, fade: 16, segments: 6, position: [0, 0.35, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
        { seed: 5, scale: [2.5 * s, 0.9 * s, 0.9 * s], volume: 5 * s, color: '#999999', speed: 0.08, fade: 15, segments: 5, position: [-3.15 * s, -2.45, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
        { seed: 6, scale: [2 * s, 0.8 * s, 0.8 * s], volume: 4 * s, color: '#777777', speed: 0.06, fade: 14, segments: 5, position: [3.15 * s, -2.8, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
        { seed: 7, scale: [4.5 * s, 1 * s, 1.8 * s], volume: 7 * s, color: '#666666', speed: 0.05, fade: 18, segments: 6, position: [-4 * s, -3.85, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
        { seed: 8, scale: [3.5 * s, 0.8 * s, 1.4 * s], volume: 5.5 * s, color: '#555555', speed: 0.04, fade: 17, segments: 5, position: [4 * s, -4.2, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
        { seed: 9, scale: [2.8 * s, 0.7 * s, 1.1 * s], volume: 4.5 * s, color: '#777777', speed: 0.05, fade: 16, segments: 5, position: [-3.5 * s, -4.55, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
        { seed: 10, scale: [3.15 * s, 0.75 * s, 1.2 * s], volume: 5 * s, color: '#666666', speed: 0.045, fade: 17, segments: 5, position: [3.5 * s, -4.9, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
      ],
    };
  }

  if (width <= 640) {
    const s = 0.5;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 1, scale: [5 * s, 2 * s, 2 * s], volume: 12 * s, color: '#888888', speed: 0.1, fade: 19, segments: 8, position: [0, 5, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
        { seed: 2, scale: [4 * s, 1.3 * s, 1.3 * s], volume: 8 * s, color: '#999999', speed: 0.08, fade: 17, segments: 7, position: [-4.5 * s, 4, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
        { seed: 3, scale: [3 * s, 1 * s, 1 * s], volume: 6 * s, color: '#777777', speed: 0.09, fade: 17, segments: 7, position: [4.5 * s, 4.5, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
        { seed: 4, scale: [4 * s, 1.3 * s, 1.3 * s], volume: 8 * s, color: '#888888', speed: 0.07, fade: 16, segments: 6, position: [0, 0.5, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
        { seed: 5, scale: [3 * s, 1 * s, 1 * s], volume: 6 * s, color: '#999999', speed: 0.08, fade: 15, segments: 6, position: [-4 * s, -3.5, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
        { seed: 6, scale: [2.5 * s, 0.9 * s, 0.9 * s], volume: 5 * s, color: '#777777', speed: 0.06, fade: 14, segments: 5, position: [4 * s, -4, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
        { seed: 7, scale: [5.5 * s, 1.3 * s, 2.2 * s], volume: 9 * s, color: '#666666', speed: 0.05, fade: 22, segments: 7, position: [-5 * s, -5.5, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
        { seed: 8, scale: [4 * s, 1 * s, 1.6 * s], volume: 6.5 * s, color: '#555555', speed: 0.04, fade: 20, segments: 6, position: [5 * s, -6, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
        { seed: 9, scale: [3.5 * s, 0.9 * s, 1.4 * s], volume: 5.5 * s, color: '#777777', speed: 0.05, fade: 18, segments: 5, position: [-4 * s, -6.5, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
        { seed: 10, scale: [4 * s, 1 * s, 1.5 * s], volume: 6 * s, color: '#666666', speed: 0.045, fade: 19, segments: 6, position: [4 * s, -7, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
      ],
    };
  }

  if (width <= 769) {
    const s = 0.65;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 1, scale: [6 * s, 2.2 * s, 2.2 * s], volume: 14 * s, color: '#888888', speed: 0.1, fade: 19, segments: 9, position: [0, 6.5, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
        { seed: 2, scale: [4.5 * s, 1.4 * s, 1.4 * s], volume: 9 * s, color: '#999999', speed: 0.08, fade: 18, segments: 7, position: [-5.2 * s, 5.2, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
        { seed: 3, scale: [3.5 * s, 1.2 * s, 1.2 * s], volume: 7 * s, color: '#777777', speed: 0.09, fade: 18, segments: 7, position: [5.2 * s, 5.85, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
        { seed: 4, scale: [4.5 * s, 1.4 * s, 1.4 * s], volume: 9 * s, color: '#888888', speed: 0.07, fade: 17, segments: 7, position: [0, 0.65, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
        { seed: 5, scale: [3.5 * s, 1.2 * s, 1.2 * s], volume: 7 * s, color: '#999999', speed: 0.08, fade: 16, segments: 6, position: [-4.55 * s, -4.55, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
        { seed: 6, scale: [3 * s, 1 * s, 1 * s], volume: 5 * s, color: '#777777', speed: 0.06, fade: 15, segments: 6, position: [4.55 * s, -5.2, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
        { seed: 7, scale: [7 * s, 1.4 * s, 2.8 * s], volume: 10 * s, color: '#666666', speed: 0.05, fade: 23, segments: 7, position: [-6.5 * s, -7.15, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
        { seed: 8, scale: [5.2 * s, 1.1 * s, 2 * s], volume: 7.8 * s, color: '#555555', speed: 0.04, fade: 22, segments: 7, position: [6.5 * s, -7.8, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
        { seed: 9, scale: [4 * s, 1 * s, 1.5 * s], volume: 6.5 * s, color: '#777777', speed: 0.05, fade: 20, segments: 6, position: [-5.2 * s, -8.45, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
        { seed: 10, scale: [4.55 * s, 1.1 * s, 1.7 * s], volume: 7.15 * s, color: '#666666', speed: 0.045, fade: 21, segments: 6, position: [5.2 * s, -9.1, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
      ],
    };
  }

  if (width <= 980) {
    const s = 0.8;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 1, scale: [6.5 * s, 2.5 * s, 2.5 * s], volume: 15 * s, color: '#888888', speed: 0.1, fade: 20, segments: 9, position: [0, 8, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
        { seed: 2, scale: [5 * s, 1.6 * s, 1.6 * s], volume: 10 * s, color: '#999999', speed: 0.08, fade: 18, segments: 8, position: [-6.4 * s, 6.4, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
        { seed: 3, scale: [4 * s, 1.3 * s, 1.3 * s], volume: 8 * s, color: '#777777', speed: 0.09, fade: 18, segments: 8, position: [6.4 * s, 7.2, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
        { seed: 4, scale: [5 * s, 1.6 * s, 1.6 * s], volume: 10 * s, color: '#888888', speed: 0.07, fade: 18, segments: 8, position: [0, 0.8, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
        { seed: 5, scale: [4 * s, 1.3 * s, 1.3 * s], volume: 8 * s, color: '#999999', speed: 0.08, fade: 17, segments: 7, position: [-5.6 * s, -5.6, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
        { seed: 6, scale: [3 * s, 1.2 * s, 1.2 * s], volume: 6 * s, color: '#777777', speed: 0.06, fade: 16, segments: 7, position: [5.6 * s, -6.4, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
        { seed: 7, scale: [8 * s, 1.6 * s, 3 * s], volume: 12 * s, color: '#666666', speed: 0.05, fade: 24, segments: 8, position: [-8 * s, -8.8, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
        { seed: 8, scale: [6.4 * s, 1.4 * s, 2.4 * s], volume: 9.6 * s, color: '#555555', speed: 0.04, fade: 22, segments: 8, position: [8 * s, -9.6, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
        { seed: 9, scale: [5 * s, 1.2 * s, 1.8 * s], volume: 8 * s, color: '#777777', speed: 0.05, fade: 20, segments: 7, position: [-6.4 * s, -10.4, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
        { seed: 10, scale: [5.6 * s, 1.4 * s, 2 * s], volume: 8.8 * s, color: '#666666', speed: 0.045, fade: 21, segments: 7, position: [5.6 * s, -11.2, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
      ],
    };
  }

  if (width <= 1024) {
    const s = 0.9;
    return {
      scaleMultiplier: s,
      clouds: [
        { seed: 1, scale: [7 * s, 2.8 * s, 2.8 * s], volume: 16 * s, color: '#888888', speed: 0.1, fade: 20, segments: 10, position: [0, 9, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
        { seed: 2, scale: [5.5 * s, 1.8 * s, 1.8 * s], volume: 10 * s, color: '#999999', speed: 0.08, fade: 18, segments: 8, position: [-7.2 * s, 7.2, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
        { seed: 3, scale: [4.5 * s, 1.5 * s, 1.5 * s], volume: 9 * s, color: '#777777', speed: 0.09, fade: 18, segments: 8, position: [7.2 * s, 8.1, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
        { seed: 4, scale: [5.5 * s, 1.8 * s, 1.8 * s], volume: 11 * s, color: '#888888', speed: 0.07, fade: 18, segments: 8, position: [0, 0.9, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
        { seed: 5, scale: [4.5 * s, 1.5 * s, 1.5 * s], volume: 9 * s, color: '#999999', speed: 0.08, fade: 17, segments: 7, position: [-6.3 * s, -6.3, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
        { seed: 6, scale: [3.5 * s, 1.3 * s, 1.3 * s], volume: 7 * s, color: '#777777', speed: 0.06, fade: 16, segments: 7, position: [6.3 * s, -7.2, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
        { seed: 7, scale: [9 * s, 1.8 * s, 3.5 * s], volume: 13 * s, color: '#666666', speed: 0.05, fade: 24, segments: 8, position: [-9 * s, -9.9, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
        { seed: 8, scale: [7 * s, 1.6 * s, 2.8 * s], volume: 11 * s, color: '#555555', speed: 0.04, fade: 22, segments: 8, position: [9 * s, -10.8, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
        { seed: 9, scale: [5.5 * s, 1.3 * s, 2 * s], volume: 9 * s, color: '#777777', speed: 0.05, fade: 20, segments: 7, position: [-7.2 * s, -11.7, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
        { seed: 10, scale: [6.3 * s, 1.5 * s, 2.2 * s], volume: 10 * s, color: '#666666', speed: 0.045, fade: 21, segments: 7, position: [6.3 * s, -12.6, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
      ],
    };
  }

  // > 1024px: full size, 10 clouds distributed across top/middle/bottom with left/right drift
  const s = 1;
  return {
    scaleMultiplier: s,
    clouds: [
      { seed: 1, scale: [8 * s, 3 * s, 3 * s], volume: 18 * s, color: '#888888', speed: 0.1, fade: 20, segments: 10, position: [0, 10, -10], growth: 0.3, concentrate: 'inside', drift: 0.5 },
      { seed: 2, scale: [6 * s, 2 * s, 2 * s], volume: 12 * s, color: '#999999', speed: 0.08, fade: 18, segments: 8, position: [-8 * s, 8, -9], growth: 0.25, concentrate: 'inside', drift: -0.8 },
      { seed: 3, scale: [5 * s, 1.5 * s, 1.5 * s], volume: 10 * s, color: '#777777', speed: 0.09, fade: 18, segments: 8, position: [8 * s, 9, -11], growth: 0.25, concentrate: 'inside', drift: 0.7 },
      { seed: 4, scale: [6 * s, 2 * s, 2 * s], volume: 12 * s, color: '#888888', speed: 0.07, fade: 18, segments: 8, position: [0, 1, -10], growth: 0.25, concentrate: 'inside', drift: -0.3 },
      { seed: 5, scale: [5 * s, 1.5 * s, 1.5 * s], volume: 10 * s, color: '#999999', speed: 0.08, fade: 17, segments: 7, position: [-6 * s, -7, -9], growth: 0.25, concentrate: 'inside', drift: -1.2 },
      { seed: 6, scale: [4 * s, 1.5 * s, 1.5 * s], volume: 8 * s, color: '#777777', speed: 0.06, fade: 16, segments: 7, position: [6 * s, -8, -11], growth: 0.25, concentrate: 'inside', drift: 1.0 },
      { seed: 7, scale: [10 * s, 2 * s, 4 * s], volume: 15 * s, color: '#666666', speed: 0.05, fade: 25, segments: 8, position: [-10 * s, -11, -15], growth: 0.2, concentrate: 'outside', drift: -1.5 },
      { seed: 8, scale: [8 * s, 2 * s, 3 * s], volume: 12 * s, color: '#555555', speed: 0.04, fade: 22, segments: 8, position: [10 * s, -12, -16], growth: 0.2, concentrate: 'outside', drift: 1.3 },
      { seed: 9, scale: [6 * s, 1.5 * s, 2 * s], volume: 10 * s, color: '#777777', speed: 0.05, fade: 20, segments: 7, position: [-8 * s, -13, -17], growth: 0.2, concentrate: 'outside', drift: -0.9 },
      { seed: 10, scale: [7 * s, 1.8 * s, 2.5 * s], volume: 11 * s, color: '#666666', speed: 0.045, fade: 21, segments: 7, position: [7 * s, -14, -18], growth: 0.2, concentrate: 'outside', drift: 0.8 },
    ],
  };
}

interface CloudControllerProps {
  smokeStateRef: MutableRefObject<SmokeState>;
  cloudConfigs: CloudConfig[];
}

const CloudController: FC<CloudControllerProps> = ({ smokeStateRef, cloudConfigs }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const materialOpacityRef = useRef(1);
  const targetOpacityRef = useRef(1);
  const targetOffsetRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const initialPositionsRef = useRef<Map<number, [number, number, number]>>(new Map());

  useFrame(() => {
    const state = smokeStateRef.current;
    const opacity = state.opacity;
    const offset = state.offset;

    targetOpacityRef.current = opacity;
    targetOffsetRef.current = offset;

    const lerpFactor = 0.12;
    materialOpacityRef.current += (targetOpacityRef.current - materialOpacityRef.current) * lerpFactor;
    currentOffsetRef.current += (targetOffsetRef.current - currentOffsetRef.current) * lerpFactor;

    if (groupRef.current) {
      groupRef.current.position.y = currentOffsetRef.current * 30;

      groupRef.current.children.forEach((child, index) => {
        const cfg = cloudConfigs[index];
        if (cfg && initialPositionsRef.current.has(cfg.seed)) {
          const initialPos = initialPositionsRef.current.get(cfg.seed)!;
          child.position.x = initialPos[0] + currentOffsetRef.current * cfg.drift * 40;
        }
        child.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mat = mesh.material as THREE.MeshLambertMaterial;
            if (mat.opacity !== undefined) {
              mat.opacity = materialOpacityRef.current * BASE_OPACITY;
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
      {cloudConfigs.map((cfg) => {
        if (!initialPositionsRef.current.has(cfg.seed)) {
          initialPositionsRef.current.set(cfg.seed, cfg.position);
        }
        return (
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
        );
      })}
    </group>
  );
};

export const SmokeOverlay: FC<SmokeOverlayProps> = ({
  smokeStateRef,
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
      style={{ zIndex: 10 }}
      data-component="SmokeOverlay"
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
        <Suspense fallback={null}>
          <CloudController smokeStateRef={smokeStateRef} cloudConfigs={breakpointConfig.clouds} />
        </Suspense>
      </Canvas>
    </div>
  );
};
