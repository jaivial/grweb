/**
 * Stat Card Component
 * 
 * Displays a single statistic with a label and value.
 */

import type { JSX } from 'react';
import { Spinner } from '@components/ui';

interface StatCardProps {
  label: string;
  value: string | number;
  isLoading?: boolean;
  trend?: 'up' | 'down' | 'neutral';
  icon?: JSX.Element;
}

export function StatCard({ label, value, isLoading, trend, icon }: StatCardProps): JSX.Element {
  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-400 text-sm mb-1">{label}</p>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className="text-gray-500">Loading...</span>
            </div>
          ) : (
            <p className="text-3xl font-bold text-white">{value}</p>
          )}
        </div>
        {icon && (
          <div className="text-red-accent opacity-50">
            {icon}
          </div>
        )}
      </div>
      {trend && !isLoading && (
        <div className="mt-2 flex items-center gap-1 text-sm">
          {trend === 'up' && (
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
          {trend === 'down' && (
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

export default StatCard;
