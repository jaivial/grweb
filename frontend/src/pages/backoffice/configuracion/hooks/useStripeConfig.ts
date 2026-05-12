import { useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import api from '../../../../api/client';
import {
  stripeConfigAtom,
  stripeConfigLoadingAtom,
  stripeConfigSavingAtom,
  stripeConfigErrorAtom,
  type StripeConfigData,
} from '../../../../stores/stripeConfigStore';

interface UseStripeConfigReturn {
  config: StripeConfigData | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  fetchConfig: () => Promise<void>;
  saveConfig: (data: StripeConfigData) => Promise<boolean>;
  deleteConfig: () => Promise<boolean>;
}

export function useStripeConfig(competicionId?: number): UseStripeConfigReturn {
  const setConfig = useSetAtom(stripeConfigAtom);
  const setLoading = useSetAtom(stripeConfigLoadingAtom);
  const setSaving = useSetAtom(stripeConfigSavingAtom);
  const setError = useSetAtom(stripeConfigErrorAtom);

  const config = useAtomValue(stripeConfigAtom);
  const isLoading = useAtomValue(stripeConfigLoadingAtom);
  const isSaving = useAtomValue(stripeConfigSavingAtom);
  const error = useAtomValue(stripeConfigErrorAtom);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.getStripeAdminConfig(competicionId);
      if (result.success && result.data) {
        setConfig(result.data as StripeConfigData);
      } else {
        setError(result.message || 'Error al cargar la configuración de Stripe');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la configuración de Stripe');
    } finally {
      setLoading(false);
    }
  }, [competicionId, setConfig, setLoading, setError]);

  const saveConfig = useCallback(async (data: StripeConfigData): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      const result = await api.updateStripeAdminConfig(data, competicionId);
      if (result.success && result.data) {
        setConfig(result.data as StripeConfigData);
        return true;
      } else {
        setError(result.message || 'Error al guardar la configuración de Stripe');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la configuración de Stripe');
      return false;
    } finally {
      setSaving(false);
    }
  }, [competicionId, setConfig, setSaving, setError]);

  const deleteConfig = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      const result = await api.deleteStripeAdminConfig(competicionId);
      if (result.success) {
        setConfig(null);
        return true;
      } else {
        setError(result.message || 'Error al eliminar la configuración de Stripe');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la configuración de Stripe');
      return false;
    } finally {
      setSaving(false);
    }
  }, [competicionId, setConfig, setSaving, setError]);

  return {
    config,
    isLoading,
    error,
    isSaving,
    fetchConfig,
    saveConfig,
    deleteConfig,
  };
}
