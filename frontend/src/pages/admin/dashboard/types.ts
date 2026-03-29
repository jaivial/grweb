/**
 * Dashboard Page Types
 * 
 * Type definitions for the admin dashboard page.
 */

export interface DashboardStats {
  totalParticipants: number;
  totalTickets: number;
  totalRevenue: number;
}

export interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export const INITIAL_STATS: DashboardStats = {
  totalParticipants: 0,
  totalTickets: 0,
  totalRevenue: 0,
};

export const REFRESH_INTERVAL_MS = 30000; // 30 seconds
