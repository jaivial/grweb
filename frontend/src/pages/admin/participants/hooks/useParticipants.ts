/**
 * Participants Hook
 * 
 * Manages participants list state and data fetching.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { token } from '@stores/auth';
import { fetchParticipants, exportParticipantsCsv } from '../lib/api';
import { Participant, DEFAULT_PAGE_SIZE } from '../types';

export interface UseParticipantsReturn {
  // State
  participants: Participant[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  searchQuery: string;
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;

  // Actions
  loadParticipants: (page?: number) => Promise<void>;
  setSearchQuery: (query: string) => void;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  exportCsv: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useParticipants(): UseParticipantsReturn {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<number | null>(null);

  // Load participants from API
  const loadParticipants = useCallback(async (page: number = 1) => {
    const currentToken = token.value;
    if (!currentToken) {
      setError('Not authenticated');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchParticipants(
        currentToken,
        page,
        searchQuery || undefined
      );

      setParticipants(response.participants);
      setTotalCount(response.totalCount);
      setCurrentPage(response.page);
      setTotalPages(response.totalPages);
    } catch (err) {
      console.error('Failed to load participants:', err);
      setError(err instanceof Error ? err.message : 'Failed to load participants');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Set search query with debounce
  const setSearchQueryHandler = useCallback((query: string) => {
    setSearchQuery(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = window.setTimeout(() => {
      setCurrentPage(1);
      loadParticipants(1);
    }, 500);
  }, [loadParticipants]);

  // Navigation
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      loadParticipants(page);
    }
  }, [loadParticipants, totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [goToPage, currentPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [goToPage, currentPage]);

  // Export CSV
  const exportCsv = useCallback(async () => {
    const currentToken = token.value;
    if (!currentToken) {
      setError('Not authenticated');
      return;
    }

    setIsExporting(true);
    try {
      await exportParticipantsCsv(currentToken);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      setError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  }, []);

  // Refresh
  const refresh = useCallback(() => {
    return loadParticipants(currentPage);
  }, [loadParticipants, currentPage]);

  // Initial load
  useEffect(() => {
    if (token.value) {
      loadParticipants(1);
    }
  }, [token.value]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return {
    participants,
    totalCount,
    currentPage,
    pageSize,
    totalPages,
    searchQuery,
    isLoading,
    isExporting,
    error,
    loadParticipants,
    setSearchQuery: setSearchQueryHandler,
    goToPage,
    nextPage,
    prevPage,
    exportCsv,
    refresh,
  };
}
