import { useState, useCallback } from 'react';
import api from '../../../../api/client';

export interface EmailConfigData {
  mainProvider: number;
  gmailAddress: string | null;
  gmailAppPassword: string | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  smtpEmailAddress: string | null;
  smtpHost: string | null;
  smtpPort: number;
}

interface UseEmailConfigReturn {
  config: EmailConfigData | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  fetchConfig: () => Promise<void>;
  saveConfig: (data: EmailConfigData) => Promise<boolean>;
  deleteConfig: () => Promise<boolean>;
}

export function useEmailConfig(competicionId?: number): UseEmailConfigReturn {
  const [config, setConfig] = useState<EmailConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.getEmailConfig(competicionId);
      if (result.success && result.data) {
        setConfig(result.data as EmailConfigData);
      } else {
        setError(result.message || 'Error al cargar la configuración de email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la configuración de email');
    } finally {
      setIsLoading(false);
    }
  }, [competicionId]);

  const saveConfig = useCallback(async (data: EmailConfigData): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await api.updateEmailConfig(data, competicionId);
      if (result.success && result.data) {
        setConfig(result.data as EmailConfigData);
        return true;
      } else {
        setError(result.message || 'Error al guardar la configuración');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la configuración');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [competicionId]);

  const deleteConfig = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await api.deleteEmailConfig(competicionId);
      if (result.success) {
        setConfig(null);
        return true;
      } else {
        setError(result.message || 'Error al eliminar la configuración');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la configuración');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [competicionId]);

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
