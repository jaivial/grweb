/**
 * Premios section of the home (Figma «80 · Home · Premios 3D · Categorías y Absoluto»).
 * Single data module: medal assets, hanging geometry per breakpoint (block A: movements,
 * block B: weight-class podium), physics, movements, weight classes and the absolute winner.
 */
import { MEN_CATEGORIES, WOMEN_CATEGORIES } from '@/constants';
import type { HangingLayout, MedalAssets, MedalPhysics } from '@components/medals/types';

export type MedalMetal = 'gold' | 'silver' | 'bronze';

export const MEDAL_RIBBON_SRC = '/images/medals/ribbon.png';

export const MEDAL_ASSETS: Record<MedalMetal, MedalAssets> = {
  gold: { glb: '/models/medals/gold.glb', image: '/images/medals/medal-gold-lg.png', ribbon: MEDAL_RIBBON_SRC },
  silver: { glb: '/models/medals/silver.glb', image: '/images/medals/medal-silver-lg.png', ribbon: MEDAL_RIBBON_SRC },
  bronze: { glb: '/models/medals/bronze.glb', image: '/images/medals/medal-bronze-lg.png', ribbon: MEDAL_RIBBON_SRC },
};

export const MEDAL_GOLD_COLOR = '#D4AF37';

/** Medal aspect of the cut-out (height / width). */
const MEDAL_ASPECT = 179 / 184;

/**
 * Block A · hanging geometry. Breakpoints match the section's columns: below 480 px (Tailwind `sm`)
 * the movement columns stack, from 480 px they sit in a row, from 1024 px (`3xl`) desktop.
 * The section's padding-top classes in PricesAllMovementsSection are fixed by the layout (the
 * canvas may be taller than the padding: the long side ribbons hang over the photos).
 */
export const HANGING_LAYOUTS: readonly HangingLayout[] = [
  {
    id: 'desktop',
    query: '(min-width: 1024px)',
    canvasHeight: 784,
    ribbonLength: 210,
    medalWidth: 184,
    medalHeight: 184 * MEDAL_ASPECT,
    ribbonWidth: 30,
    ribbonSpreadTop: 88,
    ribbonSpreadBottom: 28,
    followAnchors: true,
    anchorsPct: [0.236, 0.5, 0.764],
    // Figma v2 (199:213): side medals hang long (face at y 565) over the photos, centre one short (y 210).
    anchorOffsets: [-60, 0, 60],
    medals: [
      { ribbonLength: 565, wind: { ampDeg: 4, periodS: 3.6, twistDeg: 6, twistPeriodS: 5.5 }, z: 2 },
      { ribbonLength: 210, wind: { ampDeg: 4, periodS: 3.4, twistDeg: 6, twistPeriodS: 5.5 }, z: 1 },
      { ribbonLength: 565, wind: { ampDeg: 4, periodS: 3.2, twistDeg: 6, twistPeriodS: 5.5 }, z: 2 },
    ],
    wind: { ampDeg: 4, periodS: 3.4, twistDeg: 6, twistPeriodS: 5.5 },
    tapImpulse: 2.4,
  },
  {
    id: 'tablet',
    query: '(min-width: 480px)',
    canvasHeight: 410,
    ribbonLength: 150,
    medalWidth: 132,
    medalHeight: 132 * MEDAL_ASPECT,
    ribbonWidth: 22,
    ribbonSpreadTop: 66,
    ribbonSpreadBottom: 20,
    followAnchors: true,
    anchorsPct: [0.236, 0.5, 0.764],
    anchorOffsets: [-30, 0, 30],
    medals: [
      { ribbonLength: 260, wind: { ampDeg: 3.5, periodS: 3.4, twistDeg: 6, twistPeriodS: 5.5 }, z: 2 },
      { ribbonLength: 150, wind: { ampDeg: 3.5, periodS: 3.2, twistDeg: 6, twistPeriodS: 5.5 }, z: 1 },
      { ribbonLength: 260, wind: { ampDeg: 3.5, periodS: 3.0, twistDeg: 6, twistPeriodS: 5.5 }, z: 2 },
    ],
    wind: { ampDeg: 3.5, periodS: 3.2, twistDeg: 6, twistPeriodS: 5.5 },
    tapImpulse: 2,
  },
  {
    id: 'mobile',
    query: 'all',
    canvasHeight: 200,
    ribbonLength: 100,
    medalWidth: 92,
    medalHeight: 92 * MEDAL_ASPECT,
    ribbonWidth: 15,
    ribbonSpreadTop: 44,
    ribbonSpreadBottom: 14,
    followAnchors: false,
    anchorsPct: [0.22, 0.5, 0.78],
    wind: { ampDeg: 3, periodS: 3, twistDeg: 6, twistPeriodS: 5.5 },
    tapImpulse: 1.6,
  },
];

