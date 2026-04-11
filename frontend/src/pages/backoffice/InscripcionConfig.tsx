import { useEffect, useState, useCallback } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../layouts/BackofficeLayout';
import { api } from '../../utils/api';

interface InscripcionConfigData {
  active: boolean;
  url: string | null;
}

export function InscripcionConfigPage(): JSX.Element {
  const [config, setConfig] = useState<InscripcionConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getInscripcionConfig();
      setConfig(data);
      setUrlInput(data.url || '');
      setError(null);
    } catch {
      setError('Error al cargar la configuracion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleToggle = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await api.updateInscripcionConfig({
        active: !config.active,
        url: urlInput || null,
      });
      setConfig(prev => prev ? { ...prev, active: !prev.active } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await api.updateInscripcionConfig({
        active: config.active,
        url: urlInput || null,
      });
      setConfig(prev => prev ? { ...prev, url: urlInput || null } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar la URL');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="inscripcion-config-page">
        {/* Header */}
        <div className="mb-6 xs:mb-8" data-ui="config-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2">
            Configuracion de Inscripciones
          </h1>
          <p className="text-sm xs:text-base text-gray-400">
            Gestiona el tipo de inscripcion para los participantes
          </p>
        </div>

        {/* Toggle Card */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-6 mb-6" data-ui="toggle-card">
          {/* Toggle */}
          <div className="flex items-center justify-between mb-6" data-ui="toggle-row">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1" data-ui="toggle-status-title">
                {config?.active ? 'Inscripciones por web' : 'Inscripciones por AEP'}
              </h2>
              <p className="text-sm text-gray-400" data-ui="toggle-status-desc">
                {config?.active
                  ? 'Los usuarios se inscriben a traves del formulario web'
                  : 'Los usuarios son redirigidos a la pagina de la AEP'}
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 ${
                config?.active ? 'bg-red-accent' : 'bg-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-ui="toggle-button"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                  config?.active ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* URL Input (only shown when AEP mode) */}
          {!config?.active && (
            <div className="space-y-4" data-ui="url-input-section">
              <div>
                <label
                  htmlFor="aep-url"
                  className="block text-sm font-medium text-gray-300 mb-2"
                  data-ui="url-label"
                >
                  URL de la AEP para las inscripciones
                </label>
                <input
                  id="aep-url"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://aep.es/inscripciones/..."
                  className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all"
                  data-ui="url-input"
                />
              </div>
              <button
                onClick={handleSaveUrl}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                data-ui="save-url-btn"
              >
                {saving ? 'Guardando...' : 'Guardar URL'}
              </button>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {error && (
          <div className="p-4 mb-4 bg-red-accent/10 border border-red-accent/20 rounded-lg text-red-accent text-sm" data-ui="error-message">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 mb-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm" data-ui="success-message">
            Cambios guardados correctamente
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12" data-ui="loading-state">
            <div className="w-8 h-8 border-2 border-white/20 border-t-red-accent rounded-full animate-spin" data-ui="inscripcion-spinner" />
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}

export default InscripcionConfigPage;
