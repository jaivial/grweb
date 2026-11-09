/**
 * Premios section of the home (Figma «80 · Home · Premios 3D · Categorías y Absoluto»).
 * Single data module: medal assets, hanging geometry per breakpoint (block A: movements,
 * block B: weight-class podium on its rail, block C: absolute winner card), physics, entrance,
 * movements, weight classes and the absolute winner (pre/post event).
 */
import { MEN_CATEGORIES, WOMEN_CATEGORIES } from '@/constants';
import type { HangingLayout, MedalAssets, MedalEntrance, MedalPhysics, MedalStageConfig } from '@components/medals/types';

export type MedalMetal = 'gold' | 'silver' | 'bronze';

export const MEDAL_RIBBON_SRC = '/images/medals/ribbon.png';

export const MEDAL_ASSETS: Record<MedalMetal, MedalAssets> = {
  // faceColor: median of each GLB's base colour texture (metal texels, enamel left out).
  gold: { glb: '/models/medals/gold.glb', image: '/images/medals/medal-gold-lg.png', ribbon: MEDAL_RIBBON_SRC, material: { faceColor: '#EACA75' } },
  silver: { glb: '/models/medals/silver.glb', image: '/images/medals/medal-silver-lg.png', ribbon: MEDAL_RIBBON_SRC, material: { faceColor: '#E2D8D5' } },
  // Spec 191:61686: bronze reliefs a bit more satin (0,30 vs 0,25 for gold and silver).
  bronze: { glb: '/models/medals/bronze.glb', image: '/images/medals/medal-bronze-lg.png', ribbon: MEDAL_RIBBON_SRC, material: { roughness: 0.27, faceColor: '#DBA086' } },
};

export const MEDAL_GOLD_COLOR = '#D4AF37';

/** Medal aspect of the cut-out (height / width). */
const MEDAL_ASPECT = 179 / 184;

/**
 * Block A · hanging geometry. Breakpoints match the section's columns: below 480 px (Tailwind `sm`)
 * the movement columns stack, from 480 px they sit in a row, from 1024 px (`3xl`) desktop.
 * The section's padding-top classes in PricesAllMovementsSection mirror `canvasHeight`
 * (Tailwind needs literal class names: change both together).
 */
export const HANGING_LAYOUTS: readonly HangingLayout[] = [
  {
    id: 'desktop',
    query: '(min-width: 1024px)',
    canvasHeight: 420,
    ribbonLength: 210,
    medalWidth: 184,
    medalHeight: 184 * MEDAL_ASPECT,
    ribbonWidth: 30,
    ribbonSpreadTop: 88,
    ribbonSpreadBottom: 28,
    followAnchors: true,
    anchorsPct: [0.236, 0.5, 0.764],
    wind: { ampDeg: 4, periodS: 3.4, twistDeg: 6, twistPeriodS: 5.5 },
    entranceMs: 720,
    tapImpulse: 2.4,
  },
  {
    id: 'tablet',
    query: '(min-width: 480px)',
    canvasHeight: 300,
    ribbonLength: 150,
    medalWidth: 132,
    medalHeight: 132 * MEDAL_ASPECT,
    ribbonWidth: 22,
    ribbonSpreadTop: 66,
    ribbonSpreadBottom: 20,
    followAnchors: true,
    anchorsPct: [0.236, 0.5, 0.764],
    wind: { ampDeg: 3.5, periodS: 3.2, twistDeg: 6, twistPeriodS: 5.5 },
    entranceMs: 720,
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
    entranceMs: 600,
    tapImpulse: 1.6,
  },
];

/** Medal height for a given width (aspect of the cut-out / model front). */
const h = (width: number) => Math.round(width * MEDAL_ASPECT);
const PODIUM_TWIST = { twistDeg: 6, twistPeriodS: 5.5 };

