import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import api from '../../../../../api/client';
import { eventoConfigFormAtom, eventoConfigLoadingAtom, eventoConfigSavingAtom, eventoConfigErrorAtom, eventoConfigSuccessAtom } from '../atoms';
import { toFormData } from '../helpers';
import type { EventoConfigFormData } from '../types';
import toast from 'react-hot-toast';

export function useEventoConfig(competicionId: number) {
  const form = useAtomValue(eventoConfigFormAtom);
  const setForm = useSetAtom(eventoConfigFormAtom);
  const loading = useAtomValue(eventoConfigLoadingAtom);
  const setLoading = useSetAtom(eventoConfigLoadingAtom);
  const saving = useAtomValue(eventoConfigSavingAtom);
  const setSaving = useSetAtom(eventoConfigSavingAtom);
  const error = useAtomValue(eventoConfigErrorAtom);
  const setError = useSetAtom(eventoConfigErrorAtom);
  const success = useAtomValue(eventoConfigSuccessAtom);
  const setSuccess = useSetAtom(eventoConfigSuccessAtom);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAdminCompeticion(competicionId);
      if (result.success && result.data?.eventoConfig) {
        setForm(toFormData(result.data.eventoConfig as unknown as Record<string, unknown>));
      }
    } catch {
      setError('Error al cargar la configuración del evento');
      toast.error('Error al cargar la configuración del evento');
    } finally {
      setLoading(false);
    }
  }, [competicionId, setForm, setLoading, setError]);

  const updateField = useCallback(
    <K extends keyof EventoConfigFormData>(key: K, value: EventoConfigFormData[K]) => {
      setForm(prev => ({ ...prev, [key]: value }));
    },
    [setForm]
  );

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await api.updateEventoConfig(competicionId, form);
      if (result.success) {
        setSuccess(true);
        toast.success('Configuración de evento guardada');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.message ?? 'Error al guardar');
        toast.error(result.message ?? 'Error al guardar la configuración');
      }
    } catch {
      setError('Error al guardar la configuración');
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  }, [competicionId, form, setError, setSaving, setSuccess]);

  return {
    form,
    loading,
    saving,
    error,
    success,
    loadConfig,
    updateField,
    saveConfig,
  } as const;
}
