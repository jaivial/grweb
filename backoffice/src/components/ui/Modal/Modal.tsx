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
  bodyClassName = '',
  footer,
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
      data-ui="modal-overlay"
    >
      <div className={`${modalClasses} flex flex-col max-h-[90dvh]`} data-ui="modal-content">
        {/* Header with title */}
        {title && (
          <div className="shrink-0 flex items-center justify-between px-4 xs:px-6 py-3 xs:py-4 border-b border-white/10" data-ui="modal-header">
            <h2 id="modal-title" className="text-base xs:text-lg font-semibold text-white pr-8" data-ui="modal-title">
              {title}
            </h2>
          </div>
        )}

        {/* Close button */}
        {showCloseButton && closable && (
          <button
            onClick={onClose}
            className="absolute top-3 xs:top-4 right-3 xs:right-4 z-10 text-white/60 hover:text-white hover:bg-white/10 transition-colors p-1.5 rounded-xl"
            aria-label="Close modal"
            data-testid="modal-close-btn"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="modal-close-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Content */}
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 xs:px-6 py-6 xs:py-8 ${bodyClassName}`} data-ui="modal-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 px-4 xs:px-6 py-4 border-t border-white/10" data-ui="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;