/** Medal height for a given width (aspect of the cut-out / model front). */
const h = (width: number) => Math.round(width * MEDAL_ASPECT);
const PODIUM_TWIST = { twistDeg: 6, twistPeriodS: 5.5 };
/** Figma v2: medal centres at 307 / 600 / 887 of the 1200 block (290 px between them). */
const PODIUM_ANCHORS_PCT = [307 / 1200, 0.5, 887 / 1200] as const;

/**
 * Block B · weight-class podium, left to right: silver (2º) · gold (1º) · bronze (3º).
 * Figma page 80, frames 189:580 (desktop), 189:677 (mobile), 189:822 (geometry).
 * Anchors are % of the block width (desktop block 1200: x 380 / 600 / 820; mobile block 350:
 * x 75 / 175 / 275). `medals` overrides ribbon, size, idle and stacking per medal (index order).
 * The block's padding-top classes in WeightClassPrizes (708 / 528 / 338) leave 8 px under
 * the canvas; change both together.
 */
export const PODIUM_LAYOUTS: readonly HangingLayout[] = [
  {
    // Figma v2 199:255: canvas 700 (660 + 40 above the Figma layer: the ribbons are born inside the cloud),
    // faces at 450 / 480 / 430 px from the layer top → ribbons 490 / 520 / 470 here.
    id: 'podium-desktop',
    query: '(min-width: 1024px)',
    canvasHeight: 700,
    ribbonLength: 490,
    medalWidth: 140,
    medalHeight: h(140),
    ribbonWidth: 22,
    ribbonSpreadTop: 64,
    ribbonSpreadBottom: 20,
    followAnchors: false,
    anchorsPct: PODIUM_ANCHORS_PCT,
    wind: { ampDeg: 3.5, periodS: 2.9, ...PODIUM_TWIST },
    medals: [
      { ribbonLength: 490, medalWidth: 140, medalHeight: h(140), wind: { ampDeg: 3.5, periodS: 2.9, ...PODIUM_TWIST }, z: 2 },
      { ribbonLength: 520, medalWidth: 160, medalHeight: h(160), wind: { ampDeg: 3, periodS: 3.2, ...PODIUM_TWIST }, z: 3 },
      { ribbonLength: 470, medalWidth: 140, medalHeight: h(140), wind: { ampDeg: 3.5, periodS: 2.7, ...PODIUM_TWIST }, z: 1 },
    ],
    tapImpulse: 2.4,
  },
  {
    // Tablet (not in Figma): desktop percentages, sizes ×0.75, ribbons ≈ ×0.72.
    id: 'podium-tablet',
    query: '(min-width: 480px)',
    canvasHeight: 520,
    ribbonLength: 350,
    medalWidth: 104,
    medalHeight: h(104),
    ribbonWidth: 17,
    ribbonSpreadTop: 48,
    ribbonSpreadBottom: 15,
    followAnchors: false,
    anchorsPct: PODIUM_ANCHORS_PCT,
    wind: { ampDeg: 3.2, periodS: 2.9, ...PODIUM_TWIST },
    medals: [
      { ribbonLength: 350, medalWidth: 104, medalHeight: h(104), wind: { ampDeg: 3.2, periodS: 2.9, ...PODIUM_TWIST }, z: 2 },
      { ribbonLength: 375, medalWidth: 120, medalHeight: h(120), wind: { ampDeg: 2.7, periodS: 3.2, ...PODIUM_TWIST }, z: 3 },
      { ribbonLength: 330, medalWidth: 104, medalHeight: h(104), wind: { ampDeg: 3.2, periodS: 2.7, ...PODIUM_TWIST }, z: 1 },
    ],
    tapImpulse: 2,
  },
  {
    // Mobile (not in Figma): same long-ribbon idea, shorter so the block stays compact.
    id: 'podium-mobile',
    query: 'all',
    canvasHeight: 330,
    ribbonLength: 190,
    medalWidth: 72,
    medalHeight: h(72),
    ribbonWidth: 12,
    ribbonSpreadTop: 34,
    ribbonSpreadBottom: 11,
    followAnchors: false,
    anchorsPct: [75 / 350, 0.5, 275 / 350],
    wind: { ampDeg: 2.8, periodS: 2.9, ...PODIUM_TWIST },
    medals: [
      { ribbonLength: 190, medalWidth: 72, medalHeight: h(72), wind: { ampDeg: 2.8, periodS: 2.9, ...PODIUM_TWIST }, z: 2 },
      { ribbonLength: 210, medalWidth: 84, medalHeight: h(84), wind: { ampDeg: 2.4, periodS: 3.2, ...PODIUM_TWIST }, z: 3 },
      { ribbonLength: 170, medalWidth: 72, medalHeight: h(72), wind: { ampDeg: 2.8, periodS: 2.7, ...PODIUM_TWIST }, z: 1 },
    ],
    tapImpulse: 1.6,
  },
];

