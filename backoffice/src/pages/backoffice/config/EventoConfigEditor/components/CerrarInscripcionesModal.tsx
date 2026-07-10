import { useState } from 'react';
import type { JSX } from 'react';
import { Clock, PackageX, Lock } from 'lucide-react';
import { Modal } from '../../../../../components/ui/Modal';

interface CerrarInscripcionesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (soldOut: boolean) => void;
  disabled?: boolean;
}

type Reason = 'temporal' | 'soldout';

const OPTIONS: Array<{
  reason: Reason;
  label: string;
  description: string;
  icon: typeof Clock;
  testId: string;
}> = [
  {
    reason: 'temporal',
    label: 'Cerrar temporalmente',
    description: 'Las inscripciones se reabrirán más adelante.',
    icon: Clock,
    testId: 'cerrar-option-temporal',
  },
  {
    reason: 'soldout',
    label: 'Sold Out',
    description: 'Todas las plazas se han agotado.',
    icon: PackageX,
    testId: 'cerrar-option-soldout',
  },
];

export function CerrarInscripcionesModal({
  isOpen,
  onClose,
  onConfirm,
  disabled = false,
}: CerrarInscripcionesModalProps): JSX.Element {
  const [reason, setReason] = useState<Reason>('temporal');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="¿Por qué quieres cerrar inscripciones?"
      size="md"
    >
      <div className="space-y-3" data-testid="cerrar-inscripciones-modal" data-ui="cerrar-inscripciones-modal">
        {OPTIONS.map(function (option) {
          const Icon = option.icon;
          const selected = reason === option.reason;
          return (
            <button
              key={option.reason}
              type="button"
              onClick={() => setReason(option.reason)}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                selected
                  ? 'border-red-accent bg-red-accent/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              data-testid={option.testId}
              data-ui={option.testId}
              aria-pressed={selected}
            >
              <span
                className={`mt-0.5 flex-shrink-0 ${selected ? 'text-red-accent' : 'text-white/60'}`}
              >
                <Icon size={20} />
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{option.label}</span>
                <span className="block text-xs text-white/50 mt-0.5">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white/70 hover:text-white rounded-lg transition-all"
          data-ui="cerrar-inscripciones-cancel"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason === 'soldout')}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="cerrar-inscripciones-confirm"
          data-ui="cerrar-inscripciones-confirm"
        >
          <Lock size={16} />
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export default CerrarInscripcionesModal;
