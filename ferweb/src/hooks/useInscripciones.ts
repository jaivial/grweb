import { useState, useCallback } from 'react';
import api from '../api/client';
import type { CreateInscripcionRequest, Inscripcion, InscripcionStats } from '../types/api';
import toast from 'react-hot-toast';

export function useInscripciones(competicionId: number) {
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [stats, setStats] = useState<InscripcionStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{
    pagoConfirmado?: boolean;
    experiencia?: string;
  }>({});

  const loadInscripciones = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getAdminInscripciones(competicionId, {
        page,
        pageSize,
        search: search || undefined,
        ...filters,
      });
      
      if (result.success && result.data) {
        setInscripciones(result.data.items);
        setTotal(result.data.total);
      }
    } catch (error) {
      toast.error('Error al cargar inscripciones');
    } finally {
      setIsLoading(false);
    }
  }, [competicionId, page, pageSize, search, filters]);

  const loadStats = useCallback(async () => {
    try {
      const result = await api.getAdminInscripcionStats(competicionId);
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [competicionId]);

  const updateInscripcion = useCallback(async (
    inscripcionId: number,
    data: Parameters<typeof api.updateAdminInscripcion>[2]
  ) => {
    const result = await api.updateAdminInscripcion(competicionId, inscripcionId, data);
    if (result.success) {
      toast.success('Inscripción actualizada');
      await loadInscripciones();
      await loadStats();
    } else {
      toast.error(result.message || 'Error al actualizar');
    }
    return result;
  }, [competicionId, loadInscripciones, loadStats]);

  const deleteInscripcion = useCallback(async (inscripcionId: number) => {
    if (!confirm('¿Estás seguro de eliminar esta inscripción?')) return;
    
    const result = await api.deleteAdminInscripcion(competicionId, inscripcionId);
    if (result.success) {
      toast.success('Inscripción eliminada');
      await loadInscripciones();
      await loadStats();
    } else {
      toast.error(result.message || 'Error al eliminar');
    }
    return result;
  }, [competicionId, loadInscripciones, loadStats]);

  const exportCsv = useCallback(() => {
    const url = api.getExportCsvUrl(competicionId);
    window.open(url, '_blank');
  }, [competicionId]);

  return {
    inscripciones,
    stats,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    search,
    setSearch,
    filters,
    setFilters,
    isLoading,
    loadInscripciones,
    loadStats,
    updateInscripcion,
    deleteInscripcion,
    exportCsv,
  };
}