/**
 * Block B · weight-class podium, left to right: silver (2º) · gold (1º) · bronze (3º).
 * Figma page 80, frames 189:580 (desktop), 189:677 (mobile), 189:822 (geometry).
 * Anchors are % of the block width (desktop block 1200: x 380 / 600 / 820; mobile block 350:
 * x 75 / 175 / 275). `medals` overrides ribbon, size, idle and stacking per medal (index order).
 * The medals hang from the axis of the block's steel rail (`anchorY` = `PODIUM_RAILS[].axisY`);
 * WeightClassPrizes derives its padding-top as anchorY + canvasHeight + PODIUM_BAND_GAP.
 */
export const PODIUM_LAYOUTS: readonly HangingLayout[] = [
  {
    id: 'podium-desktop',
    query: '(min-width: 1024px)',
    anchorY: 40,
    canvasHeight: 360,
    ribbonLength: 150,
    medalWidth: 140,
    medalHeight: h(140),
    ribbonWidth: 22,
    ribbonSpreadTop: 64,
    ribbonSpreadBottom: 20,
    followAnchors: false,
    anchorsPct: [380 / 1200, 0.5, 820 / 1200],
    wind: { ampDeg: 3.5, periodS: 2.9, ...PODIUM_TWIST },
    medals: [
      { ribbonLength: 150, medalWidth: 140, medalHeight: h(140), wind: { ampDeg: 3.5, periodS: 2.9, ...PODIUM_TWIST }, z: 2 },
      { ribbonLength: 180, medalWidth: 160, medalHeight: h(160), wind: { ampDeg: 3, periodS: 3.2, ...PODIUM_TWIST }, z: 3 },
      { ribbonLength: 130, medalWidth: 140, medalHeight: h(140), wind: { ampDeg: 3.5, periodS: 2.7, ...PODIUM_TWIST }, z: 1 },
    ],
    entranceMs: 720,
    tapImpulse: 2.4,
  },
  {
    // Tablet rule of the spec: desktop percentages, gold 120 / silver-bronze 104 (×0.75).
    id: 'podium-tablet',
    query: '(min-width: 480px)',
    anchorY: 28,
    canvasHeight: 272,
    ribbonLength: 112,
    medalWidth: 104,
    medalHeight: h(104),
    ribbonWidth: 17,
    ribbonSpreadTop: 48,
    ribbonSpreadBottom: 15,
    followAnchors: false,
    anchorsPct: [380 / 1200, 0.5, 820 / 1200],
    wind: { ampDeg: 3.2, periodS: 2.9, ...PODIUM_TWIST },
    medals: [
      { ribbonLength: 112, medalWidth: 104, medalHeight: h(104), wind: { ampDeg: 3.2, periodS: 2.9, ...PODIUM_TWIST }, z: 2 },
      { ribbonLength: 135, medalWidth: 120, medalHeight: h(120), wind: { ampDeg: 2.7, periodS: 3.2, ...PODIUM_TWIST }, z: 3 },
      { ribbonLength: 98, medalWidth: 104, medalHeight: h(104), wind: { ampDeg: 3.2, periodS: 2.7, ...PODIUM_TWIST }, z: 1 },
    ],
    entranceMs: 720,
    tapImpulse: 2,
  },
  {
    id: 'podium-mobile',
    query: 'all',
    anchorY: 16,
    canvasHeight: 184,
    ribbonLength: 74,
    medalWidth: 72,
    medalHeight: h(72),
    ribbonWidth: 12,
    ribbonSpreadTop: 34,
    ribbonSpreadBottom: 11,
    followAnchors: false,
    anchorsPct: [75 / 350, 0.5, 275 / 350],
    wind: { ampDeg: 2.8, periodS: 2.9, ...PODIUM_TWIST },
    medals: [
      { ribbonLength: 74, medalWidth: 72, medalHeight: h(72), wind: { ampDeg: 2.8, periodS: 2.9, ...PODIUM_TWIST }, z: 2 },
      { ribbonLength: 90, medalWidth: 84, medalHeight: h(84), wind: { ampDeg: 2.4, periodS: 3.2, ...PODIUM_TWIST }, z: 3 },
      { ribbonLength: 66, medalWidth: 72, medalHeight: h(72), wind: { ampDeg: 2.8, periodS: 2.7, ...PODIUM_TWIST }, z: 1 },
    ],
    entranceMs: 600,
    tapImpulse: 1.6,
  },
];

