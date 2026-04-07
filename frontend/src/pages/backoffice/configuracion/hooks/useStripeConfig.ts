import { useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { token } from '../../../../stores/auth';
import { api } from '../../../../utils/api';
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

export function useStripeConfig(): UseStripeConfigReturn {
  const setConfig = useSetAtom(stripeConfigAtom);
  const setLoading = useSetAtom(stripeConfigLoadingAtom);
  const setSaving = useSetAtom(stripeConfigSavingAtom);
  const setError = useSetAtom(stripeConfigErrorAtom);

  const config = useAtomValue(stripeConfigAtom);
  const isLoading = useAtomValue(stripeConfigLoadingAtom);
  const isSaving = useAtomValue(stripeConfigSavingAtom);
  const error = useAtomValue(stripeConfigErrorAtom);

  const fetchConfig = useCallback(async () => {
    if (!token.value) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api.getStripeAdminConfig();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la configuración de Stripe');
    } finally {
      setLoading(false);
    }
  }, [setConfig, setLoading, setError]);

  const saveConfig = useCallback(async (data: StripeConfigData): Promise<boolean> => {
    if (!token.value) return false;

    setSaving(true);
    setError(null);

    try {
      const result = await api.updateStripeAdminConfig(data);
      setConfig(result);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la configuración de Stripe');
      return false;
    } finally {
      setSaving(false);
    }
  }, [setConfig, setSaving, setError]);

  const deleteConfig = useCallback(async (): Promise<boolean> => {
    if (!token.value) return false;

    setSaving(true);
    setError(null);

    try {
      await api.deleteStripeAdminConfig();
      setConfig(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la configuración de Stripe');
      return false;
    } finally {
      setSaving(false);
    }
  }, [setConfig, setSaving, setError]);

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
