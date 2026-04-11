import type { ReactNode } from 'react';
import type { ModalHeaderProps } from '../types';

/**
 * ModalHeader Component
 * 
 * Header section for modals with title and optional close button.
 */
export function ModalHeader({
  title,
  onClose,
  showCloseButton = true,
  className = '',
}: ModalHeaderProps): ReactNode {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`} data-ui="modal-header">
      <h2 id="modal-title" className="text-xl font-bold text-white" data-ui="modal-header-title">
        {title}
      </h2>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          aria-label="Close"
          data-testid="modal-header-close-btn"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="modal-header-close-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ModalHeader;