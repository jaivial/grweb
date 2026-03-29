import type { ReactNode } from 'react';
import type { CardHeaderProps } from '../types';

/**
 * CardHeader Component
 * 
 * Header section for cards with title, subtitle, and optional action.
 * 
 * @example
 * <CardHeader 
 *   title="Statistics" 
 *   subtitle="Last 30 days"
 *   action={<Button size="sm">View All</Button>}
 * />
 */
export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: CardHeaderProps): ReactNode {
  return (
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-white truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-gray-400 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

export default CardHeader;