/**
 * Block B medals hit each other (podium) in their own collision group; block A medals never
 * collide. At rest they are 70 px (desktop) / 22 px (mobile) apart: they only touch when dragged.
 */
export const PODIUM_COLLISIONS = { restitution: 0.15, friction: 0.4, group: 1, hitAngularDamping: 1.2, hitDampingMs: 400 } as const;

/** Block B podium, left to right (index matches `anchorsPct` and `medals`); `entryOrder`: gold, silver, bronze. */
export const PODIUM_MEDALS: ReadonlyArray<{ id: string; metal: MedalMetal; label: string; phase: number; entryOrder: number }> = [
  { id: 'silver', metal: 'silver', label: '2º · Plata', phase: 0.33, entryOrder: 1 },
  { id: 'gold', metal: 'gold', label: '1º · Oro', phase: 0, entryOrder: 0 },
  { id: 'bronze', metal: 'bronze', label: '3º · Bronce', phase: 0.66, entryOrder: 2 },
];

/** Space between the podium band and the block heading, px. */
export const PODIUM_BAND_GAP = 8;

/** Steel rail of block B (DOM/CSS, over the canvas). Lengths in px; x as fractions of the block. */
export interface PrizeRailLayout {
  query: string;
  /** Block margin-top: gap from the last line of block A to the top of block B. */
  marginTop: number;
  /** Rail axis from the top of the block (= anchor line of the ribbons). */
  axisY: number;
  /** Rail span (caps included) as fractions of the block width, centred. */
  left: number;
  width: number;
  thickness: number;
  radius: number;
  capDiameter: number;
  /** box-shadow of the bar. */
  shadow: string;
  /** box-shadow of the caps. */
  capShadow: string;
}

/**
 * Figma 191:61626. Desktop: block 1200, rail x 300–900 (0,25 / 0,5), axis y 40, 600 × 10, r 5,
 * caps Ø18; mobile: block 350, x 35–315 (0,1 / 0,8), axis y 16, 280 × 6, r 3, caps Ø12.
 * Tablet (480–1023) by rule of three (Figma proposal, not drawn): axis 28, 8 thick, caps Ø14.
 * marginTop: subtitle/labels of block A → rail axis = 160 desktop (120 + 40) / 96 mobile (80 + 16).
 * Desktop and tablet measure from the movement labels row, the last line of block A in code
 * (in Figma the labels sit inside the photo cards); mobile from the subtitle (labels hidden),
 * whose 32 px bottom margin collapses into this 80. The second shadow uses the code's crimson.
 */
export const PODIUM_RAILS: readonly PrizeRailLayout[] = [
  {
    query: '(min-width: 1024px)',
    marginTop: 120,
    axisY: 40,
    left: 300 / 1200,
    width: 600 / 1200,
    thickness: 10,
    radius: 5,
    capDiameter: 18,
    shadow: '0 6px 14px rgba(0, 0, 0, 0.55), 0 8px 28px rgba(220, 20, 60, 0.22)',
    capShadow: '0 4px 8px rgba(0, 0, 0, 0.5)',
  },
  {
    query: '(min-width: 480px)',
    marginTop: 100,
    axisY: 28,
    left: 300 / 1200,
    width: 600 / 1200,
    thickness: 8,
    radius: 4,
    capDiameter: 14,
    shadow: '0 5px 11px rgba(0, 0, 0, 0.55), 0 6px 21px rgba(220, 20, 60, 0.22)',
    capShadow: '0 3px 6px rgba(0, 0, 0, 0.5)',
  },
  {
    query: 'all',
    marginTop: 80,
    axisY: 16,
    left: 35 / 350,
    width: 280 / 350,
    thickness: 6,
    radius: 3,
    capDiameter: 12,
    shadow: '0 3px 8px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(220, 20, 60, 0.22)',
    capShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
  },
];

