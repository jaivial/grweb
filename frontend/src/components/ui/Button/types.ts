import type { JSX } from 'react';

// Button variant types
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

// Button component props
export interface ButtonProps {
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  isDisabled?: boolean;
  disabled?: boolean;
  leftIcon?: JSX.Element;
  rightIcon?: JSX.Element;
  fullWidth?: boolean;
  children?: JSX.Element | string | (JSX.Element | string)[];
  className?: string;
  class?: string;
  onClick?: () => void;
  key?: number | string;
  'aria-label'?: string;
}

// Button styles configuration
export interface ButtonStyles {
  base: string;
  variants: Record<ButtonVariant, string>;
  sizes: Record<ButtonSize, string>;
  states: {
    disabled: string;
    loading: string;
    fullWidth: string;
  };
}

// Icon position types
export type IconPosition = 'left' | 'right';
