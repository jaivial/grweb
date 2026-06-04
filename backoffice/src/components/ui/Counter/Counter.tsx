import { useCallback } from 'react';
import type { JSX } from 'react';
import { Icon } from '../Icon/Icon';

export interface CounterProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label?: string;
  dataTestid?: string;
}

export function Counter({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  label,
  dataTestid = 'counter',
}: CounterProps): JSX.Element {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = useCallback(() => {
    if (canDecrement) onChange(value - 1);
  }, [canDecrement, onChange, value]);

  const handleIncrement = useCallback(() => {
    if (canIncrement) onChange(value + 1);
  }, [canIncrement, onChange, value]);

  return (
    <div className="flex flex-col" data-ui="counter" data-testid={dataTestid}>
      {label && (
        <span className="text-sm font-medium text-white/80 mb-1.5" data-ui="counter-label">
          {label}
        </span>
      )}
      <div className="flex items-center justify-center gap-6" data-ui="counter-controls">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={!canDecrement}
          className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label="Decrement"
          data-ui="counter-minus-btn"
          data-testid="counter-minus"
        >
          <Icon name="minus" size="lg" className="text-white" />
        </button>
        <div
          className="text-5xl font-bold text-white min-w-[80px] text-center"
          data-ui="counter-value"
          data-testid={`${dataTestid}-value`}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={!canIncrement}
          className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label="Increment"
          data-ui="counter-plus-btn"
          data-testid="counter-plus"
        >
          <Icon name="plus" size="lg" className="text-white" />
        </button>
      </div>
    </div>
  );
}

export default Counter;
