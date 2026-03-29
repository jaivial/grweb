/**
 * Dashboard API Integration
 * 
 * API client for dashboard operations.
 */

import { api } from '../../../../utils/api';
import { DashboardStats } from '../types';

/**
 * Fetches dashboard statistics from the API
 */
export async function fetchDashboardStats(token: string): Promise<DashboardStats> {
  const stats = await api.getStatistics(token);
  return {
    totalParticipants: stats.totalParticipants,
    totalTickets: stats.totalTickets,
    totalRevenue: stats.totalRevenue,
  };
}

/**
 * Fetches participant count for real-time updates
 */
export async function fetchParticipantCount(): Promise<number> {
  const response = await api.getParticipantCount();
  return response.count;
}
