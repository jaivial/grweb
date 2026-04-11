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
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`} data-ui="card-header">
      <div className="flex-1 min-w-0" data-ui="card-header-text">
        <h3 className="text-lg font-bold text-white truncate" data-ui="card-header-title">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-gray-400 mt-0.5" data-ui="card-header-subtitle">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0" data-ui="card-header-action">
          {action}
        </div>
      )}
    </div>
  );
}

export default CardHeader;