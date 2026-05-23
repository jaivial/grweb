import { ReactNode } from 'react';

// Badge variant types
export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

// Badge component props
export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children?: ReactNode;
  icon?: ReactNode;
  class?: string;
  className?: string; // Alias for class
}

// Badge size configurations
export const badgeSizes: Record<BadgeSize, { padding: string; text: string; iconSize: string; rounded: string }> = {
  sm: { padding: 'px-2 py-0.5', text: 'text-xs', iconSize: 'w-3 h-3', rounded: 'rounded-full' },
  md: { padding: 'px-2.5 py-1', text: 'text-sm', iconSize: 'w-4 h-4', rounded: 'rounded-full' },
  lg: { padding: 'px-3 py-1.5', text: 'text-base', iconSize: 'w-5 h-5', rounded: 'rounded-lg' },
};

// Badge variant configurations
export const badgeVariants: Record<BadgeVariant, { bg: string; text: string; icon: string }> = {
  default: { bg: 'bg-gray-700', text: 'text-gray-200', icon: 'text-gray-200' },
  primary: { bg: 'bg-red-accent/20', text: 'text-red-accent', icon: 'text-red-accent' },
  success: { bg: 'bg-green-900/50', text: 'text-green-400', icon: 'text-green-400' },
  warning: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', icon: 'text-yellow-400' },
  error: { bg: 'bg-red-900/50', text: 'text-red-400', icon: 'text-red-400' },
  info: { bg: 'bg-blue-900/50', text: 'text-blue-400', icon: 'text-blue-400' },
};
