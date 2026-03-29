/**
 * Participants API Integration
 * 
 * API client for participants operations.
 */

import { api } from '@utils/api';
import { ParticipantsResponse } from '../types';

/**
 * Fetches paginated list of participants
 */
export async function fetchParticipants(
  token: string,
  page: number = 1,
  search?: string
): Promise<ParticipantsResponse> {
  return api.getParticipants(token, page, search);
}

/**
 * Exports participants data as CSV
 */
export async function exportParticipantsCsv(token: string): Promise<void> {
  return api.exportCsv(token);
}
