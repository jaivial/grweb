/**
 * useRaffleAnimation — drives the two-phase reveal animation
 *
 * Phase 1 (spin): requestAnimationFrame loop ticking `frames` from
 *   `winners.length * 10` down to 0 over `spinDurationMs`. This powers
 *   the wheel's built-in animation and a progress counter.
 * Phase 2 (reveal): after spin ends, stagger-reveals winners one by one
 *   with `revealDelayMs` between each.
 *
 * State is kept in refs + a single useReducer that holds
 * `{ isSpinning, currentRevealIndex, frameCount }`. No useState.
 *
 * Why useReducer over Jotai atoms? The animation lifecycle is local to
 * a single component instance — global state would leak across modal
 * openings. The hook is the right scope.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { UseRaffleAnimationOptions, UseRaffleAnimationResult } from './types';
import { RAFFLE_TIMING } from './constants';

interface AnimationState {
  isSpinning: boolean;
  currentRevealIndex: number;
  frameCount: number;
}

type AnimationAction =
  | { type: 'spin/start' }
  | { type: 'spin/frame'; frameCount: number }
  | { type: 'spin/stop' }
  | { type: 'reveal/next'; index: number }
  | { type: 'reset' };

const INITIAL_STATE: AnimationState = {
  isSpinning: false,
  currentRevealIndex: -1,
  frameCount: 0,
};

function reducer(state: AnimationState, action: AnimationAction): AnimationState {
  switch (action.type) {
    case 'spin/start':
      return { ...state, isSpinning: true, currentRevealIndex: -1 };
    case 'spin/frame':
      return { ...state, frameCount: action.frameCount };
    case 'spin/stop':
      return { ...state, isSpinning: false };
    case 'reveal/next':
      return { ...state, currentRevealIndex: action.index };
    case 'reset':
      return INITIAL_STATE;
    default:
      return state;
  }
}

export function useRaffleAnimation<T>(
  _winners: T[],
  options?: UseRaffleAnimationOptions
): UseRaffleAnimationResult {
  const spinDurationMs = options?.spinDurationMs ?? RAFFLE_TIMING.spinDurationMs;
  const revealDelayMs = options?.revealDelayMs ?? RAFFLE_TIMING.revealDelayMs;

  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Use a ref for the RAF id so cancel/cleanup is stable.
  const rafIdRef = useRef<number | null>(null);
  const spinStartRef = useRef<number | null>(null);
  const revealTimeoutsRef = useRef<number[]>([]);
  const winnersLengthRef = useRef<number>(_winners.length);

  // Track the latest winners length so the spin loop's frame budget scales.
  useEffect(() => {
    winnersLengthRef.current = _winners.length;
  }, [_winners.length]);

  const clearAllTimers = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    revealTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    revealTimeoutsRef.current = [];
  }, []);

  const scheduleReveals = useCallback(
    (winnersLength: number) => {
      revealTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      revealTimeoutsRef.current = [];

      for (let i = 0; i < winnersLength; i += 1) {
        const id = window.setTimeout(() => {
          dispatch({ type: 'reveal/next', index: i });
        }, i * revealDelayMs);
        revealTimeoutsRef.current.push(id);
      }
    },
    [revealDelayMs]
  );

  const start = useCallback(() => {
    clearAllTimers();
    spinStartRef.current = null;
    dispatch({ type: 'spin/start' });
    dispatch({ type: 'spin/frame', frameCount: winnersLengthRef.current * 10 });

    const tick = (now: number) => {
      if (spinStartRef.current === null) spinStartRef.current = now;
      const elapsed = now - spinStartRef.current;
      const total = Math.max(1, winnersLengthRef.current) * 10;
      const remaining = Math.max(0, total - Math.floor((elapsed / spinDurationMs) * total));
      dispatch({ type: 'spin/frame', frameCount: remaining });

      if (elapsed >= spinDurationMs) {
        dispatch({ type: 'spin/stop' });
        dispatch({ type: 'spin/frame', frameCount: 0 });
        scheduleReveals(winnersLengthRef.current);
        rafIdRef.current = null;
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [clearAllTimers, scheduleReveals, spinDurationMs]);

  const stop = useCallback(() => {
    clearAllTimers();
    dispatch({ type: 'spin/stop' });
  }, [clearAllTimers]);

  const revealAt = useCallback((i: number) => {
    dispatch({ type: 'reveal/next', index: i });
  }, []);

  const reset = useCallback(() => {
    clearAllTimers();
    spinStartRef.current = null;
    dispatch({ type: 'reset' });
  }, [clearAllTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return {
    isSpinning: state.isSpinning,
    currentRevealIndex: state.currentRevealIndex,
    start,
    stop,
    revealAt,
    reset,
  };
}
