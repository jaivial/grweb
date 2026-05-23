import { useCallback } from 'react';
import { Lock, Unlock, Check } from 'lucide-react';
import { Button } from '../../../../components/ui';

interface InscripcionPreparadaData {
  dateTime: string | null;
  preparadas: boolean;
}

interface ResponsableUrlData {
  value: boolean;
  url: string | null;
  dateModified: string | null;
}

interface InscripcionesControlsProps {
  loadingPreparadas: boolean;
  loadingResponsableUrl: boolean;
  savingPreparadas: boolean;
  savingResponsableUrl: boolean;
  preparedData: InscripcionPreparadaData | null;
  responsableData: ResponsableUrlData | null;
  urlInput: string;
  urlSaved: boolean;
  onTogglePreparadas: () => void;
  onToggleResponsable: () => void;
  onSaveUrl: (url: string) => void;
  onUrlInputChange: (value: string) => void;
}

export function InscripcionesControls({
  loadingPreparadas,
  loadingResponsableUrl,
  savingPreparadas,
  savingResponsableUrl,
  preparedData,
  responsableData,
  urlInput,
  urlSaved,
  onTogglePreparadas,
  onToggleResponsable,
  onSaveUrl,
  onUrlInputChange,
}: InscripcionesControlsProps) {
  if (loadingPreparadas || loadingResponsableUrl) {
    return (
      <div className="flex items-center justify-center py-8 mb-4" data-ui="inscripciones-controls-loading">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" data-ui="inscripciones-controls-spinner" />
      </div>
    );
  }

  return (
    <>
      {/* Prepared Toggle */}
      {preparedData && (
        <div className="mb-4 p-4 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="inscripciones-prepared-toggle-card">
          <div className="flex items-center justify-between gap-3" data-ui="inscripciones-prepared-toggle-row">
            <div className="flex items-center gap-3 min-w-0" data-ui="inscripciones-prepared-icon-wrapper">
              {preparedData.preparadas ? (
                <Unlock className="w-6 h-6 shrink-0 text-green-400" data-ui="inscripciones-prepared-icon-unlocked" />
              ) : (
                <Lock className="w-6 h-6 shrink-0 text-gray-500" data-ui="inscripciones-prepared-icon-locked" />
              )}
              <div className="min-w-0" data-ui="inscripciones-prepared-text-wrapper">
                <h2 className="text-base font-semibold text-white" data-ui="inscripciones-prepared-title">
                  Inscripciones preparadas
                </h2>
                <p className="text-sm text-gray-400" data-ui="inscripciones-prepared-description">
                  {preparedData.preparadas
                    ? 'Las inscripciones están activas y visibles para los usuarios'
                    : 'Las inscripciones no están listas todavía'}
                </p>
              </div>
            </div>
            <button
              onClick={onTogglePreparadas}
              disabled={savingPreparadas}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
                preparedData.preparadas ? 'bg-green-500' : 'bg-gray-600'
              } ${savingPreparadas ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-ui="inscripciones-prepared-toggle-button"
              type="button"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                  preparedData.preparadas ? 'translate-x-7' : 'translate-x-1'
                }`}
                data-ui="inscripciones-prepared-toggle-indicator"
              />
            </button>
          </div>
        </div>
      )}

      {/* Responsable Toggle - only show when inscripciones are prepared */}
      {responsableData && preparedData?.preparadas && (
        <div className="mb-4 p-4 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="inscripciones-responsable-toggle-card">
          <div className="flex items-center justify-between gap-3" data-ui="inscripciones-responsable-toggle-row">
            <div className="flex items-center gap-3 min-w-0" data-ui="inscripciones-responsable-icon-row">
              <div className="w-6 h-6 shrink-0 flex items-center justify-center" data-ui="inscripciones-responsable-icon">
                {responsableData.value ? (
                  <span className="text-green-400 font-bold text-sm" data-ui="inscripciones-responsable-gr">GR</span>
                ) : (
                  <span className="text-blue-400 font-bold text-sm" data-ui="inscripciones-responsable-aep">AEP</span>
                )}
              </div>
              <div className="min-w-0" data-ui="inscripciones-responsable-text-wrapper">
                <h2 className="text-base font-semibold text-white" data-ui="inscripciones-responsable-title">
                  Gerencia de inscripciones
                </h2>
                <p className="text-sm text-gray-400" data-ui="inscripciones-responsable-description">
                  {responsableData.value
                    ? 'GRStrength gestiona las inscripciones'
                    : 'AEP gestiona las inscripciones'}
                </p>
              </div>
            </div>
            <button
              onClick={onToggleResponsable}
              disabled={savingResponsableUrl}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
                responsableData.value ? 'bg-green-500' : 'bg-blue-500'
              } ${savingResponsableUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-ui="inscripciones-responsable-toggle-button"
              type="button"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                  responsableData.value ? 'translate-x-7' : 'translate-x-1'
                }`}
                data-ui="inscripciones-responsable-toggle-indicator"
              />
            </button>
          </div>

          {/* AEP URL Input - shown when responsable is false */}
          {!responsableData.value && (
            <div className="mt-4 pt-4 border-t border-white/10" data-ui="inscripciones-aep-url-section">
              <label className="block text-sm text-white/60 mb-2" data-ui="inscripciones-aep-url-label">
                URL para inscripciones de la AEP
              </label>
              <div className="flex flex-col sm:flex-row gap-3" data-ui="inscripciones-aep-url-form">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => onUrlInputChange(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
                  data-ui="inscripciones-aep-url-input"
                />
                <Button
                  onClick={() => onSaveUrl(urlInput)}
                  disabled={savingResponsableUrl || !urlInput}
                  className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0"
                  data-ui="inscripciones-aep-url-save-btn"
                >
                  Guardar
                </Button>
              </div>
              {urlSaved && (
                <p className="mt-2 text-sm text-green-400 flex items-center gap-1.5" data-ui="inscripciones-url-saved-confirmation">
                  <Check className="w-4 h-4" data-ui="inscripciones-url-saved-check-icon" />
                  URL guardada correctamente
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default InscripcionesControls;
