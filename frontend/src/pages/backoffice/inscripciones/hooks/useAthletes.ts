import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { token } from '../../../../stores/auth';
import { api } from '../../../../utils/api';
import {
  athletesAtom,
  athletesLoadingAtom,
  athletesErrorAtom,
  athletesPageAtom,
  athletesPageSizeAtom,
  athletesTotalCountAtom,
  athletesTotalPagesAtom,
  athletesStatsAtom,
  athletesSearchQueryAtom,
  athletesSexFilterAtom,
  athletesWeightCategoryFilterAtom,
  athletesStatusFilterAtom,
  athletesClubFilterAtom,
  hasActiveFiltersAtom,
} from '../../../../stores/athletesStore';
import type { Athlete, AthleteFormData } from '../../../../types/athlete';

export function useAthletes() {
  const [athletes, setAthletes] = useAtom(athletesAtom);
  const [isLoading, setIsLoading] = useAtom(athletesLoadingAtom);
  const [error, setError] = useAtom(athletesErrorAtom);
  const [currentPage, setCurrentPage] = useAtom(athletesPageAtom);
  const [pageSize] = useAtom(athletesPageSizeAtom);
  const [totalCount, setTotalCount] = useAtom(athletesTotalCountAtom);
  const totalPages = useAtomValue(athletesTotalPagesAtom);
  const stats = useAtomValue(athletesStatsAtom);
  const hasFilters = useAtomValue(hasActiveFiltersAtom);
  const setStats = useSetAtom(athletesStatsAtom);

  const searchQuery = useAtomValue(athletesSearchQueryAtom);
  const sexFilter = useAtomValue(athletesSexFilterAtom);
  const weightCategoryFilter = useAtomValue(athletesWeightCategoryFilterAtom);
  const statusFilter = useAtomValue(athletesStatusFilterAtom);
  const clubFilter = useAtomValue(athletesClubFilterAtom);

  const fetchAthletes = useCallback(async (
    pageOverride?: number,
    filters?: {
      search?: string;
      sex?: string;
      weightCategory?: string;
      status?: string;
      club?: string;
    }
  ) => {
    if (!token.value) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.getAthletes({
        page: pageOverride ?? currentPage,
        pageSize: pageSize,
        search: filters?.search || searchQuery || undefined,
        sex: filters?.sex || sexFilter || undefined,
        weightCategory: filters?.weightCategory || weightCategoryFilter || undefined,
        status: filters?.status || statusFilter || undefined,
        club: filters?.club || clubFilter || undefined,
      });

      setAthletes(response.athletes);
      setTotalCount(response.totalCount);
      setStats(response.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar atletas');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, sexFilter, weightCategoryFilter, statusFilter, clubFilter, setIsLoading, setError, setAthletes, setTotalCount, setStats]);

  const createAthlete = useCallback(async (data: AthleteFormData): Promise<Athlete> => {
    if (!token.value) throw new Error('No autenticado');

    const athlete = await api.createAthlete({
      ...data,
      registrationDate: data.registrationDate || new Date().toISOString().split('T')[0],
    });

    setAthletes((prev) => [athlete, ...prev]);
    return athlete;
  }, [setAthletes]);

  const updateAthlete = useCallback(async (id: number, data: AthleteFormData): Promise<Athlete> => {
    if (!token.value) throw new Error('No autenticado');

    const athlete = await api.updateAthlete(id, data);
    setAthletes((prev) => prev.map((a) => (a.id === id ? athlete : a)));
    return athlete;
  }, [setAthletes]);

  const deleteAthlete = useCallback(async (id: number): Promise<void> => {
    if (!token.value) throw new Error('No autenticado');

    await api.deleteAthlete(id);
    setAthletes((prev) => prev.filter((a) => a.id !== id));
  }, [setAthletes]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, [setCurrentPage]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  }, [currentPage, totalPages, setCurrentPage]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage, setCurrentPage]);

  const refresh = useCallback(async () => {
    await fetchAthletes();
  }, [fetchAthletes]);

  return {
    athletes,
    stats,
    isLoading,
    error,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    hasFilters,
    fetchAthletes,
    createAthlete,
    updateAthlete,
    deleteAthlete,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  };
}
