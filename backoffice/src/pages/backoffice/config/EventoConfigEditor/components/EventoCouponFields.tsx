import type { JSX } from 'react';
import { TicketPercent } from 'lucide-react';
import type { EventoConfigFormData } from '../types';

interface EventoCouponFieldsProps {
  form: EventoConfigFormData;
  disabled: boolean;
  onUpdate: <K extends keyof EventoConfigFormData>(key: K, value: EventoConfigFormData[K]) => void;
}

export function EventoCouponFields({ form, disabled, onUpdate }: EventoCouponFieldsProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-xl" data-ui="evento-coupon-fields">
      <div className="flex items-start gap-3" data-ui="evento-coupon-copy">
        <div className="mt-0.5 text-red-accent" data-ui="evento-coupon-icon">
          <TicketPercent size={18} aria-hidden="true" />
        </div>
        <div data-ui="evento-coupon-text">
          <p className="text-sm font-semibold text-white/85" data-ui="evento-coupon-title">
            Cupones de descuento
          </p>
          <p className="text-xs text-white/50 mt-1" data-ui="evento-coupon-description">
            Muestra el acordeón de cupón en la inscripción pública y permite validar descuentos.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onUpdate('cuponesDescuentoActivo', !form.cuponesDescuentoActivo)}
        disabled={disabled}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${form.cuponesDescuentoActivo ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
        data-ui="evento-coupon-toggle"
        role="switch"
        aria-checked={form.cuponesDescuentoActivo}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${form.cuponesDescuentoActivo ? 'translate-x-7' : 'translate-x-1'}`}
          data-ui="evento-coupon-knob"
        />
      </button>
    </div>
  );
}