/** Brushed steel of the rail and of the card clip: vertical gradient + ~4 % horizontal grain. */
export const STEEL_FINISH = {
  gradient: 'linear-gradient(180deg, #2B2B2E 0%, #C9CACF 30%, #F2F2F4 45%, #8E9096 62%, #35353A 100%)',
  grainOpacity: 0.04,
  /** Rail caps: brand crimson, lit from the top left. */
  cap: 'radial-gradient(circle at 35% 30%, #DC143C 0%, #B0102F 55%, #8B0000 100%)',
  capBorder: '1px solid rgba(0, 0, 0, 0.35)',
} as const;

/**
 * Block A · top fade over the canvas (Figma 191:61626): the ribbons emerge from the darkness.
 * Colour = the real section background in code (#0a0a0a, not the #141112 token of Figma).
 * Stops: solid to 40 %, 55 % at 72 %, transparent at 100 %. Tablet height interpolated.
 */
export const MOVEMENTS_FADE = {
  color: '10, 10, 10',
  stops: [
    { at: 0, alpha: 1 },
    { at: 40, alpha: 1 },
    { at: 72, alpha: 0.55 },
    { at: 100, alpha: 0 },
  ],
  heights: [
    { query: '(min-width: 1024px)', height: 180 },
    { query: '(min-width: 480px)', height: 144 },
    { query: 'all', height: 112 },
  ],
} as const;

/**
 * Entrance drop (Figma 191:61657), once per page load, when the band is 30 % visible and the
 * model is loaded: from −(L + H + 8) (hidden above the anchor line), +0,06·L at 62 %, −0,02·L at
 * 82 %, rest at 100 %; 720 ms (600 ms below 480 px, `entranceMs` of each layout); 120 ms between
 * medals in `entryOrder`. Then the physics takes over (2° nudge, wind blends in over 0,6 s).
 * - The trigger observes each group's band (not the whole section: the section of block A is
 *   taller than three viewports and would never reach 30 %).
 * - The PNG placeholder fills the band while the 3D is not ready (QA: no empty band). If it was
 *   ever on screen, there is no drop: the medals swap to 3D at rest (replaces the spec's 1,2 s
 *   wait, which would show the PNGs and then make them vanish and fall). The drop plays when
 *   the models were preloaded (the band starts loading one viewport ahead) — the usual case.
 * - prefers-reduced-motion: no 3D, so no drop (PNGs at rest).
 * - PNG fallback (no WebGL, save-data, ≤ 4 cores): DECISION, no CSS drop. Those are the devices
 *   the fallback protects, and the same PNGs are the loading state of the 3D medals: a CSS drop
 *   there would play and then the 3D drop again.
 * - The opacity 0 → 1 of the spec is not needed: until it crosses the anchor line the medal is
 *   outside its band and the canvas does not draw it.
 */
export const MEDAL_ENTRANCE: MedalEntrance = {
  threshold: 0.3,
  staggerMs: 120,
  startGapPx: 8,
  overshoot: { at: 0.62, l: 0.06 },
  rebound: { at: 0.82, l: -0.02 },
  easing: { fall: [0.5, 0, 0.75, 0.4], rebound: [0.42, 0, 0.58, 1], settle: [0, 0, 0.58, 1] },
};

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

