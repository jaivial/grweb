import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '../../utils/api';
import { useSignalR } from '../../hooks/useSignalR';
import { participantCount } from '../../stores/participants';

interface Statistics {
  totalParticipants: number;
  totalTickets: number;
  totalRevenue: number;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect to SignalR for real-time updates
  useSignalR();

  useEffect(() => {
    fetchStatistics();
  }, []);

  async function fetchStatistics() {
    try {
      setLoading(true);
      // Use cookie-based auth via credentials: 'include'
      const data = await api.getStatistics();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }

  // Update stats when participant count changes via SignalR
  useEffect(() => {
    if (stats && participantCount.value !== stats.totalParticipants) {
      fetchStatistics();
    }
  }, [participantCount.value]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-base p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-dark-surface rounded mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-dark-surface rounded-2xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-dark-base p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={fetchStatistics}
            className="px-6 py-2 bg-red-accent text-dark-base rounded-lg hover:scale-105 transition-transform"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-2">Dashboard</h1>
          <p className="text-text-secondary">GR Cup Raffle Overview</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Participants */}
          <div className="bg-dark-surface rounded-2xl p-6 border border-dark-lighter hover:border-red-accent transition-colors animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-accent/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                </svg>
              </div>
              <div className="flex items-center gap-1 text-green-500 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
                </svg>
                Live
              </div>
            </div>
            <p className="text-text-secondary text-sm mb-1">Total Participants</p>
            <p className="text-4xl font-bold text-text-primary">{participantCount.value || stats?.totalParticipants || 0}</p>
          </div>

          {/* Total Tickets */}
          <div className="bg-dark-surface rounded-2xl p-6 border border-dark-lighter hover:border-dark-red transition-colors animate-slide-up" style="animation-delay: 0.1s">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-dark-red/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-dark-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
                </svg>
              </div>
            </div>
            <p className="text-text-secondary text-sm mb-1">Total Tickets Sold</p>
            <p className="text-4xl font-bold text-text-primary">{stats?.totalTickets || 0}</p>
          </div>

          {/* Total Revenue */}
          <div className="bg-dark-surface rounded-2xl p-6 border border-dark-lighter hover:border-green-500 transition-colors animate-slide-up" style="animation-delay: 0.2s">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
            </div>
            <p className="text-text-secondary text-sm mb-1">Total Revenue</p>
            <p className="text-4xl font-bold text-text-primary">€{stats?.totalRevenue.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 animate-fade-in">
          <h2 className="text-2xl font-bold text-text-primary mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => navigate('/admin/participants')}
              className="bg-dark-surface rounded-xl p-6 border border-dark-lighter hover:border-red-accent transition-all hover:scale-105 text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-accent/10 flex items-center justify-center group-hover:bg-red-accent/20 transition-colors">
                  <svg className="w-5 h-5 text-red-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-text-primary font-semibold">View Participants</p>
                  <p className="text-text-muted text-sm">Manage entries</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => navigate('/admin/draw')}
              className="bg-dark-surface rounded-xl p-6 border border-dark-lighter hover:border-dark-red transition-all hover:scale-105 text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-dark-red/10 flex items-center justify-center group-hover:bg-dark-red/20 transition-colors">
                  <svg className="w-5 h-5 text-dark-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-text-primary font-semibold">Draw Winner</p>
                  <p className="text-text-muted text-sm">Select randomly</p>
                </div>
              </div>
            </button>

            <button
              onClick={async () => {
                try {
                  await api.exportCsv();
                } catch (err) {
                  console.error('Export failed:', err);
                }
              }}
              className="bg-dark-surface rounded-xl p-6 border border-dark-lighter hover:border-green-500 transition-all hover:scale-105 text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-text-primary font-semibold">Export CSV</p>
                  <p className="text-text-muted text-sm">Download data</p>
                </div>
              </div>
            </button>

            <button
              onClick={fetchStatistics}
              className="bg-dark-surface rounded-xl p-6 border border-dark-lighter hover:border-purple-500 transition-all hover:scale-105 text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-text-primary font-semibold">Refresh Stats</p>
                  <p className="text-text-muted text-sm">Update data</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {/* How It Works */}
          <div className="bg-dark-surface rounded-2xl p-6 border border-dark-lighter">
            <h3 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              How It Works
            </h3>
            <div className="space-y-3 text-text-secondary text-sm">
              <p>• Each ticket costs <span className="text-dark-red font-bold">€0.50</span></p>
              <p>• Participants can buy multiple tickets</p>
              <p>• Winner is selected randomly (weighted by ticket count)</p>
              <p>• Real-time updates via SignalR</p>
            </div>
          </div>

          {/* Admin Actions */}
          <div className="bg-dark-surface rounded-2xl p-6 border border-dark-lighter">
            <h3 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-dark-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
              Admin Security
            </h3>
            <div className="space-y-3 text-text-secondary text-sm">
              <p>• All admin routes are protected by JWT</p>
              <p>• Sessions expire after 24 hours</p>
              <p>• All draws are logged with timestamps</p>
              <p>• Change default credentials in production</p>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-8 text-center text-text-muted text-sm">
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
