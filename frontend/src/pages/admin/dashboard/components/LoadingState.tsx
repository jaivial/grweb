/**
 * Dashboard Loading State Component
 * 
 * Displays loading skeleton while dashboard data is being fetched.
 */

import type { JSX } from 'react';
import { Spinner } from '@components/ui';

export function DashboardLoadingState(): JSX.Element {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-dark-surface rounded-xl p-6 border border-dark-border">
            <div className="h-4 bg-dark-border rounded w-24 mb-4"></div>
            <div className="h-8 bg-dark-border rounded w-16"></div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
        <div className="h-6 bg-dark-border rounded w-32 mb-4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-dark-border rounded"></div>
          ))}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-dark-surface/50 rounded-xl p-4 border border-dark-border/50">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-dark-border rounded"></div>
              <div className="flex-1">
                <div className="h-5 bg-dark-border rounded w-24 mb-2"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-dark-border rounded w-full"></div>
                  <div className="h-4 bg-dark-border rounded w-3/4"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DashboardLoadingState;
