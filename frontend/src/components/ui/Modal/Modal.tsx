import type { ReactNode, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useCallback } from 'react';
import type { ModalProps } from './types';
import { modalSizes } from './types';

/**
 * Modal Component
 * 
 * A dialog overlay component with multiple configurations.
 * 
 * @example
 * // Basic modal
 * <Modal isOpen={isOpen} onClose={handleClose}>
 *   <ModalHeader title="Confirm Action" />
 *   <ModalBody>Are you sure?</ModalBody>
 *   <ModalFooter>
 *     <Button onClick={handleClose}>Cancel</Button>
 *     <Button variant="primary">Confirm</Button>
 *   </ModalFooter>
 * </Modal>
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
  // Handle escape key
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (closeOnEscape && e.key === 'Escape' && closable) {
      onClose();
    }
  }, [closeOnEscape, closable, onClose]);

  // Handle global escape key
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

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  // Handle overlay click
  const handleOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget && closable) {
      onClose();
    }
  };

  // Modal classes
  const modalClasses = [
    'relative',
    'w-full',
    'bg-dark-surface',
    'rounded-2xl',
    'shadow-2xl',
    'border',
    'border-dark-border',
    modalSizes[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div className={modalClasses}>
        {/* Header with title */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
            <h2 id="modal-title" className="text-lg font-semibold text-white">
              {title}
            </h2>
          </div>
        )}
        
        {/* Close button */}
        {showCloseButton && closable && (
          <button
            onClick={onClose}
            className={title ? "absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10" : "absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"}
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Content */}
        <div className={title ? "p-6" : "p-6"}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;