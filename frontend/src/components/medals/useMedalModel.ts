import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import type { MedalMaterial } from './types';

export interface MedalModel {
  /** Per-instance clone (own materials, shared geometry/textures), in model units. */
  object: Object3D;
  /** Materials of this instance, for the hover env-map boost. */
  materials: MeshStandardMaterial[];
  /** Base envMapIntensity of each material. */
  baseEnvIntensity: number[];
  /** Model width, height and depth in model units. */
  size: Vector3;
  /** Tab pivot height above the medal centre (`ribbon_anchor`), model units. */
  pivot: number;
}

/** A model scaled to a width in world units. */
export interface MedalMetrics {
  scale: number;
  /** Tab pivot height above the medal centre, world units. */
  pivotY: number;
  /** Half extents of the scaled medal box, for its collider and hit proxy. */
  halfExtents: [number, number, number];
}

/** Fallback pivot when the GLB has no `ribbon_anchor` node: tab centre at 3 % from the top. */
const FALLBACK_PIVOT_FROM_TOP = 0.03;

/**
 * Shader patch of the medal finish: flat polished faces (see `flattenFace`) and a dielectric red
 * enamel picked by base colour (see `enamel`). Uniforms come from the finish; one program per
 * finish values (customProgramCacheKey).
 */
function patchFinish(material: MeshStandardMaterial, finish: MedalMaterial) {
  const { flattenFace, enamel } = finish;
  if (flattenFace <= 0 && enamel.maskTo <= 0) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMedalFlatten = { value: flattenFace };
    shader.uniforms.uEnamelRoughness = { value: enamel.roughness };
    shader.uniforms.uEnamelMask = { value: [enamel.maskFrom, enamel.maskTo] };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMedalFront;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvMedalFront = normalize( normalMatrix * vec3( 0.0, 0.0, 1.0 ) );');
    const flatten = (target: string) => `
      {
        float medalFacing = dot( ${target}, vMedalFront );
        float medalFlat = uMedalFlatten * smoothstep( 0.55, 0.85, abs( medalFacing ) );
        ${target} = normalize( mix( ${target}, vMedalFront * sign( medalFacing ), medalFlat ) );
      }`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMedalFront;\nuniform float uMedalFlatten;\nuniform float uEnamelRoughness;\nuniform vec2 uEnamelMask;')
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
      {
        float medalRed = max( diffuseColor.g, diffuseColor.b ) / max( diffuseColor.r, 1e-3 );
        float medalEnamel = ( 1.0 - smoothstep( uEnamelMask.x, uEnamelMask.y, medalRed ) ) * step( 0.08, diffuseColor.r );
        metalnessFactor = mix( metalnessFactor, 0.0, medalEnamel );
        roughnessFactor = mix( roughnessFactor, uEnamelRoughness, medalEnamel );
      }`,
      )
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${flatten('normal')}`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT${flatten('clearcoatNormal')}\n#endif`);
  };
  material.customProgramCacheKey = () => `medal-finish:${flattenFace}:${enamel.roughness}:${enamel.maskFrom}:${enamel.maskTo}`;
}

/** The GLB material with the configured metal finish (maps kept; clear coat → physical). */
function finishMaterial(source: MeshStandardMaterial, finish: MedalMaterial): MeshStandardMaterial {
  const material =
    finish.clearcoat > 0
      ? new MeshPhysicalMaterial({
          name: source.name,
          color: source.color,
          map: source.map,
          normalMap: source.normalMap,
          normalScale: source.normalScale,
          roughnessMap: source.roughnessMap,
          metalnessMap: source.metalnessMap,
          aoMap: source.aoMap,
          emissive: source.emissive,
          emissiveMap: source.emissiveMap,
          side: source.side,
          clearcoat: finish.clearcoat,
          clearcoatRoughness: finish.clearcoatRoughness,
        })
      : source.clone();
  material.roughness = finish.roughness;
  material.metalness = finish.metalness;
  material.envMapIntensity = finish.envMapIntensity;
  material.normalScale = source.normalScale.clone().multiplyScalar(finish.normalScale);
  if (!finish.useRoughnessMap) material.roughnessMap = null;
  if (finish.normalScale <= 0) material.normalMap = null;
  patchFinish(material, finish);
  material.needsUpdate = true;
  return material;
}

/**
 * Loads a medal GLB (drei cache, shared by every instance) and returns one clone with the
 * configured finish. Size-independent: a breakpoint change only rescales it (`medalMetrics`),
 * the clone and its materials are kept. Only glTF core + EXT_texture_webp +
 * KHR_mesh_quantization are used, so no Draco/Meshopt decoders are loaded.
 */
export function useMedalModel(url: string, finish: MedalMaterial): MedalModel {
  const { scene } = useGLTF(url, false, false);

  const model = useMemo<MedalModel>(() => {
    const object = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    object.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material = finishMaterial(child.material, finish);
        materials.push(child.material);
      }
    });
    const size = new Box3().setFromObject(object).getSize(new Vector3());
    const anchor = object.getObjectByName('ribbon_anchor');
    return {
      object,
      materials,
      baseEnvIntensity: materials.map((material) => material.envMapIntensity),
      size,
      pivot: anchor ? anchor.position.y : size.y * (0.5 - FALLBACK_PIVOT_FROM_TOP),
    };
  }, [scene, finish]);

  useEffect(() => () => model.materials.forEach((material) => material.dispose()), [model]);

  return model;
}

/** Scale, pivot and half extents of `model` at `widthUnits` world units wide. */
export function medalMetrics(model: MedalModel, widthUnits: number): MedalMetrics {
  const scale = widthUnits / model.size.x;
  return {
    scale,
    pivotY: model.pivot * scale,
    halfExtents: [(model.size.x * scale) / 2, (model.size.y * scale) / 2, (model.size.z * scale) / 2],
  };
}
