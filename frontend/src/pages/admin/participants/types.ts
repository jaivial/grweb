/**
 * Participants Page Types
 * 
 * Type definitions for the admin participants page.
 */

export interface Participant {
  id: number;
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  totalPaid: number;
  createdAt: string;
}

export interface ParticipantsResponse {
  participants: Participant[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ParticipantsState {
  participants: Participant[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  searchQuery: string;
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_EXPORT_RECORDS = 10000;
