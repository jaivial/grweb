import type { BadgeVariant, BadgeSize } from '../types';

/**
 * Gets badge classes based on props
 */
export function getBadgeClasses(
  variant: BadgeVariant,
  size: BadgeSize
): string {
  const variantStyles = {
    default: 'bg-gray-700 text-gray-200',
    primary: 'bg-red-accent/20 text-red-accent border border-red-accent',
    success: 'bg-green-900/50 text-green-400 border border-green-700',
    warning: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700',
    error: 'bg-red-900/50 text-red-400 border border-red-700',
    info: 'bg-blue-900/50 text-blue-400 border border-blue-700',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return [
    'inline-flex items-center gap-1 font-medium rounded-full',
    variantStyles[variant],
    sizeStyles[size],
  ].join(' ');
}
