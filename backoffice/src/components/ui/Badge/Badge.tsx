import type { JSX } from 'react';
import { ReactNode } from 'react';
import type { BadgeProps } from './types';
import { getBadgeClasses } from './utils/styles';

/**
 * Badge Component
 * 
 * A small status indicator component.
 * 
 * @example
 * // Status badges
 * <Badge variant="success">Active</Badge>
 * <Badge variant="warning">Pending</Badge>
 * <Badge variant="error">Failed</Badge>
 */
export function Badge({
  variant = 'default',
  size = 'md',
  children,
  icon,
  class: className = '',
  className: classNameAlt = '',
}: BadgeProps): JSX.Element {
  const badgeClasses = getBadgeClasses(variant, size);
  const combinedClasses = `${badgeClasses} ${className} ${classNameAlt}`.trim();

  return (
    <span className={combinedClasses} data-ui="badge">
      {icon && <span className="w-4 h-4" data-ui="badge-icon">{icon}</span>}
      {children}
    </span>
  );
}

export default Badge;
