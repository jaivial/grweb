import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import { Roulette } from './Roulette';

describe('Roulette', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return window.setTimeout(() => cb(Date.now()), 16) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id as unknown as number);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders the custom cycler with the configured data-testid', () => {
    render(
      <Roulette
        candidates={[{ label: 'Ada' }, { label: 'Linus' }]}
        mustStartSpinning={false}
        onFinishSpinning={() => {}}
      />
    );
    expect(screen.getByTestId('raffle-roulette')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('animates through names and settles on the selected label with confetti', async () => {
    const onFinishSpinning = vi.fn();
    const { rerender } = render(
      <Roulette
        candidates={[{ label: 'Ada' }, { label: 'Linus' }, { label: 'Grace' }]}
        mustStartSpinning={false}
        selectedLabel="Grace"
        onFinishSpinning={onFinishSpinning}
      />
    );

    rerender(
      <Roulette
        candidates={[{ label: 'Ada' }, { label: 'Linus' }, { label: 'Grace' }]}
        mustStartSpinning={true}
        selectedLabel="Grace"
        onFinishSpinning={onFinishSpinning}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(onFinishSpinning).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Grace')).toBeInTheDocument();
    expect(screen.getByTestId('raffle-roulette-confetti')).toBeInTheDocument();
  });
});
