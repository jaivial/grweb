import type { ReactNode, KeyboardEvent, MouseEvent } from 'react';

// Modal size types
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

// Modal component props
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  closable?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
  children?: ReactNode;
}

// Modal header props
export interface ModalHeaderProps {
  title: string;
  onClose?: () => void;
  showCloseButton?: boolean;
  className?: string;
}

// Modal body props
export interface ModalBodyProps {
  className?: string;
  children?: ReactNode;
}

// Modal footer props
export interface ModalFooterProps {
  className?: string;
  children?: ReactNode;
}

// Modal size configurations
export const modalSizes: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-4xl',
};