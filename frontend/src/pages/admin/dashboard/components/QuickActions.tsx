/**
 * Quick Actions Component
 * 
 * Provides quick action buttons for common dashboard tasks.
 */

import type { JSX } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@components/ui';
import { UsersIcon, TrophyIcon, DownloadIcon, RefreshIcon } from '@components/ui/Icon';

interface QuickActionsProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function QuickActions({ onRefresh, isRefreshing }: QuickActionsProps): JSX.Element {
  const [location, navigate] = useLocation();

  const actions = [
    {
      label: 'View Participants',
      icon: <UsersIcon className="w-5 h-5" />,
      onClick: () => navigate('/admin/participants'),
      variant: 'secondary' as const,
    },
    {
      label: 'Draw Winner',
      icon: <TrophyIcon className="w-5 h-5" />,
      onClick: () => navigate('/admin/draw'),
      variant: 'primary' as const,
    },
    {
      label: 'Export CSV',
      icon: <DownloadIcon className="w-5 h-5" />,
      onClick: () => {
        const currentToken = localStorage.getItem('gr_cup_token');
        if (currentToken) {
          window.open(`/api/admin/export/csv`, '_blank');
        }
      },
      variant: 'secondary' as const,
    },
    {
      label: 'Refresh Stats',
      icon: <RefreshIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />,
      onClick: onRefresh,
      variant: 'secondary' as const,
      disabled: isRefreshing,
    },
  ];

  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant}
            size="md"
            onClick={action.onClick}
            disabled={action.disabled}
            className="flex flex-col items-center gap-2 py-4"
          >
            {action.icon}
            <span className="text-sm">{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export default QuickActions;
