import { calculateAnimationState, AnimationPhase } from '@utils/heroAnimationState';

describe('calculateAnimationState', () => {
  test('returns IDLE phase at progress 0', () => {
    const state = calculateAnimationState(0);
    expect(state.currentPhase).toBe(AnimationPhase.IDLE);
    expect(state.textOpacity).toBe(0);
    expect(state.smokeOpacity).toBe(1);
    expect(state.smokeOffset).toBe(0);
    expect(state.frameProgress).toBe(0);
    expect(state.cloudsEnterProgress).toBe(0);
    expect(state.frameAnimationActive).toBe(false);
  });

  test('returns IDLE phase at progress 0.02', () => {
    const state = calculateAnimationState(0.02);
    expect(state.currentPhase).toBe(AnimationPhase.IDLE);
  });

  test('transitions to TEXT_FADE_IN at 0.03', () => {
    const state = calculateAnimationState(0.03);
    expect(state.currentPhase).toBe(AnimationPhase.TEXT_FADE_IN);
    expect(state.textVisible).toBe(true);
    expect(state.textOpacity).toBeGreaterThanOrEqual(0);
    expect(state.textOpacity).toBeLessThanOrEqual(1);
  });

  test('TEXT_FADE_IN increases opacity from 0 toward 1', () => {
    const early = calculateAnimationState(0.03);
    const mid = calculateAnimationState(0.07);
    expect(mid.textOpacity).toBeGreaterThan(early.textOpacity);
  });

  test('at 0.12 phase is FRAME_ANIMATION (overrides TEXT_FADE_OUT)', () => {
    const state = calculateAnimationState(0.12);
    // FRAME_ANIMATION (0.04-0.80) takes precedence over TEXT_FADE_OUT (0.12-0.21)
    expect(state.currentPhase).toBe(AnimationPhase.FRAME_ANIMATION);
    expect(state.textVisible).toBe(true);
  });

  test('text opacity behavior during FRAME_ANIMATION override', () => {
    // FRAME_ANIMATION (0.04-0.80) overrides TEXT_FADE_OUT (0.12-0.21)
    // During this overlap, textOpacity stays 1 because currentPhase is FRAME_ANIMATION
    const duringOverlap = calculateAnimationState(0.16);
    expect(duringOverlap.currentPhase).toBe(AnimationPhase.FRAME_ANIMATION);
    expect(duringOverlap.textVisible).toBe(true);
    expect(duringOverlap.textOpacity).toBe(1);

    // After TEXT_FADE_OUT end (0.21), text becomes invisible
    const afterFadeOut = calculateAnimationState(0.22);
    expect(afterFadeOut.textVisible).toBe(false);
    expect(afterFadeOut.textOpacity).toBe(0);
  });

  test('textVisible is false after TEXT_FADE_OUT ends', () => {
    const state = calculateAnimationState(0.22);
    expect(state.textVisible).toBe(false);
  });

  test('SMOKE_REVEAL decreases smoke opacity from 1 to 0', () => {
    const start = calculateAnimationState(0.01);
    const mid = calculateAnimationState(0.06);
    const end = calculateAnimationState(0.11);
    expect(start.smokeOpacity).toBeGreaterThanOrEqual(0.9);
    expect(mid.smokeOpacity).toBeLessThan(start.smokeOpacity);
    expect(end.smokeOpacity).toBeGreaterThan(0);
  });

  test('smoke is fully gone after SMOKE_REVEAL phase', () => {
    const state = calculateAnimationState(0.20);
    expect(state.smokeOpacity).toBe(0);
    expect(state.smokeOffset).toBe(1);
  });

  test('FRAME_ANIMATION starts at 0.04', () => {
    const state = calculateAnimationState(0.04);
    expect(state.frameAnimationActive).toBe(true);
    expect(state.frameProgress).toBe(0);
  });

  test('FRAME_ANIMATION progress increases through the phase', () => {
    const early = calculateAnimationState(0.20);
    const mid = calculateAnimationState(0.42);
    const late = calculateAnimationState(0.70);
    expect(mid.frameProgress).toBeGreaterThan(early.frameProgress);
    expect(late.frameProgress).toBeGreaterThan(mid.frameProgress);
  });

  test('FRAME_ANIMATION ends at 1.0 with progress 1', () => {
    const state = calculateAnimationState(0.999);
    expect(state.frameAnimationActive).toBe(true);
    expect(state.frameProgress).toBeLessThanOrEqual(1);
  });

  test('FRAME_ANIMATION is inactive at 1.0', () => {
    const state = calculateAnimationState(1.0);
    expect(state.frameAnimationActive).toBe(false);
    expect(state.frameProgress).toBe(1);
  });

  test('CLOUDS_ENTER starts at 0.85', () => {
    const state = calculateAnimationState(0.85);
    expect(state.currentPhase).toBe(AnimationPhase.CLOUDS_ENTER);
    expect(state.cloudsEnterProgress).toBe(0);
  });

  test('CLOUDS_ENTER progress increases to 1', () => {
    const mid = calculateAnimationState(0.925);
    const end = calculateAnimationState(1.0);
    expect(mid.cloudsEnterProgress).toBeGreaterThan(0);
    expect(mid.cloudsEnterProgress).toBeLessThan(1);
    expect(end.cloudsEnterProgress).toBe(1);
  });

  test('clamps negative progress', () => {
    const state = calculateAnimationState(-0.5);
    expect(state.currentPhase).toBe(AnimationPhase.IDLE);
    expect(state.textOpacity).toBe(0);
  });

  test('clamps progress > 1', () => {
    const state = calculateAnimationState(1.5);
    expect(state.cloudsEnterProgress).toBe(1);
    expect(state.frameProgress).toBe(1);
  });

  test('returns all expected state properties', () => {
    const state = calculateAnimationState(0.5);
    expect(state).toHaveProperty('currentPhase');
    expect(state).toHaveProperty('phaseProgress');
    expect(state).toHaveProperty('textVisible');
    expect(state).toHaveProperty('textOpacity');
    expect(state).toHaveProperty('smokeOpacity');
    expect(state).toHaveProperty('smokeOffset');
    expect(state).toHaveProperty('frameAnimationActive');
    expect(state).toHaveProperty('frameProgress');
    expect(state).toHaveProperty('cloudsEnterProgress');
  });
});
