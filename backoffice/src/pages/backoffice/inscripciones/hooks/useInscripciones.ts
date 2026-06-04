import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { api } from '../../../../utils/api';
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
  ferInscripcionesSexoFilterAtom,
  ferInscripcionesCategoriaPesoFilterAtom,
  ferInscripcionesQuiereHandlerFilterAtom,
  ferInscripcionesQuierePeakProgramFilterAtom,
  ferInscripcionesParticipacionConfirmadaFilterAtom,
  ferInscripcionesHasCouponFilterAtom,
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
  // Phase 1: 6 new filter atom values
  const sexoFilter = useAtomValue(ferInscripcionesSexoFilterAtom);
  const categoriaPesoFilter = useAtomValue(ferInscripcionesCategoriaPesoFilterAtom);
  const quiereHandlerFilter = useAtomValue(ferInscripcionesQuiereHandlerFilterAtom);
  const quierePeakProgramFilter = useAtomValue(ferInscripcionesQuierePeakProgramFilterAtom);
  const participacionConfirmadaFilter = useAtomValue(ferInscripcionesParticipacionConfirmadaFilterAtom);
  const hasCouponFilter = useAtomValue(ferInscripcionesHasCouponFilterAtom);

  const fetchInscripciones = useCallback(async (
    pageOverride?: number,
    filters?: {
      search?: string;
      pagoConfirmado?: boolean;
      experiencia?: string;
      modalidad?: string;
      paymentMethod?: string;
      sexo?: string | null;
      categoriaPeso?: string | null;
      quiereHandler?: boolean | null;
      quierePeakProgram?: boolean | null;
      participacionConfirmada?: boolean | null;
      hasCoupon?: boolean | null;
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
        sexo: filters?.sexo ?? sexoFilter,
        categoriaPeso: filters?.categoriaPeso ?? categoriaPesoFilter,
        quiereHandler: filters?.quiereHandler ?? quiereHandlerFilter,
        quierePeakProgram: filters?.quierePeakProgram ?? quierePeakProgramFilter,
        participacionConfirmada: filters?.participacionConfirmada ?? participacionConfirmadaFilter,
        hasCoupon: filters?.hasCoupon ?? hasCouponFilter,
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
  }, [competicionId, currentPage, pageSize, searchQuery, pagoConfirmadoFilter, experienciaFilter, modalidadFilter, paymentMethodFilter, sexoFilter, categoriaPesoFilter, quiereHandlerFilter, quierePeakProgramFilter, participacionConfirmadaFilter, hasCouponFilter, setIsLoading, setError, setInscripciones, setTotalCount]);

  const fetchStats = useCallback(async () => {
    try {
      const result = await api.getAdminInscripcionStats(competicionId);
      if (result.success && result.data) {
        // Normalize to the InscripcionStats atom shape (DTO has all fields optional, atom requires total etc.)
        const d = result.data;
        setStats({
          total: d.total ?? 0,
          pagados: d.pagados ?? 0,
          pendientes: d.pendientes ?? 0,
          upsells: d.upsells ?? 0,
          checkins: d.checkins ?? 0,
          revenue: d.revenue,
          cashRevenue: d.cashRevenue,
          stripeRevenue: d.stripeRevenue,
          porExperiencia: d.porExperiencia ?? {},
          conEntrenador: d.conEntrenador ?? 0,
          sinEntrenador: d.sinEntrenador ?? 0,
        });
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

  const refreshFirstPage = useCallback(async () => {
    await Promise.all([
      fetchInscripciones(1),
      fetchStats(),
    ]);
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
    refreshFirstPage,
    exportCsv,
  };
}
