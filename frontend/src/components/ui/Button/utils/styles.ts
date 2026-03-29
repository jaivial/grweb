import type { ButtonStyles, ButtonVariant, ButtonSize } from '../types';

// Button variant color configurations
const variantColors: Record<ButtonVariant, { bg: string; border: string; text: string; hover: { bg: string; border: string; text: string }; glow: string }> = {
  primary: {
    bg: 'bg-red-accent',
    border: 'border-red-accent',
    text: 'text-white',
    hover: {
      bg: 'hover:bg-red-accent/90',
      border: 'hover:border-red-accent',
      text: 'hover:text-white',
    },
    glow: 'shadow-red-accent',
  },
  secondary: {
    bg: 'bg-dark-red',
    border: 'border-dark-red',
    text: 'text-white',
    hover: {
      bg: 'hover:bg-dark-red/90',
      border: 'hover:border-dark-red',
      text: 'hover:text-white',
    },
    glow: 'shadow-dark-red',
  },
  outline: {
    bg: 'bg-transparent',
    border: 'border-red-accent',
    text: 'text-red-accent',
    hover: {
      bg: 'hover:bg-red-accent/10',
      border: 'hover:border-red-accent',
      text: 'hover:text-red-accent',
    },
    glow: 'shadow-red-accent/50',
  },
  ghost: {
    bg: 'bg-transparent',
    border: 'border-transparent',
    text: 'text-gray-300',
    hover: {
      bg: 'hover:bg-white/5',
      border: 'hover:border-transparent',
      text: 'hover:text-white',
    },
    glow: '',
  },
  danger: {
    bg: 'bg-red-600',
    border: 'border-red-600',
    text: 'text-white',
    hover: {
      bg: 'hover:bg-red-700',
      border: 'hover:border-red-700',
      text: 'hover:text-white',
    },
    glow: 'shadow-red-500/50',
  },
};

// Button size configurations
const sizeConfig: Record<ButtonSize, { padding: string; text: string; iconSize: string; gap: string; rounded: string }> = {
  sm: {
    padding: 'px-3 py-1.5',
    text: 'text-sm',
    iconSize: 'w-4 h-4',
    gap: 'gap-1.5',
    rounded: 'rounded-lg',
  },
  md: {
    padding: 'px-4 py-2',
    text: 'text-base',
    iconSize: 'w-5 h-5',
    gap: 'gap-2',
    rounded: 'rounded-xl',
  },
  lg: {
    padding: 'px-6 py-3',
    text: 'text-lg',
    iconSize: 'w-6 h-6',
    gap: 'gap-2',
    rounded: 'rounded-xl',
  },
  xl: {
    padding: 'px-8 py-4',
    text: 'text-xl',
    iconSize: 'w-7 h-7',
    gap: 'gap-3',
    rounded: 'rounded-2xl',
  },
};

/**
 * Generates complete button classes based on props
 */
export function getButtonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  isDisabled: boolean,
  isLoading: boolean,
  fullWidth: boolean
): string {
  const colors = variantColors[variant];
  const sizeStyles = sizeConfig[size];

  // Base classes
  const baseClasses = [
    'inline-flex',
    'items-center',
    'justify-center',
    'font-bold',
    'uppercase',
    'tracking-wider',
    'transition-all',
    'duration-300',
    'ease-out',
    'transform',
    sizeStyles.rounded,
    sizeStyles.padding,
    sizeStyles.text,
    sizeStyles.gap,
    colors.bg,
    colors.border,
    colors.text,
    colors.hover.bg,
    colors.hover.border,
    colors.hover.text,
  ];

  // Disabled state
  if (isDisabled || isLoading) {
    baseClasses.push(
      'opacity-50',
      'cursor-not-allowed',
      'pointer-events-none'
    );
  }

  // Full width
  if (fullWidth) {
    baseClasses.push('w-full');
  }

  // Hover scale effect (except when disabled)
  if (!isDisabled && !isLoading) {
    baseClasses.push(
      'hover:scale-105',
      'active:scale-95',
      colors.glow
    );
  }

  // Remove duplicates and join
  return [...new Set(baseClasses)].join(' ');
}

/**
 * Gets icon size classes for button icons
 */
export function getIconClasses(size: ButtonSize): string {
  return sizeConfig[size].iconSize;
}

/**
 * Gets spinner size classes
 */
export function getSpinnerSize(size: ButtonSize): 'sm' | 'md' | 'lg' {
  const mapping: Record<ButtonSize, 'sm' | 'md' | 'lg'> = {
    sm: 'sm',
    md: 'sm',
    lg: 'md',
    xl: 'md',
  };
  return mapping[size];
}

/**
 * Button styles configuration object
 */
export const buttonStyles: ButtonStyles = {
  base: 'inline-flex items-center justify-center font-bold uppercase tracking-wider transition-all duration-300 ease-out transform',
  variants: {
    primary: 'bg-red-accent border-red-accent text-white hover:bg-red-accent/90 hover:scale-105 active:scale-95 shadow-red-accent',
    secondary: 'bg-dark-red border-dark-red text-white hover:bg-dark-red/90 hover:scale-105 active:scale-95 shadow-dark-red',
    outline: 'bg-transparent border-red-accent text-red-accent hover:bg-red-accent/10 hover:scale-105 active:scale-95',
    ghost: 'bg-transparent border-transparent text-gray-300 hover:bg-white/5 hover:text-white',
    danger: 'bg-red-600 border-red-600 text-white hover:bg-red-700 hover:scale-105 active:scale-95 shadow-red-500/50',
  },
  sizes: {
    sm: 'px-3 py-1.5 text-sm gap-1.5 rounded-lg',
    md: 'px-4 py-2 text-base gap-2 rounded-xl',
    lg: 'px-6 py-3 text-lg gap-2 rounded-xl',
    xl: 'px-8 py-4 text-xl gap-3 rounded-2xl',
  },
  states: {
    disabled: 'opacity-50 cursor-not-allowed pointer-events-none',
    loading: 'opacity-50 cursor-not-allowed pointer-events-none',
    fullWidth: 'w-full',
  },
};
