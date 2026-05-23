import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode, ChangeEvent } from 'react';

// Input types
export type InputSize = 'sm' | 'md' | 'lg';
export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';

// Input component props
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  type?: InputType;
  size?: InputSize;
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isInvalid?: boolean;
  isDisabled?: boolean;
  fullWidth?: boolean;
  name?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  prefix?: string;
}

// Input wrapper props (for group styling)
export interface InputWrapperProps {
  size?: InputSize;
  isFocused?: boolean;
  isInvalid?: boolean;
  isDisabled?: boolean;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  children: ReactNode;
}

// Textarea props
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  isInvalid?: boolean;
  isDisabled?: boolean;
  fullWidth?: boolean;
  rows?: number;
}

// Checkbox props
export interface CheckboxProps {
  label: string | ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  isDisabled?: boolean;
  error?: string;
  name?: string;
  value?: string;
  className?: string;
  id?: string;
  required?: boolean;
}

// Input validation result
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Input size configurations
export const inputSizes: Record<InputSize, { padding: string; text: string; iconSize: string; rounded: string }> = {
  sm: {
    padding: 'px-3 py-1.5',
    text: 'text-sm',
    iconSize: 'w-4 h-4',
    rounded: 'rounded-lg',
  },
  md: {
    padding: 'px-4 py-2.5',
    text: 'text-base',
    iconSize: 'w-5 h-5',
    rounded: 'rounded-xl',
  },
  lg: {
    padding: 'px-5 py-3',
    text: 'text-lg',
    iconSize: 'w-6 h-6',
    rounded: 'rounded-xl',
  },
};