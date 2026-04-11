import type { ReactNode } from 'react';
import type { ModalFooterProps } from '../types';

/**
 * ModalFooter Component
 * 
 * Footer section for modals, typically used for actions.
 */
export function ModalFooter({
  className = '',
  children,
}: ModalFooterProps): ReactNode {
  return (
    <div className={`mt-6 pt-4 border-t border-dark-border flex items-center justify-end gap-3 ${className}`} data-ui="modal-footer">
      {children}
    </div>
  );
}

export default ModalFooter;