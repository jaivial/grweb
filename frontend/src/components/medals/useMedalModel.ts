import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';

export interface MedalModel {
  /** Per-instance clone (own materials, shared geometry/textures). */
  object: Object3D;
  /** Materials of this instance, for the hover env-map boost. */
  materials: MeshStandardMaterial[];
  /** Base envMapIntensity of each material. */
  baseEnvIntensity: number[];
  /** Scale that makes the model `widthUnits` wide. */
  scale: number;
  /** Tab pivot height above the medal centre (`ribbon_anchor`), world units. */
  pivotY: number;
  /** Half extents of the scaled medal box, for its collider and hit proxy. */
  halfExtents: [number, number, number];
}

/** Fallback pivot when the GLB has no `ribbon_anchor` node: tab centre at 3 % from the top. */
const FALLBACK_PIVOT_FROM_TOP = 0.03;

/**
 * Loads a medal GLB (drei cache, shared by every instance) and returns a clone scaled to
 * `widthUnits`, plus the geometry the rig needs. Only glTF core + EXT_texture_webp +
 * KHR_mesh_quantization are used, so no Draco/Meshopt decoders are loaded.
 */
export function useMedalModel(url: string, widthUnits: number): MedalModel {
  const { scene } = useGLTF(url, false, false);

  const model = useMemo<MedalModel>(() => {
    const object = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    object.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material = child.material.clone();
        materials.push(child.material);
      }
    });
    const size = new Box3().setFromObject(object).getSize(new Vector3());
    const scale = widthUnits / size.x;
    const anchor = object.getObjectByName('ribbon_anchor');
    const pivotLocal = anchor ? anchor.position.y : size.y * (0.5 - FALLBACK_PIVOT_FROM_TOP);
    return {
      object,
      materials,
      baseEnvIntensity: materials.map((material) => material.envMapIntensity),
      scale,
      pivotY: pivotLocal * scale,
      halfExtents: [(size.x * scale) / 2, (size.y * scale) / 2, (size.z * scale) / 2],
    };
  }, [scene, widthUnits]);

  useEffect(() => () => model.materials.forEach((material) => material.dispose()), [model]);

  return model;
}
