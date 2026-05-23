import { useCallback } from 'react';
import { Check, Copy } from 'lucide-react';

interface InscripcionesQrModalProps {
  qrModal: { id: number; code: string; name: string } | null;
  qrCopied: boolean;
  onClose: () => void;
  onCopy: () => void;
}

export function InscripcionesQrModal({ qrModal, qrCopied, onClose, onCopy }: InscripcionesQrModalProps) {
  if (!qrModal) return null;

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50"
      data-ui="inscripciones-qr-modal-overlay"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
        data-ui="inscripciones-qr-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4" data-ui="inscripciones-qr-modal-header">
          <h3 className="text-lg font-semibold text-white" data-ui="inscripciones-qr-modal-title">Codigo QR</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            data-ui="inscripciones-qr-modal-close"
            aria-label="Cerrar"
            type="button"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="inscripciones-qr-modal-close-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-white/60 mb-2" data-ui="inscripciones-qr-modal-athlete-name">{qrModal.name}</p>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4" data-ui="inscripciones-qr-modal-code-box">
          <p className="text-xs text-white/40 mb-1" data-ui="inscripciones-qr-modal-code-label">Codigo</p>
          <p className="font-mono text-base text-white break-all select-all" data-ui="inscripciones-qr-modal-code-value">
            {qrModal.code}
          </p>
        </div>

        <button
          onClick={onCopy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-xl transition-all duration-150 bg-white/10 hover:bg-white/15 text-white border border-white/10"
          data-ui="inscripciones-qr-modal-copy-button"
          type="button"
        >
          {qrCopied ? (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-green-400">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default InscripcionesQrModal;
