import type { ReactNode, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useCallback } from 'react';
import type { ModalProps } from './types';
import { modalSizes } from './types';

/**
 * Modal Component - Glassmorphism style
 */
export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  closable = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  children,
}: ModalProps): ReactNode | null {
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (closeOnEscape && e.key === 'Escape' && closable) {
      onClose();
    }
  }, [closeOnEscape, closable, onClose]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape' && closable) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleGlobalKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, closeOnEscape, closable, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget && closable) {
      onClose();
    }
  };

  const modalClasses = [
    'relative',
    'w-full',
    'bg-white/5',
    'backdrop-blur-2xl',
    'rounded-2xl',
    'shadow-2xl',
    modalSizes[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 xs:p-4 bg-black/60 backdrop-blur-md"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div className={`${modalClasses} max-h-[90vh] overflow-y-auto`}>
        {/* Header with title */}
        {title && (
          <div className="flex items-center justify-between px-4 xs:px-6 py-3 xs:py-4 border-b border-white/10">
            <h2 id="modal-title" className="text-base xs:text-lg font-semibold text-white">
              {title}
            </h2>
          </div>
        )}

        {/* Close button */}
        {showCloseButton && closable && (
          <button
            onClick={onClose}
            className={title ? "absolute top-3 xs:top-4 right-3 xs:right-4 text-white/60 hover:text-white hover:bg-white/10 transition-colors p-1.5 rounded-xl" : "absolute top-3 xs:top-4 right-3 xs:right-4 text-white/60 hover:text-white hover:bg-white/10 transition-colors p-1.5 rounded-xl"}
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Content */}
        <div className="p-4 xs:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;