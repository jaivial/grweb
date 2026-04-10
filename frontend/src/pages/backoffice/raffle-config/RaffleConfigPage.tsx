/**
 * RaffleConfigPage — Backoffice page for enabling/disabling the public raffle.
 * Follows the same pattern as InscripcionConfigPage.
 *
 * TDD Status: RED — tests define behavior, implementation follows.
 */

import { useEffect, useState, useCallback } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';

interface RaffleConfigData {
  isEnabled: boolean;
  disabledMessage: string | null;
}

export function RaffleConfigPage(): JSX.Element {
  const [config, setConfig] = useState<RaffleConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getRaffleConfig();
      setConfig(data);
      setMessageInput(data.disabledMessage || '');
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
      await api.updateRaffleConfig({
        isEnabled: !config.isEnabled,
        disabledMessage: !config.isEnabled ? (messageInput || null) : null,
      });
      setConfig(prev => prev ? {
        ...prev,
        isEnabled: !prev.isEnabled,
        disabledMessage: !prev.isEnabled ? (messageInput || null) : null,
      } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMessage = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await api.updateRaffleConfig({
        isEnabled: config.isEnabled,
        disabledMessage: messageInput || null,
      });
      setConfig(prev => prev ? { ...prev, disabledMessage: messageInput || null } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar el mensaje');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8">
        {/* Header */}
        <div className="mb-6 xs:mb-8">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2">
            Configuracion del Sorteo
          </h1>
          <p className="text-sm xs:text-base text-gray-400">
            Activa o desactiva el sorteo de manera rapida y sencilla
          </p>
        </div>

        {/* Toggle Card */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-6 mb-6">
          {/* Toggle Row */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">
                {config?.isEnabled ? 'Sorteo activo' : 'Sorteo desactivado'}
              </h2>
              <p className="text-sm text-gray-400">
                {config?.isEnabled
                  ? 'Los usuarios pueden participar en el sorteo'
                  : 'El formulario de sorteo no esta disponible'}
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving}
              aria-label={config?.isEnabled ? 'Desactivar sorteo' : 'Activar sorteo'}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 ${
                config?.isEnabled ? 'bg-red-accent' : 'bg-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                  config?.isEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Disabled Message Input (shown when disabled) */}
          {!config?.isEnabled && (
            <div className="space-y-4" data-testid="message-input-section">
              <div>
                <label
                  htmlFor="disabled-message"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Mensaje para usuarios (opcional)
                </label>
                <input
                  id="disabled-message"
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Escribe un mensaje personalizado..."
                  className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all"
                  data-testid="message-input"
                />
              </div>
              <button
                onClick={handleSaveMessage}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar mensaje'}
              </button>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {error && (
          <div className="p-4 mb-4 bg-red-accent/10 border border-red-accent/20 rounded-lg text-red-accent text-sm" data-testid="error-message">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 mb-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm" data-testid="success-message">
            Cambios guardados correctamente
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
            <div className="w-8 h-8 border-2 border-white/20 border-t-red-accent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}

export default RaffleConfigPage;
