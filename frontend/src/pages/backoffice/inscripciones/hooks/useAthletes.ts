import { useState, useCallback } from 'react';
import { token } from '../../../../stores/auth';
import { api } from '../../../../utils/api';
import {
  athletes,
  athletesLoading,
  athletesError,
  athletesPage,
  athletesPageSize,
  athletesTotalCount,
  athletesTotalPages,
  athletesStats,
  athletesSearchQuery,
  athletesSexFilter,
  athletesWeightCategoryFilter,
  athletesStatusFilter,
  athletesClubFilter,
  hasActiveFilters,
  setAthletes,
  setAthletesLoading,
  setAthletesError,
  setAthletesPage,
  clearAthletesFilters,
  addAthlete,
  updateAthlete as updateAthleteInStore,
  removeAthlete,
} from '../../../../stores/athletesStore';
import type { Athlete, AthleteFormData } from '../../../../types/athlete';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../../../constants/categories';

interface UseAthletesReturn {
  athletes: typeof athletes.value;
  stats: typeof athletesStats.value;
  isLoading: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasFilters: boolean;
  fetchAthletes: () => Promise<void>;
  createAthlete: (data: AthleteFormData) => Promise<Athlete>;
  updateAthlete: (id: number, data: AthleteFormData) => Promise<Athlete>;
  deleteAthlete: (id: number) => Promise<void>;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => Promise<void>;
}

export function useAthletes(): UseAthletesReturn {
  const [currentPage, setCurrentPage] = useState(athletesPage.value);
  const [pageSize] = useState(athletesPageSize.value);

  const fetchAthletes = useCallback(async () => {
    if (!token.value) return;
    
    setAthletesLoading(true);
    setAthletesError(null);

    try {
      const params = {
        page: athletesPage.value,
        pageSize: pageSize,
        search: athletesSearchQuery.value || undefined,
        sex: athletesSexFilter.value || undefined,
        weightCategory: athletesWeightCategoryFilter.value || undefined,
        status: athletesStatusFilter.value || undefined,
        club: athletesClubFilter.value || undefined,
      };

      const response = await api.getAthletes(params);
      
      setAthletes({
        athletes: response.athletes,
        totalCount: response.totalCount,
        stats: response.stats,
      });
    } catch (err) {
      setAthletesError(err instanceof Error ? err.message : 'Error al cargar atletas');
    } finally {
      setAthletesLoading(false);
    }
  }, []);

  const createAthlete = useCallback(async (data: AthleteFormData): Promise<Athlete> => {
    if (!token.value) throw new Error('No autenticado');
    
    const athlete = await api.createAthlete({
      ...data,
      registrationDate: data.registrationDate || new Date().toISOString().split('T')[0],
    });
    
    addAthlete(athlete);
    return athlete;
  }, []);

  const updateAthlete = useCallback(async (id: number, data: AthleteFormData): Promise<Athlete> => {
    if (!token.value) throw new Error('No autenticado');
    
    const athlete = await api.updateAthlete(id, data);
    updateAthleteInStore(athlete);
    return athlete;
  }, []);

  const deleteAthlete = useCallback(async (id: number): Promise<void> => {
    if (!token.value) throw new Error('No autenticado');
    
    await api.deleteAthlete(id);
    removeAthlete(id);
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    setAthletesPage(page);
    fetchAthletes();
  }, [fetchAthletes]);

  const nextPage = useCallback(() => {
    if (currentPage < athletesTotalPages.value) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const refresh = useCallback(async () => {
    await fetchAthletes();
  }, [fetchAthletes]);

  return {
    athletes: athletes.value,
    stats: athletesStats.value,
    isLoading: athletesLoading.value,
    error: athletesError.value,
    currentPage,
    pageSize,
    totalCount: athletesTotalCount.value,
    totalPages: athletesTotalPages.value,
    hasFilters: hasActiveFilters.value,
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