/**
 * Shared medal canvas (one WebGL context for every hanging group of the section): resolution,
 * metal finish and the studio light the metal reflects.
 *
 * Polished metal = sharp-ish reflections of a contrasted studio, not a bright uniform one:
 * - Finish (spec 191:61686 + QA): metalness 1 and one flat roughness 0,22 (bronze 0,27): the
 *   Tripo metallicRoughness map cannot separate reliefs from fields (its G channel does not
 *   correlate with the relief) and its noise read as crumpled foil. The generated surface is
 *   wavy, so the faces' shading normals are pulled towards the face normal (`flattenFace`, in a
 *   shader patch) and the normal map is kept at 12 %: flat polished faces, bevels keep their
 *   highlights. The base colour is pulled 80 % to each metal's median colour (`faceTint`,
 *   `faceColor`): the texture's light/dark patches mottled the mirror finish. The red enamel is
 *   picked by base colour and made dielectric (`enamel`): the GLB metalness map marks the whole
 *   medal as metal, which turned the «2» maroon; its colour is darker than the texture and its
 *   reflections cut to 35 %, or the studio light washed it to orange-pink.
 * - Studio: transparent black between the panels (the dark parts of the metal), a top softbox for the bevels, a
 *   narrow vertical strip in front that sweeps across the faces as they twist, a dim front fill
 *   so the face never goes black, side strips for the edges and the red rim behind.
 * - Neutral tone mapping keeps the gold saturated. The spec says ACES, but with these assets ACES
 *   pushed the gold to a flat cream (phase 1 captures t0 vs t3); kept neutral on purpose.
 * - Plus the spec's thin horizontal strip above-front (10 × 0,6, intensity 4): reflection lines.
 */
export const MEDAL_STAGE: MedalStageConfig = {
  dpr: [1, 1.5],
  toneMapping: 'neutral',
  exposure: 1,
  material: {
    roughness: 0.22,
    useRoughnessMap: false,
    normalScale: 0.12,
    metalness: 1,
    envMapIntensity: 1.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.18,
    flattenFace: 0.85,
    faceTint: 0.8,
    enamel: { roughness: 0.28, maskFrom: 0.18, maskTo: 0.32, color: '#8C0717', sheen: 0.35 },
  },
  environment: {
    resolution: 256,
    lightformers: [
      // Top softbox (bevels, top edges).
      { form: 'rect', intensity: 4, color: '#FFF4E0', position: [0, 5, 5], scale: [12, 2.5, 1], target: [0, 0, 0] },
      // Thin horizontal strip above-front (spec 191:61686): the reflection lines of the photo.
      { form: 'rect', intensity: 4, color: '#FFFFFF', position: [0, 2.2, 6], scale: [10, 0.6, 1], target: [0, 0, 0] },
      // Narrow vertical strip in front: the highlight that sweeps across the face with the twist.
      { form: 'rect', intensity: 3, color: '#FFF1D6', position: [1.4, 0, 7], scale: [0.9, 12, 1] },
      // Dim front fill.
      { form: 'rect', intensity: 0.25, color: '#FFE8C2', position: [-2, -1, 7], scale: [5, 6, 1] },
      // Side strips (edges).
      { form: 'rect', intensity: 2, position: [-6, 1, 2], scale: [2, 8, 1], target: [0, 0, 0] },
      { form: 'rect', intensity: 1.5, position: [6, -2, 2], scale: [2, 6, 1], target: [0, 0, 0] },
      // Red rim behind (brand).
      { form: 'ring', intensity: 1.5, color: '#DC143C', position: [2, 1, -4], scale: 3 },
    ],
  },
  ambientIntensity: 0.3,
  lights: [
    { type: 'directional', position: [-3, 5, 4], intensity: 2.2, color: '#FFF1D6' },
    { type: 'point', position: [2, 1, -3], intensity: 0.6, color: '#DC143C' },
  ],
};

export type MovementId = 'squat' | 'bench' | 'deadlift';

/** Block A medals, left to right (also their entrance order). */
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
    lead: 'Cada categoría tiene su propio podio: compites contra quien pesa como tú.',
  },
  absolute: {
    eyebrow: 'Clasificación absoluta',
    title: 'Ganadores absolutos ·',
    titleAccent: 'GL Points',
    lead: 'Mejor atleta masculino y mejor atleta femenina por puntos GL.',
    namePending: 'Por decidir',
    detailPending: 'Se decide el día del campeonato',
    valuePending: 'Pendiente',
    explainerTitle: '¿Qué son los GL Points?',
    explainer:
      'La fórmula IPF GoodLift convierte tu total en puntos según tu peso corporal y tu sexo. Así, un \u221243 kg y un +120 kg compiten en la misma clasificación: gana quien más rinde, no quien más pesa. Hay un ganador por sexo porque la fórmula tiene coeficientes distintos para hombres y mujeres.',
  },
} as const;

