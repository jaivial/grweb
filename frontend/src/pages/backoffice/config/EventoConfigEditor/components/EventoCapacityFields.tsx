import { useMemo, useCallback } from 'react';
import type { JSX } from 'react';
import type { EventoConfigFormData } from '../types';
import { FIELD_CONFIG } from '../constants';
import { Users } from 'lucide-react';

interface EventoCapacityFieldsProps {
  form: EventoConfigFormData;
  disabled: boolean;
  onUpdate: <K extends keyof EventoConfigFormData>(key: K, value: EventoConfigFormData[K]) => void;
  isFer?: boolean;
}

export function EventoCapacityFields({ form, disabled, onUpdate, isFer }: EventoCapacityFieldsProps): JSX.Element {
  const capacityFields = useMemo(
    () => {
      let fields = FIELD_CONFIG.filter(f => f.suffix === null);
      if (isFer) {
        // FER: only show aforoMaximo, not maxTicketsPorPersona
        fields = fields.filter(f => f.key === 'aforMaximo');
      }
      return fields;
    },
    [isFer]
  );

  return (
    <div className="space-y-4" data-ui="evento-capacity-fields">
      {capacityFields.map(function(field) {
        return (
        <div key={field.key} data-ui={`evento-field-${field.key}`}>
          <label
            htmlFor={`evento-${field.key}`}
            className="block text-sm font-medium text-gray-300 mb-1.5"
            data-ui={`evento-label-${field.key}`}
          >
            <Users size={14} className="inline mr-1.5 opacity-60" />
            {field.label}
          </label>
          <input
            id={`evento-${field.key}`}
            type="number"
            min={field.min}
            step={field.step}
            value={form[field.key]}
            onChange={useCallback(
              (e: React.ChangeEvent<HTMLInputElement>) => onUpdate(field.key, Number(e.target.value)),
              [onUpdate, field.key]
            )}
            disabled={disabled}
            className="w-full px-4 py-2.5 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            data-ui={`evento-input-${field.key}`}
          />
        </div>
        );
      })}

      {!isFer && (
      <div className="pt-4 border-t border-white/10" data-ui="evento-toggle-section">
        <div className="flex items-center justify-between" data-ui="evento-toggle-row">
          <div data-ui="evento-toggle-info">
            <p className="text-white font-medium" data-ui="evento-toggle-title">Inscripción Abierta</p>
            <p className="text-xs text-gray-400" data-ui="evento-toggle-desc">
              Permitir nuevas inscripciones
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer" data-ui="evento-toggle-label">
            <input
              type="checkbox"
              checked={form.inscripcionAbierta}
              onChange={useCallback(
                (e: React.ChangeEvent<HTMLInputElement>) => onUpdate('inscripcionAbierta', e.target.checked),
                [onUpdate]
              )}
              disabled={disabled}
              className="sr-only peer"
              data-ui="evento-toggle-checkbox"
            />
            <div
              className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-accent"
              data-ui="evento-toggle-track"
            />
          </label>
        </div>
        <div className="mt-2" data-ui="evento-toggle-status">
          {form.inscripcionAbierta ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-green-500/20 text-green-400" data-ui="evento-badge-open">
              Abierta
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-red-500/20 text-red-400" data-ui="evento-badge-closed">
              Cerrada
            </span>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
