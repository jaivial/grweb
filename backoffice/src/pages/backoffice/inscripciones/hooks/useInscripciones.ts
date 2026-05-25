import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import api from '../../../../api/client';
import type { CreateInscripcionRequest, UpdateInscripcionRequest } from '../../../../types/api';
import {
  ferInscripcionesAtom,
  ferInscripcionesLoadingAtom,
  ferInscripcionesErrorAtom,
  ferInscripcionesPageAtom,
  ferInscripcionesPageSizeAtom,
  ferInscripcionesTotalCountAtom,
  ferInscripcionesTotalPagesAtom,
  ferInscripcionesStatsAtom,
  ferInscripcionesSearchQueryAtom,
  ferInscripcionesPagoConfirmadoFilterAtom,
  ferInscripcionesExperienciaFilterAtom,
  ferInscripcionesModalidadFilterAtom,
  ferInscripcionesPaymentMethodFilterAtom,
  ferHasActiveFiltersAtom,
} from '../../../../stores/ferInscripcionesStore';

export function useInscripciones(competicionId: number) {
  const [inscripciones, setInscripciones] = useAtom(ferInscripcionesAtom);
  const [isLoading, setIsLoading] = useAtom(ferInscripcionesLoadingAtom);
  const [error, setError] = useAtom(ferInscripcionesErrorAtom);
  const [currentPage, setCurrentPage] = useAtom(ferInscripcionesPageAtom);
  const [pageSize] = useAtom(ferInscripcionesPageSizeAtom);
  const [totalCount, setTotalCount] = useAtom(ferInscripcionesTotalCountAtom);
  const totalPages = useAtomValue(ferInscripcionesTotalPagesAtom);
  const stats = useAtomValue(ferInscripcionesStatsAtom);
  const setStats = useSetAtom(ferInscripcionesStatsAtom);
  const hasFilters = useAtomValue(ferHasActiveFiltersAtom);

  const searchQuery = useAtomValue(ferInscripcionesSearchQueryAtom);
  const pagoConfirmadoFilter = useAtomValue(ferInscripcionesPagoConfirmadoFilterAtom);
  const experienciaFilter = useAtomValue(ferInscripcionesExperienciaFilterAtom);
  const modalidadFilter = useAtomValue(ferInscripcionesModalidadFilterAtom);
  const paymentMethodFilter = useAtomValue(ferInscripcionesPaymentMethodFilterAtom);

  const fetchInscripciones = useCallback(async (
    pageOverride?: number,
    filters?: {
      search?: string;
      pagoConfirmado?: boolean;
      experiencia?: string;
      modalidad?: string;
      paymentMethod?: string;
    }
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.getAdminInscripciones(competicionId, {
        page: pageOverride ?? currentPage,
        pageSize: pageSize,
        search: filters?.search || searchQuery || undefined,
        pagoConfirmado: filters?.pagoConfirmado ?? pagoConfirmadoFilter,
        experiencia: filters?.experiencia || experienciaFilter || undefined,
        modalidad: filters?.modalidad || modalidadFilter || undefined,
        paymentMethod: filters?.paymentMethod || paymentMethodFilter || undefined,
      });

      if (response.success && response.data) {
        setInscripciones(response.data.items);
        setTotalCount(response.data.total);
      } else {
        setError(response.message || 'Error al cargar inscripciones');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar inscripciones');
    } finally {
      setIsLoading(false);
    }
  }, [competicionId, currentPage, pageSize, searchQuery, pagoConfirmadoFilter, experienciaFilter, modalidadFilter, paymentMethodFilter, setIsLoading, setError, setInscripciones, setTotalCount]);

  const fetchStats = useCallback(async () => {
    try {
      const result = await api.getAdminInscripcionStats(competicionId);
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, [competicionId, setStats]);

  const updateInscripcion = useCallback(async (
    inscripcionId: number,
    data: UpdateInscripcionRequest
  ) => {
    const result = await api.updateAdminInscripcion(competicionId, inscripcionId, data);
    if (result.success) {
      await fetchInscripciones();
      await fetchStats();
    }
    return result;
  }, [competicionId, fetchInscripciones, fetchStats]);

  const createInscripcion = useCallback(async (data: CreateInscripcionRequest) => {
    const result = await api.createAdminInscripcion(competicionId, data);
    if (result.success) {
      await fetchInscripciones();
      await fetchStats();
    }
    return result;
  }, [competicionId, fetchInscripciones, fetchStats]);

  const deleteInscripcion = useCallback(async (inscripcionId: number) => {
    const result = await api.deleteAdminInscripcion(competicionId, inscripcionId);
    if (result.success) {
      await fetchInscripciones();
      await fetchStats();
    }
    return result;
  }, [competicionId, fetchInscripciones, fetchStats]);

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
    await Promise.all([fetchInscripciones(), fetchStats()]);
  }, [fetchInscripciones, fetchStats]);

  const exportCsv = useCallback(() => {
    const url = api.getExportCsvUrl(competicionId);
    window.open(url, '_blank');
  }, [competicionId]);

  return {
    inscripciones,
    stats,
    isLoading,
    error,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    hasFilters,
    fetchInscripciones,
    fetchStats,
    updateInscripcion,
    createInscripcion,
    deleteInscripcion,
    goToPage,
    nextPage,
    prevPage,
    refresh,
    exportCsv,
  };
}