export type WinnerSex = 'M' | 'F';

/**
 * One absolute winner by IPF GoodLift points (one per sex, each with its own prize and card).
 * Figma 191:61759: `pending` before the event («Por decidir», «Pendiente» in every figure, same
 * height as the numbers so publishing does not move the card); `decided` with the data
 * (es-ES: total 1 decimal, GL 2, bodyweight 1). Data fields are only read when `decided`.
 */
export interface AbsoluteWinnerEntry {
  sex: WinnerSex;
  status: 'pending' | 'decided';
  name?: string;
  club?: string;
  /** Weight class as in MEN_CATEGORIES / WOMEN_CATEGORIES, e.g. «-93». */
  category?: string;
  /** Total, kg. */
  total?: number;
  /** IPF GoodLift points. */
  gl?: number;
  /** Bodyweight, kg. */
  bodyweight?: number;
}

/** Per-sex texts of block C: category word of the meta line, badge, tooltip of the medal. */
export const ABSOLUTE_SEX: Record<WinnerSex, { category: string; badge: string; medalLabel: string }> = {
  M: { category: 'Hombres', badge: 'Mejor atleta masculino · GL Points', medalLabel: 'Oro · Mejor atleta masculino' },
  F: { category: 'Mujeres', badge: 'Mejor atleta femenina · GL Points', medalLabel: 'Oro · Mejor atleta femenina' },
};

/**
 * The absolute winners, one card each, in this order (male first, as Hombres | Mujeres in block
 * B). Each entry is independent (a mixed state is valid). Publish after the championship by
 * setting `status: 'decided'` and the data of the entry.
 */
export const ABSOLUTE_WINNERS: readonly AbsoluteWinnerEntry[] = [
  { sex: 'M', status: 'pending' },
  { sex: 'F', status: 'pending' },
];

/**
 * Fictitious post-event data (the male one is the Figma example, coherent with the GL formula).
 * QA only: never assign it to ABSOLUTE_WINNERS in a commit.
 */
export const ABSOLUTE_WINNERS_EXAMPLE: readonly AbsoluteWinnerEntry[] = [
  { sex: 'M', status: 'decided', name: 'Alejandro Ruiz', club: 'GR Strength Club', category: '-93', total: 612.5, gl: 80.3, bodyweight: 92.6 },
  { sex: 'F', status: 'decided', name: 'Lucía Martín', club: 'GR Strength Club', category: '-63', total: 380, gl: 82.15, bodyweight: 62.4 },
];

/** Figures of a card: entry field, label (wide), short label with unit (narrow, unit then hidden), unit. */
export const ABSOLUTE_STATS: ReadonlyArray<{ id: string; field: 'total' | 'gl' | 'bodyweight'; label: string; shortLabel: string; unit: string; decimals: number; highlight: boolean }> = [
  { id: 'total', field: 'total', label: 'Total', shortLabel: 'Total · kg', unit: 'kg', decimals: 1, highlight: false },
  { id: 'gl-points', field: 'gl', label: 'GL Points', shortLabel: 'GL Points', unit: 'GL', decimals: 2, highlight: true },
  { id: 'bodyweight', field: 'bodyweight', label: 'Peso corporal', shortLabel: 'Peso · kg', unit: 'kg', decimals: 1, highlight: false },
];

/** Wide layout of block C (cards 588 + 24 + 588, wide typography) from this width. */
export const ABSOLUTE_WIDE_QUERY = '(min-width: 1280px)';

