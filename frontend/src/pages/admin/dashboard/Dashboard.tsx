/**
 * Dashboard Page
 * 
 * Admin dashboard with KPI cards and quick actions.
 */

import type { JSX } from 'react';
import { useLocation } from 'wouter';
import { StatCard, QuickActions, InfoCard, DashboardLoadingState } from './components';
import { useDashboard } from './hooks';
import { UsersIcon, TicketIcon, CurrencyIcon, ShieldIcon, LockIcon } from '@components/ui/Icon';

export function Dashboard(): JSX.Element {
  const { stats, isLoading, error, lastUpdated, refreshStats } = useDashboard();
  const [location, navigate] = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('gr_cup_token');
    navigate('/admin/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-base">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <DashboardLoadingState />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-dark-base flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={refreshStats}
            className="px-4 py-2 bg-red-accent text-black rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-base">
      {/* Header */}
      <header className="bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            {lastUpdated && (
              <p className="text-gray-500 text-sm mt-1">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <LockIcon className="w-5 h-5" />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Total Participants"
            value={stats.totalParticipants.toLocaleString()}
            icon={<UsersIcon className="w-8 h-8" />}
          />
          <StatCard
            label="Total Tickets Sold"
            value={stats.totalTickets.toLocaleString()}
            icon={<TicketIcon className="w-8 h-8" />}
          />
          <StatCard
            label="Total Revenue"
            value={`€${stats.totalRevenue.toFixed(2)}`}
            icon={<CurrencyIcon className="w-8 h-8" />}
          />
        </div>

        {/* Quick Actions */}
        <QuickActions onRefresh={refreshStats} isRefreshing={isLoading} />

        {/* Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard title="How It Works" icon={<UsersIcon className="w-5 h-5 text-red-accent" />}>
            <p>Participants purchase raffle tickets at €0.50 each. The winner is randomly selected weighted by ticket count.</p>
            <p className="mt-2">Real-time participant count updates automatically via SignalR.</p>
          </InfoCard>

          <InfoCard title="Admin Security" icon={<ShieldIcon className="w-5 h-5 text-dark-red" />}>
            <p>All admin actions are logged and auditable. JWT tokens expire after 24 hours.</p>
            <p className="mt-2">Winner draws require confirmation to be considered official.</p>
          </InfoCard>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
