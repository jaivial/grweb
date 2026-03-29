/**
 * Dashboard Hook
 * 
 * Manages dashboard state and data fetching.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { token } from '../../../../stores/auth';
import { participantCount } from '../../../../stores/participants';
import { fetchDashboardStats } from '../lib/api';
import { DashboardStats, INITIAL_STATS, REFRESH_INTERVAL_MS } from '../types';

export interface UseDashboardReturn {
  // State
  stats: DashboardStats;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  liveParticipantCount: number;

  // Actions
  refreshStats: () => Promise<void>;
}

export function useDashboard(): UseDashboardReturn {
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const refreshIntervalRef = useRef<number | null>(null);

  // Fetch stats from API
  const refreshStats = useCallback(async () => {
    const currentToken = token.value;
    if (!currentToken) {
      setError('Not authenticated');
      return;
    }

    try {
      const data = await fetchDashboardStats(currentToken);
      setStats(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (token.value) {
      refreshStats();
    } else {
      setIsLoading(false);
    }
  }, [refreshStats]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (token.value) {
      refreshIntervalRef.current = window.setInterval(() => {
        refreshStats();
      }, REFRESH_INTERVAL_MS);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [refreshStats]);

  return {
    stats,
    isLoading,
    error,
    lastUpdated,
    liveParticipantCount: participantCount.value,
    refreshStats,
  };
}
