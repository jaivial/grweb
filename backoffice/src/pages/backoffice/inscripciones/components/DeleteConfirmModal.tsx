import type { JSX } from 'react';
import { Modal, Button } from '../../../../components/ui';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  athleteName: string;
  isLoading?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  athleteName,
  isLoading = false,
}: DeleteConfirmModalProps): JSX.Element {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmar eliminación" size="sm">
      <div className="text-center" data-ui="delete-confirm">
        <div className="w-12 h-12 xs:w-16 xs:h-16 mx-auto mb-3 xs:mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 xs:w-8 xs:h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>

        <p className="text-white/70 text-sm xs:text-base mb-4 xs:mb-6" data-ui="delete-message">
          ¿Estás seguro de que quieres eliminar a <span className="font-semibold text-white">{athleteName}</span>? Esta acción no se puede deshacer.
        </p>

        <div className="flex flex-col xs:flex-row gap-3 justify-center" data-ui="delete-actions">
          <Button variant="ghost" onClick={onClose} disabled={isLoading} className="min-h-[44px] text-white/60 hover:text-white hover:bg-white/10">
            Cancelar
          </Button>
          <Button variant="primary" onClick={onConfirm} isLoading={isLoading} className="bg-red-500/90 hover:bg-red-500 min-h-[44px] text-white border-0 shadow-lg shadow-red-500/20">
            Eliminar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default DeleteConfirmModal;
