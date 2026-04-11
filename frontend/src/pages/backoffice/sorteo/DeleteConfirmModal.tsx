import { useState, useCallback, type JSX } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  giftTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmModal({ isOpen, giftTitle, onClose, onConfirm }: DeleteConfirmModalProps): JSX.Element | null {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = useCallback(async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }, [onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      data-testid="delete-confirm-modal"
      data-ui="delete-confirm-overlay"
    >
      <div
        className="bg-dark-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full"
        data-ui="delete-confirm-content"
      >
        <div className="flex items-center gap-3 mb-4" data-ui="delete-confirm-header">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0" data-ui="delete-confirm-icon">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-white" data-ui="delete-confirm-title">Eliminar premio</h3>
        </div>

        <p className="text-gray-400 text-sm mb-6" data-ui="delete-confirm-message">
          ¿Estás seguro de que quieres eliminar <span className="text-white font-semibold" data-ui="delete-confirm-name">{giftTitle}</span>? Esta acción no se puede deshacer.
        </p>

        <div className="flex gap-3" data-ui="delete-confirm-actions">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-xl transition-colors disabled:opacity-50"
            data-testid="delete-confirm-no"
            data-ui="delete-confirm-cancel"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 min-h-[44px] text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="delete-confirm-yes"
            data-ui="delete-confirm-accept"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Eliminando...
              </>
            ) : (
              'Eliminar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
