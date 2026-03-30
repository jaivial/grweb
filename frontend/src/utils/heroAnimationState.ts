export enum AnimationPhase {
  IDLE = 'IDLE',
  TEXT_FADE_IN = 'TEXT_FADE_IN',
  TEXT_FADE_OUT = 'TEXT_FADE_OUT',
  SMOKE_REVEAL = 'SMOKE_REVEAL',
  FRAME_ANIMATION = 'FRAME_ANIMATION',
  CLOUDS_ENTER = 'CLOUDS_ENTER',
}

export interface AnimationState {
  currentPhase: AnimationPhase;
  phaseProgress: number;
  textVisible: boolean;
  textOpacity: number;
  smokeOpacity: number;
  smokeOffset: number;
  frameAnimationActive: boolean;
  frameProgress: number;
  cloudsEnterProgress: number;
}

const PHASE_THRESHOLDS = {
  [AnimationPhase.IDLE]: { start: 0, end: 0.03 },
  [AnimationPhase.TEXT_FADE_IN]: { start: 0.03, end: 0.12 },
  [AnimationPhase.TEXT_FADE_OUT]: { start: 0.12, end: 0.21 },
  [AnimationPhase.SMOKE_REVEAL]: { start: 0.01, end: 0.12 },
  [AnimationPhase.FRAME_ANIMATION]: { start: 0.04, end: 1 },
  [AnimationPhase.CLOUDS_ENTER]: { start: 0.85, end: 1.0 },
};

export function calculateAnimationState(scrollProgress: number): AnimationState {
  let currentPhase = AnimationPhase.IDLE;

  for (const [phase, thresholds] of Object.entries(PHASE_THRESHOLDS)) {
    if (scrollProgress >= thresholds.start && scrollProgress < thresholds.end) {
      currentPhase = phase as AnimationPhase;
      break;
    }
  }

  if (scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.FRAME_ANIMATION].start &&
      scrollProgress < PHASE_THRESHOLDS[AnimationPhase.FRAME_ANIMATION].end) {
    currentPhase = AnimationPhase.FRAME_ANIMATION;
  }

  if (scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.CLOUDS_ENTER].start) {
    currentPhase = AnimationPhase.CLOUDS_ENTER;
  }

  const thresholds = PHASE_THRESHOLDS[currentPhase];
  const phaseDuration = thresholds.end - thresholds.start;
  const phaseProgress = phaseDuration > 0
    ? Math.min(1, (scrollProgress - thresholds.start) / phaseDuration)
    : 0;

  const textVisible = scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.TEXT_FADE_IN].start &&
                      scrollProgress < PHASE_THRESHOLDS[AnimationPhase.TEXT_FADE_OUT].end;

  let textOpacity = 0;
  if (currentPhase === AnimationPhase.TEXT_FADE_IN) {
    textOpacity = easeInOutCubic(phaseProgress);
  } else if (currentPhase === AnimationPhase.TEXT_FADE_OUT) {
    textOpacity = 1 - easeInOutCubic(phaseProgress);
  } else if (textVisible) {
    textOpacity = 1;
  }

  // Smoke starts with an initial offset so it's already in motion before text fades
  const initialSmokeOffset = 0;
  let smokeOpacity = 1;
  let smokeOffset = 0;

  if (scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.SMOKE_REVEAL].start &&
      scrollProgress < PHASE_THRESHOLDS[AnimationPhase.SMOKE_REVEAL].end) {
    const smokeStart = PHASE_THRESHOLDS[AnimationPhase.SMOKE_REVEAL].start;
    const smokeEnd = PHASE_THRESHOLDS[AnimationPhase.SMOKE_REVEAL].end;
    const smokeDuration = smokeEnd - smokeStart;
    const p = Math.min(1, (scrollProgress - smokeStart) / smokeDuration);
    smokeOpacity = 1 - easeInOutCubic(p);
    smokeOffset = easeInOutCubic(p);
  } else if (scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.SMOKE_REVEAL].end) {
    smokeOpacity = 0;
    smokeOffset = 1;
  }

  const frameAnimationActive = scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.FRAME_ANIMATION].start &&
                               scrollProgress <= PHASE_THRESHOLDS[AnimationPhase.FRAME_ANIMATION].end;
  let frameProgress = 0;

  if (frameAnimationActive) {
    const frameThresholds = PHASE_THRESHOLDS[AnimationPhase.FRAME_ANIMATION];
    const frameDuration = frameThresholds.end - frameThresholds.start;
    frameProgress = frameDuration > 0
      ? Math.min(1, (scrollProgress - frameThresholds.start) / frameDuration)
      : 0;
  } else if (scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.FRAME_ANIMATION].end) {
    frameProgress = 1;
  }

  // Clouds enter from bottom after frame animation completes
  let cloudsEnterProgress = 0;
  if (scrollProgress >= PHASE_THRESHOLDS[AnimationPhase.CLOUDS_ENTER].start) {
    const cloudsThresholds = PHASE_THRESHOLDS[AnimationPhase.CLOUDS_ENTER];
    const cloudsDuration = cloudsThresholds.end - cloudsThresholds.start;
    cloudsEnterProgress = cloudsDuration > 0
      ? Math.min(1, (scrollProgress - cloudsThresholds.start) / cloudsDuration)
      : 0;
  }

  return {
    currentPhase,
    phaseProgress,
    textVisible,
    textOpacity,
    smokeOpacity,
    smokeOffset,
    frameAnimationActive,
    frameProgress,
    cloudsEnterProgress,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getPhaseName(phase: AnimationPhase): string {
  return phase.replace(/_/g, ' ').toLowerCase();
}
