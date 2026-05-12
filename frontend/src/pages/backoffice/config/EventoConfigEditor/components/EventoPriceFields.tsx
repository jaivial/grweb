import { useMemo, useCallback } from 'react';
import type { JSX } from 'react';
import type { EventoConfigFormData } from '../types';
import { FIELD_CONFIG } from '../constants';
import { Euro } from 'lucide-react';

interface EventoPriceFieldsProps {
  form: EventoConfigFormData;
  disabled: boolean;
  onUpdate: <K extends keyof EventoConfigFormData>(key: K, value: EventoConfigFormData[K]) => void;
}

export function EventoPriceFields({ form, disabled, onUpdate }: EventoPriceFieldsProps): JSX.Element {
  const priceFields = useMemo(
    () => FIELD_CONFIG.filter(f => f.suffix === 'EUR'),
    []
  );

  return (
    <div className="space-y-4" data-ui="evento-price-fields">
      {priceFields.map(field => (
        <div key={field.key} data-ui={`evento-field-${field.key}`}>
          <label
            htmlFor={`evento-${field.key}`}
            className="block text-sm font-medium text-gray-300 mb-1.5"
            data-ui={`evento-label-${field.key}`}
          >
            <Euro size={14} className="inline mr-1.5 opacity-60" />
            {field.label}
          </label>
          <div className="relative" data-ui={`evento-input-wrapper-${field.key}`}>
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
              className="w-full px-4 py-2.5 pr-12 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              data-ui={`evento-input-${field.key}`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none" data-ui={`evento-suffix-${field.key}`}>
              EUR
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
