import type { InputProps, InputWrapperProps } from '../types';

/**
 * Base input styles
 */
export const baseInputStyles = `
  w-full
  bg-white/5
  backdrop-blur-xl
  border
  border-white/10
  rounded-xl
  text-white
  placeholder-white/40
  transition-all
  duration-200
  ease-in-out
  focus:outline-none
  focus:border-red-accent/50
  focus:ring-2
  focus:ring-red-accent/20
  disabled:opacity-50
  disabled:cursor-not-allowed
`;

/**
 * Input size styles
 */
export const inputSizeStyles = {
  sm: {
    padding: 'px-3 py-1.5',
    text: 'text-base',
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

/**
 * Focus ring colors
 */
export const focusRingColors = {
  default: 'focus:ring-red-accent/50',
  error: 'focus:ring-red-500/50',
  success: 'focus:ring-green-500/50',
};

/**
 * Gets input classes based on props
 */
export function getInputClasses(
  size: InputProps['size'] = 'md',
  isInvalid: boolean = false,
  isDisabled: boolean = false,
  hasLeftIcon: boolean = false,
  hasRightIcon: boolean = false
): string {
  const sizeStyles = inputSizeStyles[size];
  
  // Calculate padding based on icons
  let paddingLeft = sizeStyles.padding.split(' ')[0];
  let paddingRight = sizeStyles.padding.split(' ')[0];
  
  if (hasLeftIcon) {
    paddingLeft = `pl-10`;
  }
  
  if (hasRightIcon) {
    paddingRight = `pr-10`;
  }

  const classes = [
    baseInputStyles,
    sizeStyles.text,
    sizeStyles.rounded,
    paddingLeft,
    paddingRight,
    isInvalid
      ? 'border-red-500 focus:border-red-500'
      : 'border-white/10 focus:border-red-accent/50',
    isDisabled ? 'opacity-50 cursor-not-allowed' : '',
    hasLeftIcon ? 'pl-10' : '',
    hasRightIcon ? 'pr-10' : '',
  ].filter(Boolean).join(' ');

  return classes;
}

/**
 * Gets wrapper classes for input group
 */
export function getWrapperClasses(
  isFocused: boolean = false,
  isInvalid: boolean = false
): string {
  return [
    'relative',
    'inline-flex',
    'flex-col',
    'gap-1.5',
  ].join(' ');
}

/**
 * Gets label classes
 */
export function getLabelClasses(isInvalid: boolean = false): string {
  return [
    'text-sm',
    'font-medium',
    isInvalid ? 'text-red-400' : 'text-gray-300',
  ].join(' ');
}

/**
 * Gets error message classes
 */
export function getErrorClasses(): string {
  return [
    'text-sm',
    'text-red-400',
    'mt-1',
  ].join(' ');
}

/**
 * Gets hint text classes
 */
export function getHintClasses(): string {
  return [
    'text-sm',
    'text-gray-500',
    'mt-1',
  ].join(' ');
}

/**
 * Gets icon wrapper classes
 */
export function getIconWrapperClasses(position: 'left' | 'right'): string {
  return [
    'absolute',
    'top-1/2',
    '-translate-y-1/2',
    'text-gray-400',
    'pointer-events-none',
    position === 'left' ? 'left-3' : 'right-3',
  ].join(' ');
}
