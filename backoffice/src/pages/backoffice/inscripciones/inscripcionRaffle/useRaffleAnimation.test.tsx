import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { useRaffleAnimation } from './useRaffleAnimation';

describe('useRaffleAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in a non-spinning, fully-hidden state', () => {
    const { result } = renderHook(() => useRaffleAnimation([1, 2, 3]));
    expect(result.current.isSpinning).toBe(false);
    expect(result.current.currentRevealIndex).toBe(-1);
  });

  it('start() schedules a requestAnimationFrame and flips isSpinning', () => {
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockReturnValue(0 as unknown as number);
    const { result } = renderHook(() => useRaffleAnimation([1, 2, 3]));
    act(() => {
      result.current.start();
    });
    expect(rafSpy).toHaveBeenCalled();
    expect(result.current.isSpinning).toBe(true);
    rafSpy.mockRestore();
  });

  it('stop() cancels the RAF and flips isSpinning off', () => {
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockReturnValue(0 as unknown as number);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { result } = renderHook(() => useRaffleAnimation([1, 2, 3]));
    act(() => {
      result.current.start();
    });
    expect(rafSpy).toHaveBeenCalled();
    act(() => {
      result.current.stop();
    });
    expect(cancelSpy).toHaveBeenCalled();
    expect(result.current.isSpinning).toBe(false);
    rafSpy.mockRestore();
  });

  it('revealAt sets currentRevealIndex to the given value', () => {
    const { result } = renderHook(() => useRaffleAnimation([1, 2, 3]));
    act(() => {
      result.current.revealAt(2);
    });
    expect(result.current.currentRevealIndex).toBe(2);
  });

  it('reset() returns the hook to its initial state', () => {
    const { result } = renderHook(() => useRaffleAnimation([1, 2, 3]));
    act(() => {
      result.current.revealAt(2);
    });
    expect(result.current.currentRevealIndex).toBe(2);
    act(() => {
      result.current.reset();
    });
    expect(result.current.isSpinning).toBe(false);
    expect(result.current.currentRevealIndex).toBe(-1);
  });

  it('cleans up timers on unmount', () => {
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockReturnValue(0 as unknown as number);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount, result } = renderHook(() => useRaffleAnimation([1, 2, 3]));
    act(() => {
      result.current.start();
    });
    expect(rafSpy).toHaveBeenCalled();
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('renders without crashing in a component context', () => {
    function Consumer() {
      const anim = useRaffleAnimation([1, 2, 3]);
      return <div data-testid="anim">{anim.currentRevealIndex}</div>;
    }
    const { getByTestId } = render(<Consumer />);
    expect(getByTestId('anim')).toHaveTextContent('-1');
  });
});
