import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { FER_COLORS } from '../../fer/constants/constants';
import type { Competicion } from '../../../types/api';

export type InscripcionPageState = 'loading' | 'open' | 'closed' | 'error';

export interface InscripcionConfig {
  competicion: Competicion | null;
  plazasDisponibles: number;
  categoriasMasculino: string[];
  categoriasFemenino: string[];
  pageState: InscripcionPageState;
  precioBase: number | undefined;
  precioHandler: number | undefined;
  precioPeakProgram: number | undefined;
  fechaLimitePeakProgram: string | null;
  reload: () => void;
}

const TOAST_STYLE = { background: FER_COLORS.bgCard, color: FER_COLORS.text } as const;

export function useInscripcionConfig(): InscripcionConfig {
  const [competicion, setCompeticion] = useState<Competicion | null>(null);
  const [plazasDisponibles, setPlazasDisponibles] = useState(80);
  const [categoriasMasculino, setCategoriasMasculino] = useState<string[]>([]);
  const [categoriasFemenino, setCategoriasFemenino] = useState<string[]>([]);
  const [pageState, setPageState] = useState<InscripcionPageState>('loading');
  const [retryCount, setRetryCount] = useState(0);

  const loadConfig = useCallback(async () => {
    setPageState('loading');
    try {
      const [compResult, configResult] = await Promise.all([
        api.getCompeticionBySlug('fer'),
        api.getCompeticionConfig('fer'),
      ]);

      if (compResult.success && compResult.data) {
        setCompeticion(compResult.data);
        const plazas = compResult.data.plazasDisponibles ?? 80;
        setPlazasDisponibles(plazas);
      }

      if (configResult.success && configResult.data) {
        setCategoriasMasculino(configResult.data.categoriasMasculino || []);
        setCategoriasFemenino(configResult.data.categoriasFemenino || []);
        if (configResult.data.plazasDisponibles !== undefined) {
          setPlazasDisponibles(configResult.data.plazasDisponibles);
        }
        if (!configResult.data.inscripcionAbierta) {
          setPageState('closed');
          return;
        }
      }

      if (!compResult.success && !configResult.success) {
        setPageState('error');
        toast.error('Error cargando la información del evento', { style: TOAST_STYLE });
        return;
      }

      setPageState('open');
    } catch (error) {
      console.error('Error loading competicion:', error);
      setPageState('error');
      toast.error('Error de conexión. Intenta de nuevo.', { style: TOAST_STYLE });
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig, retryCount]);

  const reload = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  const precioBase = useMemo(
    () => competicion?.eventoConfig?.precioBase,
    [competicion?.eventoConfig?.precioBase]
  );

  const precioHandler = useMemo(
    () => competicion?.eventoConfig?.precioHandler,
    [competicion?.eventoConfig?.precioHandler]
  );

  const precioPeakProgram = useMemo(
    () => competicion?.eventoConfig?.precioPeakProgram,
    [competicion?.eventoConfig?.precioPeakProgram]
  );

  const fechaLimitePeakProgram = useMemo(
    () => competicion?.eventoConfig?.fechaLimitePeakProgram ?? null,
    [competicion?.eventoConfig?.fechaLimitePeakProgram]
  );

  return {
    competicion,
    plazasDisponibles,
    categoriasMasculino,
    categoriasFemenino,
    pageState,
    precioBase,
    precioHandler,
    precioPeakProgram,
    fechaLimitePeakProgram,
    reload,
  };
}
