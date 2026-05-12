import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect } from 'react';
import { 
  competicionesAtom, 
  currentCompeticionDataAtom, 
  isLoadingCompeticionesAtom,
  plazasDisponiblesAtom,
} from '../stores/competicion.atoms';
import { currentCompeticionIdAtom, userCompeticionesAtom } from '../stores/auth.atoms';
import api from '../api/client';
import toast from 'react-hot-toast';

export function useCompeticiones() {
  const [competiciones, setCompeticiones] = useAtom(competicionesAtom);
  const [currentCompeticionData, setCurrentCompeticionData] = useAtom(currentCompeticionDataAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingCompeticionesAtom);
  const userCompeticiones = useAtomValue(userCompeticionesAtom);
  const [currentCompeticionId, setCurrentCompeticionId] = useAtom(currentCompeticionIdAtom);

  const loadCompeticiones = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getCompeticiones();
      if (result.success && result.data) {
        setCompeticiones(result.data);
      }
    } catch (error) {
      toast.error('Error al cargar competiciones');
    } finally {
      setIsLoading(false);
    }
  }, [setCompeticiones, setIsLoading]);

  const loadCompeticionData = useCallback(async (slug: string) => {
    setIsLoading(true);
    try {
      const result = await api.getCompeticionBySlug(slug);
      if (result.success && result.data) {
        setCurrentCompeticionData(result.data);
        return result.data;
      }
    } catch (error) {
      toast.error('Error al cargar datos de competición');
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [setCurrentCompeticionData, setIsLoading]);

  const loadAdminCompeticiones = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getAdminCompeticiones();
      if (result.success && result.data) {
        setCompeticiones(result.data);
      }
    } catch (error) {
      toast.error('Error al cargar competiciones');
    } finally {
      setIsLoading(false);
    }
  }, [setCompeticiones, setIsLoading]);

  // Select competition
  const selectCompeticion = useCallback((competicionId: number) => {
    setCurrentCompeticionId(competicionId);
  }, [setCurrentCompeticionId]);

  return {
    competiciones,
    currentCompeticionData,
    isLoading,
    userCompeticiones,
    currentCompeticionId,
    loadCompeticiones,
    loadCompeticionData,
    loadAdminCompeticiones,
    selectCompeticion,
  };
}

export function useCurrentCompeticionSlug() {
  const userCompeticiones = useAtomValue(userCompeticionesAtom);
  return userCompeticiones[0]?.slug ?? null;
}
