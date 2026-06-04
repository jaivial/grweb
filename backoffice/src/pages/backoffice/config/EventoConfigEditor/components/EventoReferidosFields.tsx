import type { JSX } from 'react';
import { Users } from 'lucide-react';
import type { EventoConfigFormData } from '../types';

interface EventoReferidosFieldsProps {
  form: EventoConfigFormData;
  disabled: boolean;
  onUpdate: <K extends keyof EventoConfigFormData>(key: K, value: EventoConfigFormData[K]) => void;
}

export function EventoReferidosFields({ form, disabled, onUpdate }: EventoReferidosFieldsProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="evento-referidos-fields">
      <div className="flex items-start gap-3" data-ui="evento-referidos-copy">
        <div className="mt-0.5 text-red-accent" data-ui="evento-referidos-icon">
          <Users size={18} aria-hidden="true" />
        </div>
        <div data-ui="evento-referidos-text">
          <p className="text-sm font-semibold text-white/85" data-ui="evento-referidos-title">
            Plan de referidos
          </p>
          <p className="text-xs text-white/50 mt-1" data-ui="evento-referidos-description">
            Activa el plan de referidos para esta competición. Los inscritos podrán usar códigos en el formulario público y la pestaña &quot;Plan Referidos&quot; estará disponible en Cupones.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onUpdate('referidosActivo', !form.referidosActivo)}
        disabled={disabled}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${form.referidosActivo ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
        data-ui="evento-referidos-toggle"
        role="switch"
        aria-checked={form.referidosActivo}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${form.referidosActivo ? 'translate-x-7' : 'translate-x-1'}`}
          data-ui="evento-referidos-knob"
        />
      </button>
    </div>
  );
}
