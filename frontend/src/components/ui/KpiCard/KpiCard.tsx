import type { ReactNode } from 'react';
import type { JSX } from 'react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const colorClasses = {
  default: 'text-white bg-white/5 border border-white/10 backdrop-blur-xl',
  success: 'text-green-400 bg-green-500/10 border border-green-500/20 backdrop-blur-xl',
  warning: 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 backdrop-blur-xl',
  danger: 'text-red-400 bg-red-500/10 border border-red-500/20 backdrop-blur-xl',
};

const iconColorClasses = {
  default: 'text-red-accent',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  danger: 'text-red-400',
};

export function KpiCard({
  label,
  value,
  icon,
  color = 'default',
  className = '',
}: KpiCardProps): JSX.Element {
  return (
    <div
      className={`flex flex-col justify-between p-3 xs:p-4 rounded-2xl min-w-0 ${colorClasses[color]} ${className}`}
      data-ui="kpi-card"
    >
      <div className="flex items-start justify-between gap-2 xs:gap-3 mb-2" data-ui="kpi-content">
        <div className="flex-1 min-w-0" data-ui="kpi-text">
          <p className="text-xs xs:text-sm text-white/60 leading-tight" data-ui="kpi-label">
            {label}
          </p>
        </div>
        {icon && (
          <div className={`flex-shrink-0 ${iconColorClasses[color]} opacity-70`} data-ui="kpi-icon">
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl xs:text-3xl sm:text-4xl font-bold text-white tracking-tight leading-none" data-ui="kpi-value">
        {value}
      </p>
    </div>
  );
}

export default KpiCard;