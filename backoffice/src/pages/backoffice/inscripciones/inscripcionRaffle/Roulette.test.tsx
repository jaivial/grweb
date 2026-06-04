import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Mock react-custom-roulette
vi.mock('react-custom-roulette', () => ({
  Wheel: (props: {
    mustStartSpinning: boolean;
    prizeNumber: number;
    data: Array<{ option: string }>;
  }) => (
    <div
      data-testid="roulette-wheel"
      data-must-start-spinning={String(props.mustStartSpinning)}
      data-prize-number={String(props.prizeNumber)}
      data-options={props.data.map((d) => d.option).join('|')}
    />
  ),
}));

import { Roulette } from './Roulette';

describe('Roulette', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the canvas wrapper with the configured data-testid', () => {
    render(
      <Roulette
        data={[{ option: 'Ada' }, { option: 'Linus' }]}
        mustStartSpinning={false}
        onFinishSpinning={() => {}}
      />
    );
    expect(screen.getByTestId('raffle-roulette')).toBeInTheDocument();
  });

  it('passes mustStartSpinning through to the wheel', () => {
    render(
      <Roulette
        data={[{ option: 'Ada' }]}
        mustStartSpinning={true}
        onFinishSpinning={() => {}}
      />
    );
    const wheel = screen.getByTestId('roulette-wheel');
    expect(wheel.getAttribute('data-must-start-spinning')).toBe('true');
  });

  it('passes prizeIndex through to the wheel as prizeNumber', () => {
    render(
      <Roulette
        data={[{ option: 'Ada' }, { option: 'Linus' }]}
        mustStartSpinning={false}
        onFinishSpinning={() => {}}
        prizeIndex={1}
      />
    );
    const wheel = screen.getByTestId('roulette-wheel');
    expect(wheel.getAttribute('data-prize-number')).toBe('1');
  });

  it('defaults prizeIndex to 0', () => {
    render(
      <Roulette
        data={[{ option: 'Ada' }]}
        mustStartSpinning={false}
        onFinishSpinning={() => {}}
      />
    );
    const wheel = screen.getByTestId('roulette-wheel');
    expect(wheel.getAttribute('data-prize-number')).toBe('0');
  });

  it('forwards the option labels into the wheel data', () => {
    render(
      <Roulette
        data={[{ option: 'Grace' }, { option: 'Alan' }, { option: 'Edsger' }]}
        mustStartSpinning={false}
        onFinishSpinning={() => {}}
      />
    );
    const wheel = screen.getByTestId('roulette-wheel');
    expect(wheel.getAttribute('data-options')).toBe('Grace|Alan|Edsger');
  });

  it('honors a custom dataTestid', () => {
    render(
      <Roulette
        data={[{ option: 'Ada' }]}
        mustStartSpinning={false}
        onFinishSpinning={() => {}}
        dataTestid="custom-roulette"
      />
    );
    expect(screen.getByTestId('custom-roulette')).toBeInTheDocument();
  });
});
