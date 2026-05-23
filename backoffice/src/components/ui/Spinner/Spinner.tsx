import type { ReactNode } from 'react';
import type { SpinnerProps } from './types';
import { getSpinnerClasses } from './utils/styles';

/**
 * Spinner Component
 * 
 * A loading spinner component with customizable size and color.
 * 
 * @example
 * // Small red accent spinner
 * <Spinner size="sm" color="red-accent" />
 * 
 * @example
 * // Large white spinner
 * <Spinner size="lg" color="white" />
 */
export function Spinner({
  size = 'md',
  color = 'red-accent',
  className = '',
}: SpinnerProps): ReactNode {
  const spinnerClasses = getSpinnerClasses(size, color);
  const combinedClasses = `${spinnerClasses} ${className}`.trim();

  return (
    <div className={combinedClasses} role="status" aria-label="Loading" data-ui="spinner">
      <span className="sr-only" data-ui="spinner-label">Loading...</span>
    </div>
  );
}

export default Spinner;