/**
 * Block B medals hit each other (podium) in their own collision group; block A medals never
 * collide. At rest they are ~150 px (desktop) / 22 px (mobile) apart: they only touch when dragged.
 */
export const PODIUM_COLLISIONS = { restitution: 0.15, friction: 0.4, group: 1, hitAngularDamping: 1.2, hitDampingMs: 400 } as const;

/** Block B podium, left to right (index matches `anchorsPct` and `medals`). */
export const PODIUM_MEDALS: ReadonlyArray<{ id: string; metal: MedalMetal; label: string; phase: number }> = [
  { id: 'silver', metal: 'silver', label: '2º · Plata', phase: 0.33 },
  { id: 'gold', metal: 'gold', label: '1º · Oro', phase: 0 },
  { id: 'bronze', metal: 'bronze', label: '3º · Bronce', phase: 0.66 },
];

/**
 * Rig constants (Figma page 79 + home deltas). 100 px = 1 world unit.
 * `linearDamping` is higher than page 79 (0.35): the home pendulums are longer and slower,
 * and 0.35 would keep them swinging ~13 s instead of resting in ~3-4 s.
 */
export const MEDAL_PHYSICS: MedalPhysics = {
  pxPerUnit: 100,
  mass: 0.2,
  linearDamping: 1,
  angularDamping: 0.8,
  dragStiffness: 120,
  dragDamping: 12,
  maxSwingDeg: 65,
  releaseMaxSpeed: 8,
  tapMaxMovePx: 6,
  tapMaxMs: 200,
  restAngularSpeed: 0.05,
  restHoldS: 1.2,
  windBlendS: 0.6,
  entryImpulseDeg: 2,
  hoverScale: 1.04,
  hoverStiffness: 180,
  hoverDamping: 18,
  hoverImpulse: 0.15,
  hoverEnvBoost: 1.25,
};

export type MovementId = 'squat' | 'bench' | 'deadlift';

export const PRIZE_MOVEMENTS: ReadonlyArray<{ id: MovementId; name: string; short: string; phase: number }> = [
  { id: 'squat', name: 'Sentadilla', short: 'SQ', phase: 0 },
  { id: 'bench', name: 'Press de banca', short: 'BP', phase: 0.33 },
  { id: 'deadlift', name: 'Peso muerto', short: 'DL', phase: 0.66 },
];

export type WeightClassSex = 'men' | 'women';

export const WEIGHT_CLASS_GROUPS: ReadonlyArray<{ id: WeightClassSex; label: string; classes: readonly string[] }> = [
  { id: 'men', label: 'Hombres', classes: MEN_CATEGORIES },
  { id: 'women', label: 'Mujeres', classes: WOMEN_CATEGORIES },
];

/** «-83» → «−83» (typographic minus, U+2212). */
export const formatWeightClass = (weightClass: string): string => weightClass.replace('-', '\u2212');

export const PRIZES_COPY = {
  movements: {
    eyebrow: 'Premios',
    title: 'Premio para los mejores en',
    titleAccent: 'cada movimiento',
  },
  weightClasses: {
    eyebrow: 'Categorías de peso',
    title: 'Premio por',
    titleAccent: 'categoría de peso',
    lead: 'El podio de cada categoría se lleva su medalla: oro, plata y bronce para los tres mejores totales.',
  },
  absolute: {
    eyebrow: 'Clasificación absoluta',
    title: 'Ganadores absolutos ·',
    titleAccent: 'GL Points',
    lead: 'Mejor atleta masculino y mejor atleta femenina por puntos GL.',
  },
} as const;

/** Trophy model of block C (generated asset; missing/failed → front render stays). */
export const TROPHY_GLB = '/models/trophy/trophy.glb';
export const TROPHY_FALLBACK_IMAGE = '/models/trophy/refs/front.png';

/** Block C cards (Figma 199:331 / 199:365). No results: only the title and the sex. */
export const ABSOLUTE_WINNERS: ReadonlyArray<{ id: 'men' | 'women'; title: string; label: string; trophyAlt: string }> = [
  { id: 'men', title: 'Ganador Absoluto - GL points', label: 'Masculino', trophyAlt: 'Trofeo del ganador absoluto masculino' },
  { id: 'women', title: 'Ganadora Absoluta - GL points', label: 'Femenino', trophyAlt: 'Trofeo de la ganadora absoluta femenina' },
];
