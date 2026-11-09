import type { RefObject } from 'react';

/** Image/model files of one medal metal. */
export interface MedalAssets {
  /** glTF 2.0 model, Y-up, front +Z, `ribbon_anchor` node at the tab slot. */
  glb: string;
  /** Large transparent cut-out (static medal, fallback of the 3D medal). */
  image: string;
  /** Straight vertical strip of the lanyard, tiles vertically. */
  ribbon: string;
  /** Per-metal overrides of the stage material (`MedalStageConfig.material`). */
  material?: Partial<MedalMaterial>;
}

/** PBR finish of the medal metal, applied over the GLB material (its maps are kept). */
export interface MedalMaterial {
  /**
   * glTF roughnessFactor. With `useRoughnessMap` it multiplies the G channel of the
   * metallicRoughness map; without it, it is the flat roughness of the whole medal.
   */
  roughness: number;
  useRoughnessMap: boolean;
  /** Strength of the GLB normal map (1 = as authored; lower flattens the generated surface noise). */
  normalScale: number;
  metalness: number;
  envMapIntensity: number;
  /** 0 keeps MeshStandardMaterial; > 0 swaps to MeshPhysicalMaterial with a clear coat. */
  clearcoat: number;
  clearcoatRoughness: number;
}

/** One light panel of the studio environment the metal reflects (drei `Lightformer`). */
export interface MedalLightformer {
  form: 'rect' | 'ring' | 'circle';
  intensity: number;
  color?: string;
  position: [number, number, number];
  scale: number | [number, number, number];
  /** Point the panel faces; omitted = its default orientation (facing +z). */
  target?: [number, number, number];
}

/** Direct light of the medal scene (point lights have no distance falloff). */
export interface MedalLight {
  type: 'directional' | 'point';
  position: [number, number, number];
  intensity: number;
  color: string;
}

/** Rendering of the shared medal canvas: resolution, tone mapping, finish and studio light. */
export interface MedalStageConfig {
  /** Device pixel ratio range of the shared canvas. */
  dpr: [number, number];
  toneMapping: 'aces' | 'agx' | 'neutral';
  exposure: number;
  material: MedalMaterial;
  environment: {
    /** Cube map size of the generated environment. */
    resolution: number;
    /** Colour between the panels (what the dark parts of the metal reflect). */
    background: string;
    lightformers: readonly MedalLightformer[];
  };
  ambientIntensity: number;
  lights: readonly MedalLight[];
}

/** Idle wind of a hanging medal (physical periodic force, not keyframes). */
export interface MedalWind {
  /** Target swing amplitude from the vertical, degrees. */
  ampDeg: number;
  /** Swing period, seconds. */
  periodS: number;
  /** Twist amplitude around the vertical axis, degrees. */
  twistDeg: number;
  /** Twist period, seconds. */
  twistPeriodS: number;
}

/** Geometry of one hanging medal. Lengths in CSS px. */
export interface MedalGeometry {
  ribbonLength: number;
  medalWidth: number;
  medalHeight: number;
  wind: MedalWind;
  /** Stacking order among the medals of one group (higher = in front). */
  z: number;
}

/** Geometry of the hanging medals for one breakpoint. Lengths in CSS px. */
export interface HangingLayout {
  id: string;
  /** Media query that selects this layout (first match wins, last entry is the default). */
  query: string;
  canvasHeight: number;
  ribbonLength: number;
  medalWidth: number;
  medalHeight: number;
  ribbonWidth: number;
  /** Horizontal distance between the two ribbon strands at the top rail. */
  ribbonSpreadTop: number;
  /** Horizontal distance between the two ribbon strands at the medal tab. */
  ribbonSpreadBottom: number;
  /** True: anchor.x = centre of each medal's anchor element. False: always `anchorsPct`. */
  followAnchors: boolean;
  /** Anchor x as a fraction of the container width (fallback when there is no measure). */
  anchorsPct: readonly number[];
  wind: MedalWind;
  /** Per-medal overrides of the defaults above, by medal index (e.g. a podium). */
  medals?: ReadonlyArray<Partial<MedalGeometry>>;
  /** Velocity change (u/s) of a click/tap without drag. */
  tapImpulse: number;
}

/** Simulation constants shared by every rig (world: `pxPerUnit` CSS px = 1 unit). */
export interface MedalPhysics {
  pxPerUnit: number;
  mass: number;
  linearDamping: number;
  angularDamping: number;
  dragStiffness: number;
  dragDamping: number;
  maxSwingDeg: number;
  releaseMaxSpeed: number;
  tapMaxMovePx: number;
  tapMaxMs: number;
  restAngularSpeed: number;
  restHoldS: number;
  windBlendS: number;
  entryImpulseDeg: number;
  hoverScale: number;
  hoverStiffness: number;
  hoverDamping: number;
  hoverImpulse: number;
  hoverEnvBoost: number;
}

/** One hanging medal. */
export interface HangingMedalSpec {
  id: string;
  /** Tooltip text on hover, e.g. «Oro · Sentadilla». */
  label: string;
  /** Idle phase in [0, 1) so the medals never swing in unison. */
  phase: number;
  /** Model, cut-out and ribbon of this medal's metal. */
  assets: MedalAssets;
  /** Element whose horizontal centre is the anchor when the layout follows anchors. */
  anchorRef?: RefObject<HTMLElement>;
}

/** Contact material when the medals of one canvas may hit each other (null/absent: no collisions). */
export interface MedalCollisions {
  restitution: number;
  friction: number;
  /** Rapier collision group (0-15) of this set of medals; they only hit the same group. */
  group: number;
  /** angularDamping applied for `hitDampingMs` after a contact, so they do not rattle. */
  hitAngularDamping: number;
  hitDampingMs: number;
}

/** A medal as the canvas needs it: anchor already resolved to px from the container's left edge. */
export interface ResolvedMedal extends HangingMedalSpec {
  anchorX: number;
  geometry: MedalGeometry;
}