/** Block C extras per layout id (ABSOLUTE_LAYOUTS). */
export interface AbsoluteCardLayout {
  /** Steel clip (pasador) on the card's top edge, centred: width × height, bottom radius. */
  pin: { width: number; height: number; radius: number };
  /** Card min-height and corner radius, px. */
  minHeight: number;
  radius: number;
  /** Diameter of the gold halo behind the medal, px. */
  haloSize: number;
  /** Stagger the cards' drops (M 0 / F +staggerMs, both when the block shows up) or not (mobile:
   *  stacked, each card drops when it enters the viewport). */
  staggerCards: boolean;
}

/**
 * Block C · two absolute winners by GL points (male / female), one card each with its own clip,
 * ribbon and gold medal (one view of the shared canvas per card; no collisions, the view is the
 * card's medal zone so nothing leaves the card). Figma page 80, table 194:912, decision 194:945:
 * - ≥ 1280: 2 columns 588 + 24 + 588; card 588 × 616, r 32; medal zone 320 high; clip 80 × 8;
 *   anchor at the card's horizontal centre, top edge; ribbon 120 (strands 24, spread 70 → 22);
 *   medal 176 × 171 (y 120–291); name 48, figures 36 + unit 14.
 * - 768–1279: 2 equal columns, gap 16; card ≈ 344 × 428 at 768, r 24; zone 200; clip 56 × 6;
 *   ribbon 72 (strands 15, 44 → 14); medal 112 × 109 (y 72–181); name 30, figures 24, unit in
 *   the label.
 * - < 768: stacked, 350 wide, gap 16; same geometry as tablet; 600 ms drop per card on its own.
 * Swing max 40° everywhere (the 40° sweep stays inside the card). Medal band height = zone.
 */
export const ABSOLUTE_LAYOUTS: readonly HangingLayout[] = [
  {
    id: 'absolute-desktop',
    query: ABSOLUTE_WIDE_QUERY,
    canvasHeight: 320,
    ribbonLength: 120,
    medalWidth: 176,
    medalHeight: 171,
    ribbonWidth: 24,
    ribbonSpreadTop: 70,
    ribbonSpreadBottom: 22,
    followAnchors: false,
    anchorsPct: [0.5],
    wind: { ampDeg: 3, periodS: 3.2, twistDeg: 6, twistPeriodS: 5.5 },
    entranceMs: 720,
    tapImpulse: 2.4,
  },
  {
    id: 'absolute-tablet',
    query: '(min-width: 768px)',
    canvasHeight: 200,
    ribbonLength: 72,
    medalWidth: 112,
    medalHeight: 109,
    ribbonWidth: 15,
    ribbonSpreadTop: 44,
    ribbonSpreadBottom: 14,
    followAnchors: false,
    anchorsPct: [0.5],
    wind: { ampDeg: 2.4, periodS: 3, twistDeg: 6, twistPeriodS: 5.5 },
    entranceMs: 720,
    tapImpulse: 1.6,
  },
  {
    id: 'absolute-mobile',
    query: 'all',
    canvasHeight: 200,
    ribbonLength: 72,
    medalWidth: 112,
    medalHeight: 109,
    ribbonWidth: 15,
    ribbonSpreadTop: 44,
    ribbonSpreadBottom: 14,
    followAnchors: false,
    anchorsPct: [0.5],
    wind: { ampDeg: 2.4, periodS: 3, twistDeg: 6, twistPeriodS: 5.5 },
    entranceMs: 600,
    tapImpulse: 1.6,
  },
];

export const ABSOLUTE_CARD: Record<string, AbsoluteCardLayout> = {
  'absolute-desktop': { pin: { width: 80, height: 8, radius: 4 }, minHeight: 616, radius: 32, haloSize: 288, staggerCards: true },
  'absolute-tablet': { pin: { width: 56, height: 6, radius: 3 }, minHeight: 428, radius: 24, haloSize: 200, staggerCards: true },
  'absolute-mobile': { pin: { width: 56, height: 6, radius: 3 }, minHeight: 428, radius: 24, haloSize: 200, staggerCards: false },
};

/** Block C physics: the shared rig constants with a 40° swing limit. */
export const ABSOLUTE_PHYSICS: MedalPhysics = { ...MEDAL_PHYSICS, maxSwingDeg: 40 };
