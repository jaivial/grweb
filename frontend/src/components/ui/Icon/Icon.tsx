import type { ReactNode } from 'react';
import type { IconProps } from './types';
import { iconPaths } from './utils/icons';
import { iconColors, iconSizes } from './types';

/**
 * Icon Component
 * 
 * A flexible icon component with a library of common icons.
 * 
 * @example
 * // Basic icon
 * <Icon name="check" size="md" />
 * 
 * @example
 * // Colored icon
 * <Icon name="warning" color="yellow" size="lg" />
 * 
 * @example
 * // With custom class
 * <Icon name="arrow-right" className="ml-2" />
 */
export function Icon({
  name,
  size = 'md',
  color = 'current',
  className = '',
  strokeWidth = 2,
}: IconProps): ReactNode {
  // Get the path for the icon
  const path = iconPaths[name];

  // If icon doesn't exist, return null
  if (!path) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  const classes = [
    'inline-flex',
    'flex-shrink-0',
    'fill-none',
    'stroke-current',
    iconSizes[size],
    iconColors[color],
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export default Icon;