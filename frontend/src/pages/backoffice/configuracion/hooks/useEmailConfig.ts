import { useState, useCallback } from 'react';
import { token } from '../../../../stores/auth';
import { api } from '../../../../utils/api';

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

export function useEmailConfig(): UseEmailConfigReturn {
  const [config, setConfig] = useState<EmailConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!token.value) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getEmailConfig();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la configuración de email');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveConfig = useCallback(async (data: EmailConfigData): Promise<boolean> => {
    if (!token.value) return false;

    setIsSaving(true);
    setError(null);

    try {
      const result = await api.updateEmailConfig(data);
      setConfig(result);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la configuración');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const deleteConfig = useCallback(async (): Promise<boolean> => {
    if (!token.value) return false;

    setIsSaving(true);
    setError(null);

    try {
      await api.deleteEmailConfig();
      setConfig(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la configuración');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

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
