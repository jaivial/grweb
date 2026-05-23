import type { ReactNode } from 'react';

// Icon name types
export type IconName = 
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'check'
  | 'x'
  | 'plus'
  | 'minus'
  | 'search'
  | 'menu'
  | 'close'
  | 'user'
  | 'users'
  | 'ticket'
  | 'dollar'
  | 'calendar'
  | 'clock'
  | 'mail'
  | 'phone'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'share'
  | 'download'
  | 'upload'
  | 'refresh'
  | 'settings'
  | 'logout'
  | 'lock'
  | 'unlock'
  | 'eye'
  | 'eye-off'
  | 'trash'
  | 'edit'
  | 'copy'
  | 'warning'
  | 'info'
  | 'question'
  | 'sparkles'
  | 'trophy'
  | 'star'
  | 'heart'
  | 'fire'
  | 'lightning'
  | 'shield'
  | 'globe'
  | 'map-pin'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'external-link'
  | 'zap'
  | 'target'
  | 'award'
  | 'trending-up'
  | 'trending-down'
  | 'activity'
  | 'bar-chart'
  | 'pie-chart'
  | 'filter'
  | 'sort'
  | 'grid'
  | 'list'
  | 'home'
  | 'dashboard'
  | 'credit-card'
  | 'credit-card-outline'
  | 'file-text';

// Icon size types
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// Icon component props
export interface IconProps {
  name: IconName;
  size?: IconSize;
  color?: IconColor;
  className?: string;
  strokeWidth?: number;
}

// Icon size configurations
export const iconSizes: Record<IconSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-12 h-12',
};

// Icon color configurations
export const iconColors: Record<string, string> = {
  'inherit': 'text-inherit',
  'current': 'text-current',
  'red-accent': 'text-red-accent',
  'dark-red': 'text-dark-red',
  'white': 'text-white',
  'gray': 'text-gray-400',
  'red': 'text-red-400',
  'green': 'text-green-400',
  'yellow': 'text-yellow-400',
  'blue': 'text-blue-400',
  'pink': 'text-pink-400',
};

// Icon color type
export type IconColor = keyof typeof iconColors;