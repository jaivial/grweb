import type { JSX } from 'react';
import { CreditCard, Banknote } from 'lucide-react';
import type { EventoConfigFormData } from '../types';

interface EventoPaymentFieldsProps {
  form: EventoConfigFormData;
  disabled: boolean;
  onUpdate: <K extends keyof EventoConfigFormData>(key: K, value: EventoConfigFormData[K]) => void;
}

const PAYMENT_OPTIONS = [
  {
    key: 'pagoStripeActivo' as const,
    title: 'Pago online con Stripe',
    description: 'Permitir redirección a Stripe Checkout para pagar la inscripción.',
    icon: CreditCard,
  },
  {
    key: 'pagoEfectivoActivo' as const,
    title: 'Pago en efectivo',
    description: 'Permitir pago presencial en la mesa de registro el día del evento.',
    icon: Banknote,
  },
] as const;

export function EventoPaymentFields({ form, disabled, onUpdate }: EventoPaymentFieldsProps): JSX.Element {
  const togglePayment = (key: 'pagoStripeActivo' | 'pagoEfectivoActivo') => {
    const nextValue = !form[key];
    const otherKey = key === 'pagoStripeActivo' ? 'pagoEfectivoActivo' : 'pagoStripeActivo';

    onUpdate(key, nextValue);
    if (!nextValue && !form[otherKey]) {
      onUpdate(otherKey, true);
    }
  };

  return (
    <div className="space-y-3" data-ui="evento-payment-fields">
      {PAYMENT_OPTIONS.map(({ key, title, description, icon: Icon }) => {
        const active = form[key];
        return (
          <div
            key={key}
            className="flex items-center justify-between gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-xl"
            data-ui={`evento-payment-option-${key}`}
          >
            <div className="flex items-start gap-3" data-ui={`evento-payment-copy-${key}`}>
              <div className="mt-0.5 text-red-accent" data-ui={`evento-payment-icon-${key}`}>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div data-ui={`evento-payment-text-${key}`}>
                <p className="text-sm font-semibold text-white/85" data-ui={`evento-payment-title-${key}`}>{title}</p>
                <p className="text-xs text-white/50 mt-1" data-ui={`evento-payment-description-${key}`}>{description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => togglePayment(key)}
              disabled={disabled}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-accent/50 ${active ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
              data-ui={`evento-payment-toggle-${key}`}
              role="switch"
              aria-checked={active}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${active ? 'translate-x-7' : 'translate-x-1'}`}
                data-ui={`evento-payment-knob-${key}`}
              />
            </button>
          </div>
        );
      })}
      <p className="text-xs text-white/45" data-ui="evento-payment-helper">
        Debe quedar al menos una forma de pago activa. Puedes activar ambas opciones a la vez.
      </p>
    </div>
  );
}
