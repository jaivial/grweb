import type { ReactNode } from 'react';
import type { ModalBodyProps } from '../types';

/**
 * ModalBody Component
 * 
 * Body section for modals.
 */
export function ModalBody({
  className = '',
  children,
}: ModalBodyProps): ReactNode {
  return (
    <div className={`text-gray-300 ${className}`} data-ui="modal-body">
      {children}
    </div>
  );
}

export default ModalBody;