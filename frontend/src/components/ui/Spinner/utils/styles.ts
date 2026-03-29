import type { SpinnerProps, SpinnerSize } from '../types';

/**
 * Gets spinner classes based on props
 */
export function getSpinnerClasses(
  size: SpinnerSize,
  color: SpinnerProps['color']
): string {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
    xl: 'w-12 h-12 border-4',
  };

  const colorClasses = {
    'red-accent': 'border-red-accent border-t-transparent',
    'dark-red': 'border-dark-red border-t-transparent',
    'white': 'border-white border-t-transparent',
  };

  return [
    'rounded-full',
    'animate-spin',
    sizeClasses[size],
    colorClasses[color || 'red-accent'],
  ].join(' ');
}
