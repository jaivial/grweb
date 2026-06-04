/**
 * Roulette — wrapper around react-custom-roulette's <Wheel />
 *
 * Why a wrapper?
 * - Normalizes the prop names (react-custom-roulette uses `prizeNumber`,
 *   `onStopSpinning`; we expose `prizeIndex`, `onFinishSpinning`).
 * - Sets a stable height so layout doesn't jump as data changes.
 * - Provides a single, mockable seam for unit tests.
 * - Adds `data-testid` and `data-ui` for QA.
 */

import { useMemo, useCallback } from 'react';
import type { JSX } from 'react';
import { Wheel } from 'react-custom-roulette';
import { RAFFLE_WHEEL_HEIGHT } from './constants';

// react-custom-roulette re-exports WheelData only via the components
// namespace. The shape we need is `{ option: string }` which is
// structurally compatible. We re-declare a narrow type here so we
// don't depend on a non-public export.
export interface RouletteWheelData {
  option: string;
}

export interface RouletteProps {
  data: Array<{ option: string }>;
  mustStartSpinning: boolean;
  onFinishSpinning: () => void;
  prizeIndex?: number;
  dataTestid?: string;
  height?: number;
}

export function Roulette({
  data,
  mustStartSpinning,
  onFinishSpinning,
  prizeIndex = 0,
  dataTestid = 'raffle-roulette',
  height = RAFFLE_WHEEL_HEIGHT,
}: RouletteProps): JSX.Element {
  // Memoize the data shape so we don't re-render the wheel on parent re-render
  const wheelData = useMemo<RouletteWheelData[]>(
    () => data.map((d) => ({ option: d.option })),
    [data]
  );

  const handleStopSpinning = useCallback(() => {
    onFinishSpinning();
  }, [onFinishSpinning]);

  return (
    <div
      className="flex items-center justify-center w-full"
      data-ui="roulette-wrapper"
      data-testid={dataTestid}
    >
      <Wheel
        mustStartSpinning={mustStartSpinning}
        prizeNumber={prizeIndex}
        data={wheelData}
        onStopSpinning={handleStopSpinning}
        backgroundColors={['#0f172a', '#1e293b']}
        textColors={['#f8fafc']}
        outerBorderColor="#facc15"
        outerBorderWidth={4}
        innerRadius={20}
        innerBorderColor="#facc15"
        innerBorderWidth={2}
        radiusLineColor="#ffffff20"
        radiusLineWidth={1}
        fontSize={14}
        spinDuration={0.6}
        disableInitialAnimation
        perpendicularText
      />
      <span
        className="sr-only"
        style={{ height: `${height}px` }}
        data-ui="roulette-hidden-height"
        aria-hidden="true"
      />
    </div>
  );
}

export default Roulette;
