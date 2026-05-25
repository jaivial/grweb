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
  pagoStripeActivo: boolean;
  pagoEfectivoActivo: boolean;
  stripeDisponible: boolean;
  cuponesDescuentoActivo: boolean;
  reload: () => void;
}

const TOAST_STYLE = { background: FER_COLORS.bgCard, color: FER_COLORS.text } as const;

export function useInscripcionConfig(): InscripcionConfig {
  const [competicion, setCompeticion] = useState<Competicion | null>(null);
  const [plazasDisponibles, setPlazasDisponibles] = useState(80);
  const [categoriasMasculino, setCategoriasMasculino] = useState<string[]>([]);
  const [categoriasFemenino, setCategoriasFemenino] = useState<string[]>([]);
  const [pageState, setPageState] = useState<InscripcionPageState>('loading');
  const [precioBaseConfig, setPrecioBaseConfig] = useState<number | undefined>(undefined);
  const [precioHandlerConfig, setPrecioHandlerConfig] = useState<number | undefined>(undefined);
  const [precioPeakProgramConfig, setPrecioPeakProgramConfig] = useState<number | undefined>(undefined);
  const [fechaLimitePeakProgramConfig, setFechaLimitePeakProgramConfig] = useState<string | null>(null);
  const [pagoStripeActivo, setPagoStripeActivo] = useState(false);
  const [pagoEfectivoActivo, setPagoEfectivoActivo] = useState(false);
  const [stripeDisponible, setStripeDisponible] = useState(false);
  const [cuponesDescuentoActivo, setCuponesDescuentoActivo] = useState(false);
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
        setPrecioBaseConfig(configResult.data.precioBase);
        setPrecioHandlerConfig(configResult.data.precioHandler);
        setPrecioPeakProgramConfig(configResult.data.precioPeakProgram);
        setFechaLimitePeakProgramConfig(configResult.data.fechaLimitePeakProgram ?? null);
        setPagoStripeActivo(Boolean(configResult.data.pagoStripeActivo));
        setPagoEfectivoActivo(configResult.data.pagoEfectivoActivo !== false);
        setStripeDisponible(Boolean(configResult.data.stripeDisponible));
        setCuponesDescuentoActivo(Boolean(configResult.data.cuponesDescuentoActivo));
        if (configResult.data.plazasDisponibles !== undefined) {
          setPlazasDisponibles(configResult.data.plazasDisponibles);
        }
        if (!configResult.data.inscripcionAbierta) {
          setPageState('closed');
          return;
        }
      }

      if (!configResult.success) {
        setPageState('error');
        toast.error('Error cargando la configuración del evento. Inténtalo de nuevo.', { style: TOAST_STYLE });
        return;
      }

      if (!compResult.success) {
        setPageState('error');
        toast.error('Error cargando la información del evento. Inténtalo de nuevo.', { style: TOAST_STYLE });
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
    () => precioBaseConfig ?? competicion?.eventoConfig?.precioBase,
    [competicion?.eventoConfig?.precioBase, precioBaseConfig]
  );

  const precioHandler = useMemo(
    () => precioHandlerConfig ?? competicion?.eventoConfig?.precioHandler,
    [competicion?.eventoConfig?.precioHandler, precioHandlerConfig]
  );

  const precioPeakProgram = useMemo(
    () => precioPeakProgramConfig ?? competicion?.eventoConfig?.precioPeakProgram,
    [competicion?.eventoConfig?.precioPeakProgram, precioPeakProgramConfig]
  );

  const fechaLimitePeakProgram = useMemo(
    () => fechaLimitePeakProgramConfig ?? competicion?.eventoConfig?.fechaLimitePeakProgram ?? null,
    [competicion?.eventoConfig?.fechaLimitePeakProgram, fechaLimitePeakProgramConfig]
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
    pagoStripeActivo,
    pagoEfectivoActivo,
    stripeDisponible,
    cuponesDescuentoActivo,
    reload,
  };
}
