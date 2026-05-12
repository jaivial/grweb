import { useState, useCallback } from 'react';
import api from '../api/client';
import type { RifaConfig, RifaTicket } from '../types/api';
import toast from 'react-hot-toast';

export function useRifa(competicionId: number) {
  const [config, setConfig] = useState<RifaConfig | null>(null);
  const [tickets, setTickets] = useState<RifaTicket[]>([]);
  const [ticketsTotal, setTicketsTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getRifaConfig(competicionId);
      if (result.success && result.data) {
        setConfig(result.data);
      }
    } catch (error) {
      toast.error('Error al cargar configuración de rifa');
    } finally {
      setIsLoading(false);
    }
  }, [competicionId]);

  const updateConfig = useCallback(async (data: Parameters<typeof api.updateRifaConfig>[1]) => {
    const result = await api.updateRifaConfig(competicionId, data);
    if (result.success && result.data) {
      setConfig(result.data);
      toast.success('Configuración actualizada');
    } else {
      toast.error(result.message || 'Error al actualizar');
    }
    return result;
  }, [competicionId]);

  const loadTickets = useCallback(async (params: { page?: number; pageSize?: number; confirmado?: boolean } = {}) => {
    setIsLoading(true);
    try {
      const result = await api.getRifaTickets(competicionId, params);
      if (result.success && result.data) {
        setTickets(result.data.items);
        setTicketsTotal(result.data.total);
      }
    } catch (error) {
      toast.error('Error al cargar tickets');
    } finally {
      setIsLoading(false);
    }
  }, [competicionId]);

  const sellTicket = useCallback(async (data?: { numeroTicket?: string; buyerEmail?: string; buyerNombre?: string }) => {
    const result = await api.sellTicket(competicionId, data);
    if (result.success) {
      toast.success('Ticket vendido');
      await loadTickets();
      await loadConfig();
    } else {
      toast.error(result.message || 'Error al vender ticket');
    }
    return result;
  }, [competicionId, loadTickets, loadConfig]);

  const realizarSorteo = useCallback(async () => {
    if (!confirm('¿Realizar el sorteo?')) return;
    
    const result = await api.realizarSorteo(competicionId);
    if (result.success && result.data) {
      toast.success(`¡Número ganador: ${result.data.numeroGanador}!`);
      await loadConfig();
    } else {
      toast.error(result.message || 'Error al realizar sorteo');
    }
    return result;
  }, [competicionId, loadConfig]);

  return {
    config,
    tickets,
    ticketsTotal,
    isLoading,
    loadConfig,
    updateConfig,
    loadTickets,
    sellTicket,
    realizarSorteo,
  };
}
