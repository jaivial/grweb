import { useState, useCallback, useEffect } from 'react';
import { api } from '../../../../utils/api';

interface InscripcionPreparadaData {
  dateTime: string | null;
  preparadas: boolean;
}

interface ResponsableUrlData {
  value: boolean;
  url: string | null;
  dateModified: string | null;
}

interface UseInscripcionesSettingsReturn {
  preparedData: InscripcionPreparadaData | null;
  responsableData: ResponsableUrlData | null;
  loadingPreparadas: boolean;
  loadingResponsableUrl: boolean;
  savingPreparadas: boolean;
  savingResponsableUrl: boolean;
  urlInput: string;
  urlSaved: boolean;
  setUrlInput: (value: string) => void;
  togglePreparadas: () => Promise<void>;
  toggleResponsable: () => Promise<void>;
  saveUrl: (url: string) => Promise<void>;
}

export function useInscripcionesSettings(): UseInscripcionesSettingsReturn {
  const [preparedData, setPreparedData] = useState<InscripcionPreparadaData | null>(null);
  const [responsableData, setResponsableData] = useState<ResponsableUrlData | null>(null);
  const [loadingPreparadas, setLoadingPreparadas] = useState(true);
  const [loadingResponsableUrl, setLoadingResponsableUrl] = useState(true);
  const [savingPreparadas, setSavingPreparadas] = useState(false);
  const [savingResponsableUrl, setSavingResponsableUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlSaved, setUrlSaved] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const fetchData = async () => {
      try {
        const [preparadasResult, responsableResult] = await Promise.all([
          api.getInscripcionPreparada(),
          api.getResponsableUrlInscripciones(),
        ]);
        setPreparedData(preparadasResult);
        setResponsableData(responsableResult);
        setUrlInput(responsableResult.url || '');
      } catch (error) {
        console.error('Error fetching inscripciones settings:', error);
        setPreparedData({ dateTime: null, preparadas: false });
        setResponsableData({ value: true, url: null, dateModified: null });
        setUrlInput('');
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 1000 - elapsed);
        setTimeout(() => {
          setLoadingPreparadas(false);
          setLoadingResponsableUrl(false);
        }, remaining);
      }
    };
    fetchData();
  }, []);

  const togglePreparadas = useCallback(async () => {
    if (!preparedData) return;
    try {
      setSavingPreparadas(true);
      await api.updateInscripcionPreparada({
        dateTime: preparedData.dateTime,
        preparadas: !preparedData.preparadas,
      });
      setPreparedData(prev => prev ? { ...prev, preparadas: !prev.preparadas } : null);
    } catch (error) {
      console.error('Error updating inscripciones preparadas:', error);
    } finally {
      setSavingPreparadas(false);
    }
  }, [preparedData]);

  const toggleResponsable = useCallback(async () => {
    if (!responsableData) return;
    try {
      setSavingResponsableUrl(true);
      await api.updateResponsableUrlInscripciones({
        value: !responsableData.value,
        url: responsableData.url,
      });
      setResponsableData(prev => prev ? { ...prev, value: !prev.value } : null);
    } catch (error) {
      console.error('Error updating responsable:', error);
    } finally {
      setSavingResponsableUrl(false);
    }
  }, [responsableData]);

  const saveUrl = useCallback(async (url: string) => {
    if (!responsableData) return;
    try {
      setSavingResponsableUrl(true);
      setUrlSaved(false);
      await api.updateResponsableUrlInscripciones({
        value: responsableData.value,
        url: url,
      });
      setResponsableData(prev => prev ? { ...prev, url } : null);
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 3000);
    } catch (error) {
      console.error('Error saving URL:', error);
    } finally {
      setSavingResponsableUrl(false);
    }
  }, [responsableData]);

  return {
    preparedData,
    responsableData,
    loadingPreparadas,
    loadingResponsableUrl,
    savingPreparadas,
    savingResponsableUrl,
    urlInput,
    urlSaved,
    setUrlInput,
    togglePreparadas,
    toggleResponsable,
    saveUrl,
  };
}

export default useInscripcionesSettings;
